"use server";

import type { NotificationPriority, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/server/notifications/create";

type ApprovalNotificationInput = {
  roles: UserRole[];
  excludeUserId?: string;
  title: string;
  content?: string;
  href: string;
  refType: string;
  refId: string;
  priority?: NotificationPriority;
};

type DirectApprovalNotificationInput = Omit<ApprovalNotificationInput, "roles"> & {
  userIds: string[];
};

async function notifyUsers(input: DirectApprovalNotificationInput) {
  const uniqueUserIds = Array.from(new Set(input.userIds)).filter(
    (id) => id && id !== input.excludeUserId
  );
  if (uniqueUserIds.length === 0) return;

  await Promise.all(
    uniqueUserIds.map((userId) =>
      createNotification({
        userId,
        type: "SYSTEM",
        priority: input.priority ?? "HIGH",
        title: input.title,
        content: input.content,
        href: input.href,
        refType: input.refType,
        refId: input.refId
      })
    )
  );
}

export async function notifyRoleApprovers(input: ApprovalNotificationInput) {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: Array.from(new Set(input.roles)) }
    },
    select: { id: true }
  });

  await notifyUsers({
    ...input,
    userIds: users.map((user) => user.id)
  });
}

export async function notifyDirectApprovers(input: DirectApprovalNotificationInput) {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      id: { in: Array.from(new Set(input.userIds)) }
    },
    select: { id: true }
  });

  await notifyUsers({
    ...input,
    userIds: users.map((user) => user.id)
  });
}
