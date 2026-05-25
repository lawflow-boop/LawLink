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
  finance
}: {
  matterId: string;
  finance: FinancePayload;
  userOptions: UserOption[];
}) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const received = finance.entries
    .filter((e) => e.type === "RECEIVED")
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const { stats } = finance;
  const outstanding = Math.max(stats.receivable - stats.received, 0);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          律师费到账
          <span className="ml-1 font-mono text-[11px] text-muted-foreground tabular">
            ({received.length})
          </span>
        </span>
        <div className="flex items-center gap-4 text-[11.5px]">
          <span className="text-muted-foreground">
            已收{" "}
            <span className="font-mono tabular text-emerald-600">
              {formatCurrency(stats.received)}
            </span>
          </span>
          <span className="text-muted-foreground">
            应收{" "}
            <span className="font-mono tabular text-foreground">
              {formatCurrency(stats.receivable)}
            </span>
          </span>
          <span className="text-muted-foreground">
            待收{" "}
            <span className="font-mono tabular text-amber-600">
              {formatCurrency(outstanding)}
            </span>
          </span>
          <Button
            size="sm"
            onClick={() => setInvoiceOpen(true)}
            className="h-7 gap-1"
          >
            <Receipt className="h-3 w-3" />
            申请开票
          </Button>
        </div>
      </header>

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

      <InvoiceRequestSheet
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        matterId={matterId}
      />
    </section>
  );
}
