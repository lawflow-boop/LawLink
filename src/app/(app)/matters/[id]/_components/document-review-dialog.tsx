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
  Check
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

export function DocumentReviewDialog({
  open,
  documentId,
  matterId,
  onOpenChange
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !documentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    reviewDocument({ documentId })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "AI 审查失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  async function handleSave() {
    if (!result || !documentId) return;
    setSaving(true);
    try {
      const res = await saveReviewToMatter({
        matterId,
        reviewedDocId: documentId,
        reviewedDocName: result.documentName,
        items: result.items
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

  const grouped = result
    ? TYPE_ORDER.map((t) => ({
        type: t,
        items: result.items.filter((i) => i.type === t)
      })).filter((g) => g.items.length > 0)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI 文书审查
          </DialogTitle>
          <DialogDescription className="text-xs">
            {result
              ? `${result.documentName}${result.truncated ? "（已截断前 6000 字）" : ""}`
              : "正在分析文书…"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在提取文本并送 AI 审查
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-rose-600">{error}</div>
          ) : result && result.items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              AI 未发现明显问题（不代表无瑕疵，请律师人工复核）
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
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            {result ? `分析字符数：${result.textPreviewChars}` : ""}
          </span>
          <div className="flex items-center gap-2">
            {result && result.items.length > 0 && (
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
