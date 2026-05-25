"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import type { ConflictSeverity } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { runCheckAndSave } from "@/server/conflicts/actions";
import { cn } from "@/lib/utils";

type QueryRow = {
  name: string;
  idNumber: string;
};

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

const severityStyle: Record<ConflictSeverity, { color: string; bg: string; label: string }> = {
  BLOCKING: { color: "#F87171", bg: "rgba(248,113,113,0.12)", label: "阻塞" },
  HIGH: { color: "#FB923C", bg: "rgba(251,146,60,0.12)", label: "高" },
  MEDIUM: { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", label: "中" },
  LOW: { color: "#4ADE80", bg: "rgba(74,222,128,0.12)", label: "低" }
};

export function ConflictsView() {
  const [isPending, startTransition] = useTransition();
  const [queries, setQueries] = useState<QueryRow[]>([{ name: "", idNumber: "" }]);
  const [results, setResults] = useState<HitResult[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  function addQuery() {
    setQueries((q) => [...q, { name: "", idNumber: "" }]);
  }

  function removeQuery(idx: number) {
    setQueries((q) => q.filter((_, i) => i !== idx));
  }

  function updateQuery(idx: number, patch: Partial<QueryRow>) {
    setQueries((q) => q.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
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
        setHasRun(true);
        toast.success(`检索完成，命中 ${res.hits.length} 条`);
      } catch (err) {
        toast.error("检索失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-5 w-5 text-primary" />
          利益冲突检索
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          快速查 — 比对历史客户与案件，确认是否存在代理冲突
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">检索项</h2>
          <Button variant="outline" size="sm" onClick={addQuery} className="h-7 gap-1">
            <Plus className="h-3.5 w-3.5" />
            添加检索项
          </Button>
        </div>

        <div className="space-y-2">
          {queries.map((q, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-background p-3"
            >
              <div className="col-span-5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  姓名 / 名称
                </Label>
                <Input
                  value={q.name}
                  onChange={(e) => updateQuery(idx, { name: e.target.value })}
                  placeholder="如：华东置业集团有限公司"
                  className="mt-1 h-9 bg-background"
                />
              </div>
              <div className="col-span-6">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  身份证 / 统一社会信用代码
                </Label>
                <Input
                  value={q.idNumber}
                  onChange={(e) => updateQuery(idx, { idNumber: e.target.value })}
                  placeholder="与姓名至少填一项"
                  className="mt-1 h-9 bg-background font-mono"
                />
              </div>
              <div className="col-span-1 flex items-end justify-center">
                {queries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuery(idx)}
                    className="h-9 w-9 p-0 text-destructive"
                    aria-label="移除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
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

      {hasRun && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">
            检索结果{" "}
            <span className="font-mono text-xs text-muted-foreground tabular">
              ({results?.length ?? 0})
            </span>
          </h2>

          {!results || results.length === 0 ? (
            <div className="rounded-md border border-[#4ADE80]/30 bg-[#4ADE80]/10 p-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#4ADE80]" />
                <span>未命中任何历史客户或案件</span>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
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
                    className="rounded-md border p-3"
                    style={{ borderColor: `${style.color}40`, backgroundColor: style.bg }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5" style={{ color: style.color }} />
                          <span
                            className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: style.color }}
                          >
                            {style.label}
                          </span>
                          <span className={cn("text-xs text-muted-foreground")}>·</span>
                          <span className="text-xs text-muted-foreground">
                            {h.hitType === "HISTORICAL_CLIENT" ? "历史客户" : "历史案件"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm">{h.reason}</p>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                          匹配字段：{h.matchedField} = {h.matchedValue}
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
    </motion.div>
  );
}
