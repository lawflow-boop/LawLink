"use server";

/**
 * v0.22: cron 定时作业的手动触发入口（admin only）
 *
 * 用于测试 / 应急触发，不等到定时点。
 */
import { requireSession } from "@/lib/auth/session";
import { runWeeklyReportPush } from "@/server/reports/push-weekly";
import { scanArchiveOverdue } from "./jobs/archive-overdue";
import { runAuditCleanup } from "./jobs/audit-cleanup";

async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅管理员 / 主任律师可触发");
  }
  return session;
}

export async function triggerWeeklyReportNow() {
  const session = await requireAdmin();
  return runWeeklyReportPush(session.user.id);
}

export async function triggerArchiveOverdueScanNow() {
  await requireAdmin();
  return scanArchiveOverdue();
}

export async function triggerAuditCleanupNow() {
  await requireAdmin();
  return runAuditCleanup();
}
