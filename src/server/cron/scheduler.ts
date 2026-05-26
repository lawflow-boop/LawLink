/**
 * v0.22: 进程内 cron 调度（node-cron）
 *
 * 在 next start 进程启动时通过 instrumentation.ts → register() 调用。
 *
 * 限制：
 * - **仅在 next start（生产）下生效**。dev 模式不跑（避免开发时误推通知）。
 * - 不支持 serverless（Vercel Edge / Lambda）。LawLink 自部署场景默认是
 *   长驻 Node 进程，OK。
 * - 进程重启会重新注册任务；如果在任务触发时间点重启，可能错过本次。
 *
 * 当前任务：
 * - 每周一 09:00 推送本周报告
 * - 每天 09:00 扫描归档逾期 30 天的案件
 *
 * 时区：所有 cron 用 Asia/Shanghai（避免容器 UTC 跑出来 8 小时偏差）。
 */
import cron from "node-cron";
import { runWeeklyReportPush } from "@/server/reports/push-weekly";
import { scanArchiveOverdue } from "./jobs/archive-overdue";
import { runAuditCleanup } from "./jobs/audit-cleanup";

const TIMEZONE = "Asia/Shanghai";
let started = false;

export function registerCronJobs() {
  if (started) {
    console.warn("[cron] registerCronJobs 重复调用，跳过");
    return;
  }
  started = true;

  // 每周一 09:00 推周报
  cron.schedule(
    "0 9 * * 1",
    async () => {
      const now = new Date().toISOString();
      console.log(`[cron] ${now} 触发：周报推送`);
      try {
        const r = await runWeeklyReportPush(null);
        console.log(
          `[cron] 周报推送完成：${r.succeeded} 成功 / ${r.failed.length} 失败`
        );
      } catch (err) {
        console.error("[cron] 周报推送异常：", err);
      }
    },
    { timezone: TIMEZONE }
  );

  // 每天 09:00 扫归档逾期
  cron.schedule(
    "0 9 * * *",
    async () => {
      const now = new Date().toISOString();
      console.log(`[cron] ${now} 触发：归档逾期扫描`);
      try {
        const r = await scanArchiveOverdue();
        console.log(
          `[cron] 归档逾期扫描完成：${r.scanned} 候选 / ${r.notified} 通知 / ${r.suppressed} 抑制`
        );
      } catch (err) {
        console.error("[cron] 归档逾期扫描异常：", err);
      }
    },
    { timezone: TIMEZONE }
  );

  // 每天 03:00 清理超过 N 天的 AuditLog（默认 365 天，AUDIT_RETENTION_DAYS 可覆盖）
  cron.schedule(
    "0 3 * * *",
    async () => {
      const now = new Date().toISOString();
      console.log(`[cron] ${now} 触发：AuditLog 清理`);
      try {
        const r = await runAuditCleanup();
        console.log(
          `[cron] AuditLog 清理完成：保留 ${r.retentionDays} 天，删除 ${r.deleted} 条`
        );
      } catch (err) {
        console.error("[cron] AuditLog 清理异常：", err);
      }
    },
    { timezone: TIMEZONE }
  );

  console.log("[cron] 已注册 3 个定时任务（周报推送 / 归档逾期扫描 / AuditLog 清理），时区 Asia/Shanghai");
}
