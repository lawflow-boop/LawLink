"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  batchReviewMatterDocuments,
  type BatchReviewSummary
} from "@/server/ai/batch-review-matter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export function BatchReviewButton({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchReviewSummary | null>(null);
  const [open, setOpen] = useState(false);

  function run() {
    if (
      !confirm("将对本案最多 5 份未审查过的文档发起 AI 审查（会消耗 AI tokens），继续？")
    )
      return;
    startTransition(async () => {
      try {
        const r = await batchReviewMatterDocuments({ matterId });
        setResult(r);
        setOpen(true);
        const totalErrors = r.errors.length;
        if (r.reviewed.length === 0 && totalErrors === 0) {
          toast.info("没有需要审查的新文档");
        } else if (totalErrors > 0) {
          toast.warning(
            `已审查 ${r.reviewed.length}，失败 ${totalErrors}`
          );
        } else {
          toast.success(`已审查 ${r.reviewed.length} 份文档`);
        }
        router.refresh();
      } catch (err) {
        toast.error("批量审查失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={run}
        disabled={pending}
        className="gap-1"
        title="对本案未审查过的文档批量发起 AI 审查（单次最多 5 个）"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        AI 复检全部
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-500" />
              AI 复检结果
            </DialogTitle>
            <DialogDescription>
              单次最多审查 5 份文档；已审过的 7 天内跳过
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-3 text-xs">
              {result.reviewed.length > 0 && (
                <section>
                  <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Check className="h-3 w-3" />
                    已审查（{result.reviewed.length}）
                  </h4>
                  <ul className="space-y-1">
                    {result.reviewed.map((r) => (
                      <li
                        key={r.documentId}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5"
                      >
                        <span className="truncate">{r.documentName}</span>
                        <span className="ml-2 font-mono text-[10px] text-emerald-700">
                          {r.itemCount} 条问题
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.errors.length > 0 && (
                <section>
                  <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
                    <X className="h-3 w-3" />
                    失败（{result.errors.length}）
                  </h4>
                  <ul className="space-y-1">
                    {result.errors.map((r) => (
                      <li
                        key={r.documentId}
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-700"
                      >
                        <div className="font-medium">{r.documentName}</div>
                        <div className="text-[10px]">{r.error}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.skipped.length > 0 && (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    跳过（{result.skipped.length}）
                  </h4>
                  <ul className="max-h-32 space-y-1 overflow-y-auto">
                    {result.skipped.map((s) => (
                      <li
                        key={s.documentId}
                        className="rounded border border-border bg-muted/30 px-2 py-1 text-muted-foreground"
                      >
                        <span className="truncate">{s.documentName}</span>
                        <span className="ml-2 text-[10px]">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
