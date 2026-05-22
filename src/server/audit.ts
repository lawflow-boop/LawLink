import { prisma } from "@/lib/prisma";

/**
 * 写一条审计日志。失败不抛错（业务流程不应被审计失败阻塞）。
 *
 * 用法：
 *   await audit({ userId, action: "CLIENT_CREATE", targetType: "Client", targetId, detail })
 */
export async function audit(params: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detail: params.detail as object | undefined,
        ip: params.ip,
        userAgent: params.userAgent
      }
    });
  } catch (err) {
    console.error("[audit] 写入失败：", err);
  }
}
