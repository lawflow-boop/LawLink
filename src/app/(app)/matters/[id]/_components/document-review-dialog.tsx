"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  FileWarning,
  BookmarkPlus,
  Check,
  History,
  ChevronLeft
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { reviewDocument, type ReviewResult } from "@/server/ai/review-document";
import { saveReviewToMatter } from "@/server/ai/save-review";
import {
  listReviewHistory,
  getReviewRecord,
  type ReviewHistoryEntry
} from "@/server/ai/review-history";
import type {
  ReviewItem,
  ReviewType,
  ReviewSeverity
} from "@/lib/ai/review-parser";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  documentId: string | null;
  matterId: string;
  onOpenChange: (open: boolean) => void;
};

const typeMeta: Record<ReviewType, { label: string; Icon: typeof AlertTriangle; color: string }> = {
  MISSING: { label: "缺失要素", Icon: FileWarning, color: "text-amber-600" },
  RISK: { label: "法律风险", Icon: AlertTriangle, color: "text-rose-600" },
  ISSUE: { label: "条款问题", Icon: AlertCircle, color: "text-orange-600" },
  SUGGESTION: { label: "优化建议", Icon: Lightbulb, color: "text-sky-600" }
};

const sevStyle: Record<ReviewSeverity, { label: string; cls: string }> = {
  HIGH: { label: "高", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  MEDIUM: { label: "中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  LOW: { label: "低", cls: "bg-slate-50 text-slate-600 border-slate-200" }
};

const TYPE_ORDER: ReviewType[] = ["MISSING", "RISK", "ISSUE", "SUGGESTION"];

type View =
  | { kind: "list" } // 历史 + 新审查入口
  | { kind: "result"; result: ReviewResult; isNew: boolean }
  | { kind: "history-detail"; entry: ReviewHistoryEntry; items: ReviewItem[]; documentName: string };

export function DocumentReviewDialog({
  open,
  documentId,
  matterId,
  onOpenChange
}: Props) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 打开/换 doc 时重置 + 拉历史
  useEffect(() => {
    if (!open || !documentId) return;
    let cancelled = false;
    setView({ kind: "list" });
    setHistory([]);
    setError(null);
    setSaved(false);
    setLoadingHistory(true);
    listReviewHistory({ documentId })
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        // 历史查询失败不阻塞新审查
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  async function runNewReview() {
    if (!documentId) return;
    setReviewing(true);
    setError(null);
    try {
      const r = await reviewDocument({ documentId });
      setView({ kind: "result", result: r, isNew: true });
      setSaved(false);
      // 重新拉历史（新审查已落库）
      listReviewHistory({ documentId }).then(setHistory).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 审查失败");
    } finally {
      setReviewing(false);
    }
  }

  async function openHistoryDetail(entry: ReviewHistoryEntry) {
    try {
      const rec = await getReviewRecord({ recordId: entry.id });
      if (!rec) {
        toast.error("记录不存在或已删除");
        return;
      }
      setView({
        kind: "history-detail",
        entry,
        items: rec.items,
        documentName: rec.documentName
      });
      setSaved(false);
    } catch (err) {
      toast.error("加载历史详情失败", {
        description: err instanceof Error ? err.message : ""
      });
    }
  }

  async function handleSave() {
    if (view.kind !== "result") return;
    setSaving(true);
    try {
      const res = await saveReviewToMatter({
        matterId,
        reviewedDocId: documentId!,
        reviewedDocName: view.result.documentName,
        items: view.result.items
      });
      setSaved(true);
      toast.success("已保存审查结果到本案", { description: res.documentName });
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : ""
      });
    } finally {
      setSaving(false);
    }
  }

  // 当前要展示的 items（list view 无内容）
  const currentItems: ReviewItem[] | null =
    view.kind === "result" ? view.result.items : view.kind === "history-detail" ? view.items : null;
  const currentDocName =
    view.kind === "result"
      ? view.result.documentName
      : view.kind === "history-detail"
        ? view.documentName
        : "";

  const grouped =
    currentItems !== null
      ? TYPE_ORDER.map((t) => ({
          type: t,
          items: currentItems.filter((i) => i.type === t)
        })).filter((g) => g.items.length > 0)
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {view.kind !== "list" && (
              <button
                type="button"
                onClick={() => setView({ kind: "list" })}
                className="text-muted-foreground hover:text-foreground"
                title="返回列表"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI 文书审查
          </DialogTitle>
          <DialogDescription className="text-xs">
            {view.kind === "list" && "查看历史或发起新审查"}
            {view.kind === "result" &&
              `${view.result.documentName}${view.result.truncated ? "（已截断前 6000 字）" : ""}`}
            {view.kind === "history-detail" &&
              `${currentDocName} · 历史 ${view.entry.reviewedAt.toLocaleString("zh-CN")}`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {/* ====== List view ====== */}
          {view.kind === "list" && (
            <div className="space-y-4">
              <Button
                type="button"
                onClick={runNewReview}
                disabled={reviewing}
                className="w-full gap-1.5"
              >
                {reviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {history.length === 0 ? "开始 AI 审查" : "重新 AI 审查"}
              </Button>

              {error && (
                <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  审查历史
                  <span className="font-mono text-[10px]">
                    {loadingHistory ? "…" : history.length}
                  </span>
                </h4>
                {loadingHistory ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">加载中…</p>
                ) : history.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    还没有 AI 审查记录
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {history.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => openHistoryDetail(h)}
                          className="flex w-full items-center justify-between gap-2 rounded border border-border bg-background px-3 py-2 text-left text-xs transition hover:border-foreground/30 hover:bg-muted/30"
                        >
                          <div className="flex flex-col">
                            <span className="font-mono text-foreground">
                              {h.reviewedAt.toLocaleString("zh-CN")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {h.reviewedBy.name} · {h.itemCount} 条
                              {h.truncated ? " · 已截断" : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {h.severityCounts.HIGH > 0 && (
                              <SevCount sev="HIGH" n={h.severityCounts.HIGH} />
                            )}
                            {h.severityCounts.MEDIUM > 0 && (
                              <SevCount sev="MEDIUM" n={h.severityCounts.MEDIUM} />
                            )}
                            {h.severityCounts.LOW > 0 && (
                              <SevCount sev="LOW" n={h.severityCounts.LOW} />
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ====== Result / history detail view ====== */}
          {currentItems !== null &&
            (currentItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {view.kind === "result" && view.isNew
                  ? "AI 未发现明显问题（不代表无瑕疵，请律师人工复核）"
                  : "本次审查无条目"}
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map((g) => {
                  const meta = typeMeta[g.type];
                  const Icon = meta.Icon;
                  return (
                    <section key={g.type}>
                      <h4
                        className={cn(
                          "mb-2 flex items-center gap-1.5 text-xs font-medium",
                          meta.color
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {g.items.length}
                        </span>
                      </h4>
                      <ul className="space-y-2">
                        {g.items.map((item, idx) => (
                          <ReviewItemRow key={idx} item={item} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ))}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            {view.kind === "result"
              ? `分析字符数：${view.result.textPreviewChars}`
              : view.kind === "history-detail"
                ? `分析字符数：${view.entry.textPreviewChars}`
                : ""}
          </span>
          <div className="flex items-center gap-2">
            {view.kind === "result" && view.result.items.length > 0 && (
              saved ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700">
                  <Check className="h-3 w-3" />
                  已存到本案
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-3 w-3" />
                  )}
                  存到本案
                </Button>
              )
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewItemRow({ item }: { item: ReviewItem }) {
  const sev = sevStyle[item.severity];
  return (
    <li className="rounded border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{item.title}</span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none",
            sev.cls
          )}
        >
          {sev.label}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/75">{item.detail}</p>
    </li>
  );
}

function SevCount({ sev, n }: { sev: ReviewSeverity; n: number }) {
  return (
    <span className={cn("rounded border px-1 py-0.5 text-[10px] leading-none", sevStyle[sev].cls)}>
      {sevStyle[sev].label}
      <span className="ml-0.5 font-mono">{n}</span>
    </span>
  );
}
