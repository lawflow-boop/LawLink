import { Sparkles, AlertTriangle, FileText } from "lucide-react";
import type { MatterReviewSummary } from "@/server/ai/matter-review-summary";
import { cn } from "@/lib/utils";
import { BatchReviewButton } from "./batch-review-button";

export function ReviewSummaryCard({
  summary,
  matterId
}: {
  summary: MatterReviewSummary;
  matterId: string;
}) {
  const hasRecords = summary.recordCount > 0;

  // 即使没记录也渲染一个轻量入口供律师启动批量审查
  if (!hasRecords) {
    return (
      <section className="flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50/30 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          本案尚未做过 AI 文书审查
        </span>
        <BatchReviewButton matterId={matterId} />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          AI 审查总览
        </h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground">
            {summary.documentCount} 份文档 · {summary.recordCount} 次审查 · 共 {summary.totalItems} 条
            {summary.latestReviewedAt && (
              <span className="ml-2">最新 {summary.latestReviewedAt.toLocaleDateString("zh-CN")}</span>
            )}
          </span>
          <BatchReviewButton matterId={matterId} />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <SevTile sev="HIGH" n={summary.bySeverity.HIGH} />
        <SevTile sev="MEDIUM" n={summary.bySeverity.MEDIUM} />
        <SevTile sev="LOW" n={summary.bySeverity.LOW} />
      </div>

      {summary.topHighItems.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] text-rose-700">
            <AlertTriangle className="h-3 w-3" />
            最近 HIGH 风险（最多 3 条）
          </div>
          <ul className="space-y-1">
            {summary.topHighItems.map((it, i) => (
              <li
                key={`${it.documentId}-${i}`}
                className="rounded border border-rose-200/60 bg-background px-2 py-1.5 text-xs"
              >
                <div className="font-medium">{it.title}</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/70">
                  {it.detail}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <FileText className="h-2.5 w-2.5" />
                  <span className="truncate">{it.documentName}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SevTile({ sev, n }: { sev: "HIGH" | "MEDIUM" | "LOW"; n: number }) {
  const meta = {
    HIGH: { label: "高风险", cls: "border-rose-300 bg-rose-50 text-rose-700" },
    MEDIUM: { label: "中风险", cls: "border-amber-300 bg-amber-50 text-amber-700" },
    LOW: { label: "低风险", cls: "border-slate-300 bg-slate-50 text-slate-600" }
  }[sev];
  return (
    <div className={cn("rounded border px-2 py-1.5", meta.cls)}>
      <div className="text-[10px] opacity-80">{meta.label}</div>
      <div className="mt-0.5 font-mono text-base leading-none">{n}</div>
    </div>
  );
}
