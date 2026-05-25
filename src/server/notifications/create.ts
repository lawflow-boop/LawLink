"use server";

import { prisma } from "@/lib/prisma";

type CreateNotificationInput = {
  userId: string;
  type: string;
  priority?: string;
  title: string;
  content?: string;
  href?: string;
  refType?: string;
  refId?: string;
};

/** 通用通知创建 helper，被其他 server action 调用 */
export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type as "PRESERVATION_EXPIRY" | "HEARING_REMINDER" | "DEADLINE_REMINDER" | "SEAL_STATUS_CHANGE" | "SMS_ARRIVAL" | "TASK_ASSIGNED" | "SYSTEM",
      priority: (input.priority ?? "NORMAL") as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      title: input.title,
      content: input.content,
      href: input.href,
      refType: input.refType,
      refId: input.refId,
    },
  });
}
