/**
 * Next.js instrumentation hook：进程启动时一次性副作用注册。
 * 启用方式：next.config.mjs experimental.instrumentationHook = true
 *
 * 当前唯一职责：注册 cron 定时作业（仅生产 / nodejs runtime）。
 * dev 模式跳过，避免开发时误推真实通知。
 *
 * ⚠ 重要：Next 14.x 即使 register() 内用了 dynamic import，dev 模式仍会扫描
 * 依赖链给 edge runtime 编译一遍（next-auth/bcryptjs 依赖 node:crypto 会 500）。
 * 解决方法：dev 模式下不光跳过执行，连 import 路径都不要写——彻底 noop。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_CRON === "1") return;

  // 仅生产 nodejs 运行时才解析这个模块路径
  const mod = await import(/* webpackIgnore: true */ "./server/cron/scheduler");
  (mod as { registerCronJobs: () => void }).registerCronJobs();
}
