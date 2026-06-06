"use client";

import { useState } from "react";
import { Wallet, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { InvoiceRequestSheet } from "./invoice-request-sheet";
import type { FinancePayload, UserOption } from "./matter-detail-tabs";

/**
 * v0.12 重构：财务面板瘦身
 * - 删除：合同板块 / 分成方案 / 快捷录入 / 收付流水（5 类）
 * - 保留：律师费到账列表（仅 RECEIVED 类型）+ 顶部小计 + 申请开票按钮
 * - 数据主要由后台财务人员录入，案件页只读
 */
export function FinancePanel({
  matterId,
  finance,
  canRequestInvoice
}: {
  matterId: string;
  finance: FinancePayload;
  userOptions: UserOption[];
  canRequestInvoice: boolean;
}) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const received = finance.entries
    .filter((e) => e.type === "RECEIVED")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const { stats } = finance;
  const outstanding = Math.max(stats.receivable - stats.received, 0);

  const cards: { label: string; value: number; tone: StatTone; className?: string }[] = [
    { label: "合同额", value: stats.contractAmount, tone: "neutral", className: "col-span-2" },
    { label: "已收", value: stats.received, tone: "emerald" },
    { label: "待收", value: outstanding, tone: "amber" },
    { label: "支出", value: stats.cost, tone: "red" },
    { label: "分成", value: stats.commission, tone: "neutral" }
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            财务费用
          </span>
          {canRequestInvoice && (
            <Button
              size="sm"
              onClick={() => setInvoiceOpen(true)}
              className="h-6 gap-0.5 px-2 text-[11px]"
            >
              <Receipt className="h-2.5 w-2.5" />
              申请开票
            </Button>
          )}
        </div>
      </header>

      {/* 紧凑指标卡（对照案件云"财务概览"指标看板） */}
      <div className="grid grid-cols-3 gap-px border-b border-border bg-border sm:grid-cols-6">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            tone={c.tone}
            className={c.className}
          />
        ))}
      </div>

      {received.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          暂无到账记录（由财务管理人员后台录入）
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {received.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
              <span className="font-mono tabular text-emerald-600 text-[14px] font-medium">
                {formatCurrency(Number(e.amount))}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {e.payerOrPayee && <span>{e.payerOrPayee}</span>}
                {e.method && (
                  <span className="ml-2 text-[10.5px]">· {e.method}</span>
                )}
                {e.invoiceNo && (
                  <span className="ml-2 font-mono text-[10.5px]">
                    · 发票 {e.invoiceNo}
                  </span>
                )}
                {e.note && <span className="ml-2 text-[10.5px]">· {e.note}</span>}
              </span>
              <span className="font-mono text-[11px] tabular text-muted-foreground">
                {new Date(e.occurredAt).toLocaleDateString("zh-CN")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canRequestInvoice && (
        <InvoiceRequestSheet
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          matterId={matterId}
        />
      )}
    </section>
  );
}

type StatTone = "emerald" | "neutral" | "amber" | "red";

function StatCard({
  label,
  value,
  tone,
  className
}: {
  label: string;
  value: number;
  tone: StatTone;
  className?: string;
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className={`bg-card px-3 py-2.5 text-center ${className ?? ""}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[15px] leading-none tabular ${cls}`}>
        {formatCurrency(value, { compact: true })}
      </div>
    </div>
  );
}
