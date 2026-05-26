/**
 * AuditLog 保留策略：每天 03:00 删超过 N 天的旧记录。
 *
 * 默认 365 天；环境变量 AUDIT_RETENTION_DAYS 可覆盖（如设 90 = 3 个月）。
 * AuditLog 表无 FK 反向引用，安全 hard delete。
 */
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

const DEFAULT_RETENTION_DAYS = 365;

export type AuditCleanupResult = {
  retentionDays: number;
  deleted: number;
  cutoffDate: string;
};

export async function runAuditCleanup(): Promise<AuditCleanupResult> {
  const envDays = Number(process.env.AUDIT_RETENTION_DAYS);
  const retentionDays =
    Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);

  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } }
  });

  // 自己写一条 audit 留痕（这条 365 天后又会被自己删，但短期内可查）
  await audit({
    userId: null,
    action: "AUDIT_CLEANUP_CRON",
    targetType: "AuditLog",
    targetId: "retention",
    detail: {
      retentionDays,
      cutoffDate: cutoff.toISOString().slice(0, 10),
      deleted: count
    }
  });

  return {
    retentionDays,
    deleted: count,
    cutoffDate: cutoff.toISOString().slice(0, 10)
  };
}
