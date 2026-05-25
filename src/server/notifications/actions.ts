"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";

export async function getNotifications(params?: { unreadOnly?: boolean; limit?: number }) {
  const session = await requireSession();
  const limit = params?.limit ?? 30;

  return prisma.notification.findMany({
    where: {
      userId: session.user.id,
      ...(params?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount() {
  const session = await requireSession();
  return prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });
}

export async function markNotificationRead(id: string) {
  const session = await requireSession();
  const notif = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!notif) throw new Error("通知不存在");

  return prisma.notification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  return { ok: true };
}
