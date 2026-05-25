"use client";

import { useState } from "react";
import { Scale, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioChips } from "@/components/ui/radio-chips";
import { calcCourtFee, numberToChinese, type CourtFeeCaseType } from "@/lib/legal-calc";
import { cn } from "@/lib/utils";

const CASE_TYPES: { value: CourtFeeCaseType; label: string }[] = [
  { value: "PROPERTY", label: "财产案件" },
  { value: "DIVORCE", label: "离婚" },
  { value: "LABOR", label: "劳动争议" },
  { value: "IP", label: "知识产权" },
  { value: "OTHER", label: "其他非财产" }
];

export function CourtFeeCalc() {
  const [caseType, setCaseType] = useState<CourtFeeCaseType>("PROPERTY");
  const [amountInput, setAmountInput] = useState("100000");
  const [result, setResult] = useState<ReturnType<typeof calcCourtFee> | null>(null);
  const showAmount = caseType === "PROPERTY" || caseType === "DIVORCE";
  const amount = parseFloat(amountInput) || 0;

  function compute() {
    setResult(calcCourtFee({ caseType, amount: showAmount ? amount : undefined }));
  }

  return (
    <section className="ll-surface rounded-lg border border-border p-5">
      <header className="mb-4 flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" strokeWidth={1.8} />
        <h2 className="text-lg">诉讼费计算</h2>
        <span className="ml-2 text-[10px] text-muted-foreground">
          《诉讼费用交纳办法》全国统一标准
        </span>
      </header>

      <div className="space-y-3">
        <div>
          <Label className="text-[11px]">案件类型</Label>
          <RadioChips
            size="sm"
            className="mt-2"
            items={CASE_TYPES}
            value={caseType}
            onChange={(v) => setCaseType(v as CourtFeeCaseType)}
          />
        </div>

        {showAmount && (
          <div>
            <Label className="text-[11px]">
              {caseType === "DIVORCE" ? "财产分割金额（元，可填 0）" : "诉讼标的金额（元）"}
            </Label>
            <Input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="mt-1 font-mono text-[14px]"
              placeholder="如 100000"
            />
            {amount > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                大写：{numberToChinese(amount)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={compute} className="h-9 gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          计算
        </Button>
      </div>

      {result && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <ResultCard label="普通程序" value={result.fee} accent="#4F46E5" />
            <ResultCard label="简易程序（减半）" value={result.feeSimplified} accent="#16a34a" />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{result.note}</p>
        </>
      )}
    </section>
  );
}

function ResultCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/20 p-4")}>
      <div className="text-[10px] tracking-wider text-muted-foreground">{label}</div>
      <div
        className="mt-1 font-mono text-[26px] font-medium tabular"
        style={{ color: accent }}
      >
        ¥{value.toLocaleString()}
      </div>
    </div>
  );
}
