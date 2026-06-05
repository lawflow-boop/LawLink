"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Coins,
  TrendingUp,
  Percent,
  Receipt,
  FileText,
  ClipboardList
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

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

type Entry = {
  id: string;
  type: keyof typeof feeTypeLabel;
  amount: { toString(): string };
  occurredAt: Date;
  payerOrPayee: string | null;
  note: string | null;
  matter: { id: string; internalCode: string; title: string };
  beneficiaryUser: { id: string; name: string } | null;
  recordedBy: { id: string; name: string };
};

import type { InvoiceRequestStatus } from "@prisma/client";
import { InvoiceManagementSection } from "./invoice-management";
import { InvoiceCreateDialog } from "./invoice-create-dialog";

export type InvoiceRequestRow = {
  id: string;
  amount: number;
  title: string | null;
  status: InvoiceRequestStatus;
  requestNote: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  processNote: string | null;
  invoiceNo: string | null;
  issuedAt: Date | null;
  // v0.42 开票类型 + 抬头 + 专票六要素（来自 InvoiceRequest 标量字段）
  invoiceType: "PLAIN" | "SPECIAL" | null;
  invoiceItem: "LAWYER_FEE" | "CONSULTING_FEE" | "AGENCY_FEE" | "OTHER" | null;
  buyerName: string | null;
  buyerTaxNo: string | null;
  buyerAddress: string | null;
  buyerPhone: string | null;
  buyerBank: string | null;
  buyerBankAccount: string | null;
  // v0.43 项5：matter 可空（无关联案件开票）
  matter: { id: string; internalCode: string; title: string } | null;
  noMatterReason: string | null;
  requestedBy: { id: string; name: string };
  processedBy: { id: string; name: string } | null;
  evidenceDocs: {
    id: string;
    name: string;
    size: number | null;
    mimeType: string | null;
    createdAt: Date;
  }[];
  contractScan: { id: string; name: string } | null;
  invoiceFile: { id: string; name: string } | null;
};

type Props = {
  entries: Entry[];
  monthly: { month: string; received: number; receivable: number }[];
  stats: {
    monthlyReceived: number;
    monthlyReceivable: number;
    yearlyReceived: number;
    personalMonthly: number;
    personalYearly: number;
    monthlyIssued: number;
    pendingInvoiceCount: number;
  };
  invoiceRequests: InvoiceRequestRow[];
  canApproveInvoice: boolean;
};

const TYPE_FILTERS: ("ALL" | keyof typeof feeTypeLabel)[] = [
  "ALL",
  "RECEIVED",
  "RECEIVABLE",
  "COST",
  "COMMISSION",
  "REFUND"
];

export function FinanceView({
  entries,
  monthly,
  stats,
  invoiceRequests,
  canApproveInvoice
}: Props) {
  const [typeFilter, setTypeFilter] = useState<"ALL" | keyof typeof feeTypeLabel>("ALL");
  const [tab, setTab] = useState<"overview" | "invoices">("overview");
  const [invoiceCreateOpen, setInvoiceCreateOpen] = useState(false);

  const filtered = entries.filter((e) => typeFilter === "ALL" || e.type === typeFilter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-medium tracking-tight">财务管理</h1>
            <p className="text-[13px] text-muted-foreground">
              可见范围内的收付流水 + 开票申请 ·{" "}
              <Link href="/matters" className="text-primary hover:underline">
                合同/流水/分成在各案件详情录入
              </Link>
            </p>
          </div>
          <Button size="sm" className="w-fit gap-1.5" onClick={() => setInvoiceCreateOpen(true)}>
            <Receipt className="h-3.5 w-3.5" />
            申请开票
          </Button>
        </div>
        <div className="ll-rule" />
      </header>

      <div
        className="flex items-end gap-6 border-b"
      >
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
          <Wallet className="h-3.5 w-3.5" strokeWidth={1.8} />
          总览
        </TabBtn>
        <TabBtn active={tab === "invoices"} onClick={() => setTab("invoices")}>
          <Receipt className="h-3.5 w-3.5" strokeWidth={1.8} />
          开票管理
          {stats.pendingInvoiceCount > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {stats.pendingInvoiceCount}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === "invoices" ? (
        <div className="space-y-3">
          <InvoiceManagementSection
            requests={invoiceRequests}
            canApprove={canApproveInvoice}
          />
        </div>
      ) : (
        <>
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard
          label="本月实收"
          value={stats.monthlyReceived}
          icon={<Coins className="h-3.5 w-3.5" />}
          color="#4ADE80"
        />
        <StatCard
          label="本月应收"
          value={stats.monthlyReceivable}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          color="#FBBF24"
        />
        <StatCard
          label="本月已开票"
          value={stats.monthlyIssued}
          icon={<FileText className="h-3.5 w-3.5" />}
          color="#5B8DEF"
        />
        <StatCard
          label="本年实收"
          value={stats.yearlyReceived}
          icon={<Receipt className="h-3.5 w-3.5" />}
          color="#5B8DEF"
        />
        <StatCard
          label="我的本月分成"
          value={stats.personalMonthly}
          icon={<Percent className="h-3.5 w-3.5" />}
          color="#9B7BF7"
        />
        <StatCard
          label="我的本年分成"
          value={stats.personalYearly}
          icon={<Percent className="h-3.5 w-3.5" />}
          color="#9B7BF7"
        />
      </div>

      {/* 月度趋势图 */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">近 6 个月趋势</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: "#5B8DEF", boxShadow: "0 0 8px #5B8DEF" }}
              />
              实收
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: "#4FD1C5", boxShadow: "0 0 8px #4FD1C5" }}
              />
              应收
            </span>
          </div>
        </header>
        <div className="p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="finance-received" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B8DEF" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#5B8DEF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finance-receivable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#4FD1C5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: 12
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Area
                type="monotone"
                dataKey="receivable"
                name="应收"
                stroke="#4FD1C5"
                strokeWidth={1.5}
                fill="url(#finance-receivable)"
              />
              <Area
                type="monotone"
                dataKey="received"
                name="实收"
                stroke="#5B8DEF"
                strokeWidth={2}
                fill="url(#finance-received)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 流水 */}
      <section className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            收付流水{" "}
            <span className="text-muted-foreground">({filtered.length})</span>
          </h2>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
          >
            <SelectTrigger className="h-8 w-32 bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "ALL" ? "全部" : feeTypeLabel[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </header>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">没有匹配的记录</p>
        ) : (
          <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
            {filtered.map((e) => {
              const color = feeTypeColor[e.type];
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-popover">
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
                    <Link
                      href={`/matters/${e.matter.id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    >
                      <span className="font-mono">{e.matter.internalCode}</span>
                      <span>·</span>
                      <span className="truncate">{e.matter.title}</span>
                    </Link>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-muted-foreground tabular">
                      {new Date(e.occurredAt).toLocaleDateString("zh-CN")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      录入：{e.recordedBy.name}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
        </>
      )}
      <InvoiceCreateDialog
        open={invoiceCreateOpen}
        onOpenChange={setInvoiceCreateOpen}
        canCreateUnlinkedInvoice={canApproveInvoice}
      />
    </motion.div>
  );
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative inline-flex items-center gap-1.5 pb-2.5 pt-0.5 text-[13px] transition-colors " +
        (active ? "text-foreground" : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-px left-0 right-0 h-[2px] bg-primary"
        />
      )}
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  color
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="ll-surface relative overflow-hidden px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[0.56rem] text-muted-foreground">{label}</span>
      </div>
      <div className="ll-stat mt-3 text-[1.7rem] leading-none text-foreground">
        {formatCurrency(value, { compact: true })}
      </div>
    </div>
  );
}
