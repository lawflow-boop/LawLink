"use client";

import { useState } from "react";
import { Coins, Info, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcLateInterest, numberToChinese } from "@/lib/legal-calc";

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function LateInterestCalc() {
  const today = new Date();
  const halfYearAgo = new Date();
  halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);

  const [principal, setPrincipal] = useState("100000");
  const [dueDate, setDueDate] = useState(fmtDate(halfYearAgo));
  const [paidDate, setPaidDate] = useState(fmtDate(today));
  const [lprPercent, setLprPercent] = useState("3.45");
  const [extraPercent, setExtraPercent] = useState("5");

  const [result, setResult] = useState<ReturnType<typeof calcLateInterest> | null>(null);

  function compute() {
    const p = parseFloat(principal) || 0;
    const d1 = new Date(dueDate);
    const d2 = new Date(paidDate);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || p <= 0) {
      setResult(null);
      return;
    }
    setResult(
      calcLateInterest({
        principal: p,
        dueDate: d1,
        paidDate: d2,
        lprPercent: parseFloat(lprPercent) || 0,
        extraPercent: parseFloat(extraPercent) || 0
      })
    );
  }

  return (
    <section className="ll-surface rounded-lg border border-border p-5">
      <header className="mb-4 flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" strokeWidth={1.8} />
        <h2 className="text-lg">迟延履行金计算</h2>
        <span className="ml-2 text-[10px] text-muted-foreground">
          民诉法第 260 条 + 民诉法解释第 463 条
        </span>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label className="text-[11px]">判决金额（元）</Label>
          <Input
            type="number"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="mt-1 font-mono text-[14px]"
          />
        </div>
        <div>
          <Label className="text-[11px]">应履行日期</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[11px]">实际履行日期（或截至日）</Label>
          <Input
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">LPR 1Y（%）</Label>
            <Input
              type="number"
              step="0.01"
              value={lprPercent}
              onChange={(e) => setLprPercent(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label className="text-[11px]">加成（%）</Label>
            <Input
              type="number"
              step="0.5"
              value={extraPercent}
              onChange={(e) => setExtraPercent(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={compute} className="h-9 gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          计算
        </Button>
      </div>

      {result && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ResultCard label="迟延天数" value={`${result.daysLate} 天`} accent="#737373" />
            <ResultCard
              label="年利率"
              value={`${(result.yearlyRate * 100).toFixed(2)}%`}
              accent="#D97706"
            />
            <ResultCard
              label="加倍利息（推荐采用）"
              value={`¥${result.interest.toLocaleString()}`}
              accent="#DC2626"
            />
          </div>
          <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-[12px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">本金 + 加倍利息合计</span>
              <span className="font-mono text-[16px] font-medium tabular text-foreground">
                ¥{result.totalToPay.toLocaleString()}
              </span>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              大写：{numberToChinese(result.totalToPay)}
            </p>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            算法：判决金额 × (LPR 1Y + {extraPercent}%) × 迟延天数 / 365。LPR 以中国人民银行公布为准，建议办案时确认当前值。
          </p>
        </>
      )}
    </section>
  );
}

function ResultCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="text-[10px] tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-medium tabular" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
