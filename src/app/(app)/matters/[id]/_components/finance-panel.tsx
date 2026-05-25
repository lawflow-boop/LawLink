"use client";

import { useState, useTransition } from "react";
import {
  Wallet,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  Coins,
  Receipt,
  Percent,
  Trash2,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  deleteBilling,
  deleteFeeEntry
} from "@/server/finance/actions";
import { formatCurrency } from "@/lib/utils";
import {
  AddBillingSheet,
  AddFeeEntrySheet,
  EditCommissionPlanDialog
} from "./finance-forms";
import type { FinancePayload, UserOption } from "./matter-detail-tabs";

const feeTypeLabel = {
  RECEIVABLE: "应收",
  RECEIVED: "实收",
  REFUND: "退款",
  COST: "成本",
  COMMISSION: "分成"
} as const;

const feeTypeColor: Record<keyof typeof feeTypeLabel, string> = {
  RECEIVABLE: "#FBBF24",
  RECEIVED: "#4ADE80",
  REFUND: "#F87171",
  COST: "#FB923C",
  COMMISSION: "#9B7BF7"
};

export function FinancePanel({
  matterId,
  finance,
  userOptions
}: {
  matterId: string;
  finance: FinancePayload;
  userOptions: UserOption[];
}) {
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [feeSheetOpen, setFeeSheetOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { stats } = finance;
  const outstandingReceivable = stats.receivable - stats.received;

  function handleDeleteBilling(id: string) {
    if (!confirm("删除此合同？关联的财务条目不会自动删除。")) return;
    startTransition(async () => {
      try {
        await deleteBilling(id);
        toast.success("合同已删除");
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  function handleDeleteEntry(id: string, hasChildren: boolean) {
    if (
      !confirm(
        hasChildren ? "删除该实收条目，关联的分成子条目会一并删除" : "删除此条目？"
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteFeeEntry(id);
        toast.success("已删除");
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="合同总额"
          value={stats.contractAmount}
          icon={<Receipt className="h-3.5 w-3.5" />}
          color="#5B8DEF"
        />
        <StatCard
          label="应收"
          value={stats.receivable}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          color="#FBBF24"
        />
        <StatCard
          label="实收"
          value={stats.received}
          icon={<Coins className="h-3.5 w-3.5" />}
          color="#4ADE80"
          subValue={
            outstandingReceivable > 0
              ? `待收 ${formatCurrency(outstandingReceivable, { compact: true })}`
              : undefined
          }
        />
        <StatCard
          label="成本"
          value={stats.cost}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          color="#FB923C"
        />
        <StatCard
          label="已分成"
          value={stats.commission}
          icon={<Percent className="h-3.5 w-3.5" />}
          color="#9B7BF7"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 合同 */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-1">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-primary" />
              合同 <span className="text-muted-foreground">({finance.billings.length})</span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBillingSheetOpen(true)}
              className="h-7 gap-1 text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              新增
            </Button>
          </header>

          {finance.billings.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">还没有合同</p>
          ) : (
            <ul className="space-y-2">
              {finance.billings.map((b) => (
                <li
                  key={b.id}
                  className="group rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-sm font-medium">{b.title}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground tabular">
                        {formatCurrency(Number(b.contractAmount))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {b.status === "DRAFT" ? "草稿" : b.status === "ACTIVE" ? "生效" : "结清"}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteBilling(b.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                  {b.schedule && (
                    <div className="mt-1.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {b.schedule}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 分成方案 */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-1">
          <header className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              分成方案
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlanDialogOpen(true)}
              className="h-7 gap-1 text-primary"
            >
              <Percent className="h-3.5 w-3.5" />
              编辑
            </Button>
          </header>

          {finance.plans.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              未配置 — 实收不自动分成
            </p>
          ) : (
            <ul className="space-y-2">
              {finance.plans.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{p.user.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.label ?? "—"}
                    </div>
                  </div>
                  <div className="font-mono text-base font-semibold tabular text-primary">
                    {Number(p.percent).toFixed(1)}%
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-md border border-dashed border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground">律所留存</span>
                <span className="font-mono text-sm tabular text-muted-foreground">
                  {(
                    100 - finance.plans.reduce((acc, p) => acc + Number(p.percent), 0)
                  ).toFixed(1)}
                  %
                </span>
              </li>
            </ul>
          )}
        </section>

        {/* 快捷动作 */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-1">
          <h3 className="mb-4 text-sm font-semibold">快捷录入</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                setFeeSheetOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              新增收付记录
            </Button>
            <p className="text-[11px] text-muted-foreground">
              实收创建后会按分成方案自动派生 COMMISSION 子条目
            </p>
          </div>
        </section>
      </div>

      {/* 流水 */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-primary" />
            收付流水 <span className="text-muted-foreground">({finance.entries.length})</span>
          </h3>
        </header>

        {finance.entries.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">还没有收付记录</p>
        ) : (
          <ul className="divide-y divide-border">
            {finance.entries.map((e) => {
              const hasChildren = !e.parentFeeEntryId && finance.entries.some((c) => c.parentFeeEntryId === e.id);
              const isChild = !!e.parentFeeEntryId;
              const color = feeTypeColor[e.type];
              return (
                <li
                  key={e.id}
                  className={cn(
                    "group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-popover",
                    isChild && "bg-background pl-12"
                  )}
                >
                  <span
                    className="inline-flex h-6 min-w-12 items-center justify-center rounded-md border px-2 text-[10px] font-medium"
                    style={{ borderColor: `${color}50`, color }}
                  >
                    {feeTypeLabel[e.type]}
                  </span>

                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular text-foreground">
                        {formatCurrency(Number(e.amount))}
                      </span>
                      {e.beneficiaryUser && (
                        <Badge variant="secondary" className="text-[10px]">
                          → {e.beneficiaryUser.name}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {e.payerOrPayee && <span>{e.payerOrPayee} · </span>}
                      {e.method && <span>{e.method} · </span>}
                      {e.note ?? ""}
                    </div>
                  </div>

                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {new Date(e.occurredAt).toLocaleDateString("zh-CN")}
                  </span>

                  {!isChild && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(e.id, hasChildren)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isPending && (
          <div className="flex items-center justify-center gap-2 border-t border-border py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            处理中...
          </div>
        )}
      </section>

      <AddBillingSheet
        open={billingSheetOpen}
        onOpenChange={setBillingSheetOpen}
        matterId={matterId}
      />
      <AddFeeEntrySheet
        open={feeSheetOpen}
        onOpenChange={setFeeSheetOpen}
        matterId={matterId}
        billings={finance.billings.map((b) => ({ id: b.id, title: b.title }))}
      />
      <EditCommissionPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        matterId={matterId}
        userOptions={userOptions}
        initialPlans={finance.plans.map((p) => ({
          userId: p.userId,
          percent: Number(p.percent),
          label: p.label ?? ""
        }))}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  subValue
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subValue?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-4"
      style={{ borderColor: `${color}30` }}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-semibold tabular text-foreground">
        {formatCurrency(value, { compact: true })}
      </div>
      {subValue && (
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular">
          {subValue}
        </div>
      )}
    </div>
  );
}

function cn(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ");
}
