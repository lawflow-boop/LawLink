"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Wallet,
  Briefcase,
  Archive,
  CheckCircle2,
  Download,
  BarChart3,
  CircleAlert
} from "lucide-react";
import { matterCategoryLabel, matterCategoryColor } from "@/lib/enums";
import type { ReportData } from "@/server/reports/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PeriodKey = "month" | "quarter" | "year" | "lastYear" | "custom";

const PERIOD_LABEL: Record<Exclude<PeriodKey, "custom">, string> = {
  month: "本月",
  quarter: "本季",
  year: "本年",
  lastYear: "上年"
};

export function ReportsView({
  periodKey,
  periodLabel,
  customStart,
  customEnd,
  resolveError,
  data,
  presetLabels
}: {
  periodKey: PeriodKey;
  periodLabel: string;
  customStart?: string;
  customEnd?: string;
  resolveError?: string;
  data: ReportData;
  presetLabels: Record<Exclude<PeriodKey, "custom">, string>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [customOpen, setCustomOpen] = useState(periodKey === "custom");
  const [start, setStart] = useState(customStart ?? "");
  const [end, setEnd] = useState(customEnd ?? "");

  function switchPreset(k: Exclude<PeriodKey, "custom">) {
    const next = new URLSearchParams(sp.toString());
    next.set("period", k);
    next.delete("start");
    next.delete("end");
    router.push(`/reports?${next.toString()}`);
    setCustomOpen(false);
  }

  function applyCustom() {
    if (!start || !end) return;
    const next = new URLSearchParams();
    next.set("period", "custom");
    next.set("start", start);
    next.set("end", end);
    router.push(`/reports?${next.toString()}`);
  }

  const maxCat = data.byCategory.reduce((m, c) => Math.max(m, c.count), 0);

  const exportHref = (() => {
    const q = new URLSearchParams();
    q.set("period", periodKey);
    if (periodKey === "custom" && customStart && customEnd) {
      q.set("start", customStart);
      q.set("end", customEnd);
    }
    return `/api/reports/export?${q.toString()}`;
  })();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-5 w-5 text-primary" strokeWidth={1.8} />
            律所报表
          </h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            统计期：<span className="text-foreground">{periodLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-card p-0.5">
            {(["month", "quarter", "year", "lastYear"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchPreset(k)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] transition-colors",
                  periodKey === k
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={presetLabels[k]}
              >
                {PERIOD_LABEL[k]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] transition-colors",
                periodKey === "custom"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              自定义
            </button>
          </div>
          <Link href={exportHref} prefetch={false}>
            <Button size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              导出 xlsx
            </Button>
          </Link>
        </div>
      </header>

      {customOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3 text-xs">
          <div>
            <label className="text-muted-foreground">起始（含）</label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-0.5 h-8 w-36 text-[12px]"
            />
          </div>
          <span className="pb-2 text-muted-foreground">~</span>
          <div>
            <label className="text-muted-foreground">结束（含）</label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-0.5 h-8 w-36 text-[12px]"
            />
          </div>
          <Button size="sm" onClick={applyCustom} disabled={!start || !end}>
            应用
          </Button>
          <span className="ml-2 text-[10px] text-muted-foreground">最大跨度 5 年</span>
        </div>
      )}

      {resolveError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{resolveError}</span>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Briefcase} label="本期新收" value={data.kpis.newIntake} color="#5B8DEF" />
        <Kpi icon={Wallet} label="在办中" value={data.kpis.inProgress} color="#F5A742" />
        <Kpi icon={CheckCircle2} label="本期已结" value={data.kpis.closed} color="#48BB78" />
        <Kpi
          icon={Archive}
          label="本期已归档"
          value={data.kpis.archived}
          color="#9B7BF7"
          hint={data.kpis.closed > 0 ? `归档率 ${Math.round(data.kpis.archiveRate * 100)}%` : ""}
        />
      </div>

      {/* 类别分布 */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-medium">本期新收 · 类别分布</h3>
        {data.byCategory.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">本期暂无新收案件</p>
        ) : (
          <ul className="space-y-2">
            {data.byCategory.map((c) => {
              const pct = maxCat > 0 ? (c.count / maxCat) * 100 : 0;
              const color = matterCategoryColor[c.category];
              return (
                <li key={c.category} className="flex items-center gap-3 text-xs">
                  <span className="w-16 shrink-0 text-foreground/80">
                    {matterCategoryLabel[c.category]}
                  </span>
                  <div className="flex-1">
                    <div
                      className="h-4 rounded"
                      style={{
                        width: `${pct}%`,
                        minWidth: c.count > 0 ? 8 : 0,
                        backgroundColor: `${color}99`
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 font-mono text-right text-foreground">
                    {c.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 律师产出 */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">律师产出 · 本期</h3>
          {data.byLawyer.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">本期无产出数据</p>
          ) : (
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-normal">律师</th>
                    <th className="px-2 py-1.5 text-right font-normal">新收</th>
                    <th className="px-2 py-1.5 text-right font-normal">已结</th>
                    <th className="px-2 py-1.5 text-right font-normal">收款（元）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byLawyer.map((r) => (
                    <tr key={r.userId}>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.ownedCount}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.closedCount}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {r.receivedAmount.toLocaleString("zh-CN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 客户应收 */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">客户应收 · 本期</h3>
          {data.byClientReceivable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">本期无应收数据</p>
          ) : (
            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-normal">客户</th>
                    <th className="px-2 py-1.5 text-right font-normal">应收</th>
                    <th className="px-2 py-1.5 text-right font-normal">已收</th>
                    <th className="px-2 py-1.5 text-right font-normal">余额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byClientReceivable.map((r) => (
                    <tr key={r.clientId}>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {r.receivable.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-emerald-600">
                        {r.received.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-mono",
                          r.balance > 0 ? "text-rose-600" : "text-muted-foreground"
                        )}
                      >
                        {r.balance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  color,
  hint
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}1F`, color }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-1 font-mono text-2xl tabular text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
