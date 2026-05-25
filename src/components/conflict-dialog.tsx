"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Info
} from "lucide-react";
import type { ConflictSeverity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { runCheckAndSave } from "@/server/conflicts/actions";

type QueryRow = { name: string; idNumber: string };

type HitResult = {
  id: string;
  hitType: string;
  targetType: string;
  targetId: string;
  matchedName: string;
  matchedField: string;
  matchedValue: string;
  matchedRatio: number | null;
  severity: ConflictSeverity;
  reason: string;
};

type SameNameClient = { clientId: string; name: string };
type IdMatchedClient = { clientId: string; name: string; idNumber: string };

const severityStyle: Record<ConflictSeverity, { color: string; bg: string; label: string }> = {
  BLOCKING: { color: "#F87171", bg: "rgba(248,113,113,0.12)", label: "阻塞" },
  HIGH: { color: "#FB923C", bg: "rgba(251,146,60,0.12)", label: "高" },
  MEDIUM: { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", label: "中" },
  LOW: { color: "#4ADE80", bg: "rgba(74,222,128,0.12)", label: "低" }
};

export function ConflictDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [queries, setQueries] = useState<QueryRow[]>([{ name: "", idNumber: "" }]);
  const [results, setResults] = useState<HitResult[] | null>(null);
  const [sameName, setSameName] = useState<SameNameClient[]>([]);
  const [idMatched, setIdMatched] = useState<IdMatchedClient[]>([]);
  const [hasRun, setHasRun] = useState(false);

  function reset() {
    setQueries([{ name: "", idNumber: "" }]);
    setResults(null);
    setSameName([]);
    setIdMatched([]);
    setHasRun(false);
  }

  function handleRun() {
    const cleaned = queries
      .map((q) => ({ name: q.name.trim(), idNumber: q.idNumber.trim() }))
      .filter((q) => q.name || q.idNumber);
    if (cleaned.length === 0) {
      toast.warning("请至少填写一个姓名或证件号");
      return;
    }

    startTransition(async () => {
      try {
        const res = await runCheckAndSave({ queries: cleaned });
        setResults(res.hits);
        setSameName(res.sameNameClients ?? []);
        setIdMatched(res.idMatchedClients ?? []);
        setHasRun(true);
        const extra =
          res.idMatchedClients?.length || res.sameNameClients?.length
            ? `（同名 ${res.sameNameClients?.length ?? 0} · 证件号匹配 ${res.idMatchedClients?.length ?? 0}）`
            : "";
        if (res.hits.length === 0) {
          toast.success(`未命中冲突${extra}`);
        } else {
          toast.success(`命中 ${res.hits.length} 条${extra}，请审阅`);
        }
      } catch (err) {
        toast.error("检索失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border bg-background px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            利益冲突检索
          </DialogTitle>
          <DialogDescription className="text-xs">
            填入待查的姓名或证件号（至少一项），快速比对历史客户与案件
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-140px)] space-y-4 overflow-y-auto px-6 py-4">
          {/* 输入项 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">检索项</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQueries((q) => [...q, { name: "", idNumber: "" }])}
                className="h-7 gap-1"
              >
                <Plus className="h-3 w-3" />
                添加
              </Button>
            </div>

            <div className="space-y-2">
              {queries.map((q, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-background p-2"
                >
                  <div className="col-span-5">
                    <Input
                      value={q.name}
                      onChange={(e) =>
                        setQueries((qs) =>
                          qs.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row))
                        )
                      }
                      placeholder="姓名 / 名称"
                      className="h-9 bg-background"
                    />
                  </div>
                  <div className="col-span-6">
                    <Input
                      value={q.idNumber}
                      onChange={(e) =>
                        setQueries((qs) =>
                          qs.map((row, i) =>
                            i === idx ? { ...row, idNumber: e.target.value } : row
                          )
                        )
                      }
                      placeholder="身份证 / 统一社会信用代码"
                      className="h-9 bg-background font-mono"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    {queries.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQueries((qs) => qs.filter((_, i) => i !== idx))}
                        className="h-9 w-9 p-0 text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Link
                href="/conflicts"
                className="text-[11px] text-muted-foreground hover:text-primary"
                onClick={() => onOpenChange(false)}
              >
                查看完整记录页 →
              </Link>
              <Button
                type="button"
                onClick={handleRun}
                disabled={isPending}
                className="gap-1.5 "
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                开始检索
              </Button>
            </div>
          </section>

          {/* 客户库同名（非冲突，仅提示） */}
          {hasRun && sameName.length > 0 && (
            <section className="rounded-md border border-[#5B8DEF]/30 bg-[#5B8DEF]/10 p-3">
              <div className="flex items-center gap-2 text-xs text-[#5B8DEF]">
                <Info className="h-3.5 w-3.5" />
                客户库已有 {sameName.length} 个同名记录（仅提示，非冲突）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sameName.map((c) => (
                  <Link
                    key={c.clientId}
                    href={`/clients/${c.clientId}`}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] hover:border-primary/40 hover:text-primary"
                  >
                    {c.name}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 身份证 / 信用代码精确匹配（强提示） */}
          {hasRun && idMatched.length > 0 && (
            <section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                身份证 / 信用代码与客户库 {idMatched.length} 条记录精确匹配，请人工核对
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {idMatched.map((c) => (
                  <Link
                    key={c.clientId}
                    href={`/clients/${c.clientId}`}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/15"
                  >
                    {c.name}{" "}
                    <span className="font-mono opacity-60">{c.idNumber}</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 结果 */}
          {hasRun && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                检索结果（{results?.length ?? 0}）
              </h3>

              {!results || results.length === 0 ? (
                <div className="rounded-md border border-[#4ADE80]/30 bg-[#4ADE80]/10 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#4ADE80]" />
                    <span>未命中任何历史客户或案件</span>
                  </div>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {results.map((h) => {
                    const style = severityStyle[h.severity];
                    const targetHref =
                      h.targetType === "Matter"
                        ? `/matters/${h.targetId}`
                        : h.targetType === "Client"
                          ? `/clients/${h.targetId}`
                          : null;
                    return (
                      <li
                        key={h.id}
                        className="rounded-md border p-2.5"
                        style={{ borderColor: `${style.color}40`, backgroundColor: style.bg }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <AlertTriangle
                                className="h-3.5 w-3.5"
                                style={{ color: style.color }}
                              />
                              <span
                                className="text-xs font-semibold uppercase tracking-wider"
                                style={{ color: style.color }}
                              >
                                {style.label}
                              </span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">
                                {h.hitType === "HISTORICAL_CLIENT" ? "历史客户" : "历史案件"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm">{h.reason}</p>
                            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                              {h.matchedField} = {h.matchedValue}
                              {h.matchedRatio !== null && h.matchedRatio < 1 && (
                                <span className="ml-2">
                                  相似度 {(h.matchedRatio * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          {targetHref && (
                            <Link
                              href={targetHref}
                              onClick={() => onOpenChange(false)}
                              className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                            >
                              查看
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
