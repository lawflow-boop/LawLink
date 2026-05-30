"use client";

import Link from "next/link";
import type { Matter, PartyRole, LitigationStanding, Prisma } from "@prisma/client";
import {
  matterCategoryLabel,
  matterCategoryColor,
  matterCategoryShort,
  matterStatusLabel,
  procedureTypeLabel
} from "@/lib/enums";
import type { ProcedureType } from "@prisma/client";
import { formatCurrency, cn } from "@/lib/utils";

export type MatterRow = Matter & {
  primaryClient: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  cause: { id: string; name: string } | null;
  procedures: { id: string; type: string; caseNumber: string | null; status: string }[];
  parties: { id: string; name: string; role: PartyRole; standing: LitigationStanding | null }[];
  archiveRecords?: { id: string }[];
  _count: { procedures: number };
  claimAmount: Prisma.Decimal | null;
  receivedAmount?: number;
  intakeDate: Date | null;
};

// 程序状态中文（ProcedureStatus 无现成 label）
const PROC_STATUS_LABEL: Record<string, string> = {
  PENDING: "未立案",
  IN_PROGRESS: "进行中",
  CONCLUDED: "已结"
};

/**
 * v0.28: 列设置。标题 + 状态恒显示，其余 6 列可由用户在列表页勾选显隐。
 * 左侧网格列（收案时间/客户/案由/标的）支持动态显隐并重算列宽。
 */
export const MATTER_COLUMNS = [
  { key: "intakeDate", label: "收案时间", side: "left", width: "max-content" },
  { key: "client", label: "客户", side: "left", width: "15ch" },
  { key: "opposing", label: "相对方", side: "left", width: "15ch" },
  { key: "cause", label: "案由", side: "left", width: "14ch" },
  { key: "claim", label: "标的", side: "left", width: "max-content" },
  { key: "received", label: "回款", side: "left", width: "minmax(0, 1fr)" },
  { key: "code", label: "系统编号", side: "right", width: "" },
  { key: "procedure", label: "当前程序", side: "right", width: "" },
  { key: "owner", label: "主办律师", side: "right", width: "" }
] as const;

export type MatterColumnKey = (typeof MATTER_COLUMNS)[number]["key"];

export type ColumnVisibility = Record<MatterColumnKey, boolean>;

const ALL_VISIBLE: ColumnVisibility = {
  intakeDate: true,
  client: true,
  opposing: true,
  cause: true,
  claim: true,
  received: true,
  code: true,
  procedure: true,
  owner: true
};

/**
 * v0.17: 案件列表卡片 - 统一两行 + 角落定位
 * 布局：
 *   左上: 标题 + 状态 chip          | 右上: 系统编号
 *   左下: 收案/委托/案由/标的 4 列   | 右下: 主办律师
 * 左侧 3px category 竖条作为唯一彩色装饰
 */
export function MattersTable({
  items,
  visible = ALL_VISIBLE
}: {
  items: MatterRow[];
  visible?: ColumnVisibility;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card py-20 text-center">
        <div className="text-base text-muted-foreground">没有匹配的案件</div>
        <div className="text-xs text-muted-foreground/70">
          点击右上角 <span className="text-foreground/80">新建收案</span> 开始
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((m) => {
        const opposing = m.parties.find((p) => p.role === "OPPOSING_PARTY") ?? null;
        const proc = m.procedures[0] ?? null;
        return (
          <CaseListCard
            key={m.id}
            href={`/matters/${m.id}`}
            title={m.title}
            accent={matterCategoryColor[m.category]}
            status={{
              label:
                (m.archiveRecords?.length ?? 0) > 0
                  ? "归档中"
                  : matterStatusLabel[m.status],
              dot:
                (m.archiveRecords?.length ?? 0) > 0
                  ? MATTER_STATUS_DOT.ARCHIVED
                  : MATTER_STATUS_DOT[m.status]
            }}
            categoryShort={matterCategoryShort[m.category]}
            internalCode={m.internalCode}
            owner={m.owner?.name ?? null}
            intakeDate={m.intakeDate}
            clientName={m.primaryClient?.name ?? null}
            opposingName={opposing?.name ?? null}
            causeText={m.cause?.name ?? m.causeFreeText ?? null}
            claimAmount={m.claimAmount ? Number(m.claimAmount) : null}
            receivedAmount={m.receivedAmount ?? 0}
            procedure={
              proc
                ? {
                    label: procedureTypeLabel[proc.type as ProcedureType] ?? proc.type,
                    status: PROC_STATUS_LABEL[proc.status] ?? proc.status
                  }
                : null
            }
            visible={visible}
          />
        );
      })}
    </ul>
  );
}

const MATTER_STATUS_DOT: Record<MatterRow["status"], string> = {
  PENDING_ACCEPTANCE: "#f59e0b",
  IN_PROGRESS: "#10b981",
  ON_HOLD: "#94a3b8",
  CLOSED: "#3b82f6",
  ARCHIVED: "#8b5cf6"
};

// 通用卡片：供 MattersTable + IntakesTable 共用
export function CaseListCard({
  href,
  title,
  accent,
  status,
  categoryShort,
  internalCode,
  owner,
  intakeDate,
  clientName,
  opposingName,
  causeText,
  claimAmount,
  receivedAmount,
  procedure,
  visible = ALL_VISIBLE
}: {
  href: string;
  title: string;
  accent: string;
  status: { label: string; dot: string };
  categoryShort: string;
  internalCode: string | null;
  owner: string | null;
  intakeDate: Date | null;
  clientName: string | null;
  /** 以下为案件列表专有；收案列表(IntakesTable)不传，自动不显示对应列 */
  opposingName?: string | null;
  causeText: string | null;
  claimAmount: number | null;
  receivedAmount?: number;
  procedure?: { label: string; status: string } | null;
  visible?: ColumnVisibility;
}) {
  // 各列是否有数据（收案列表不传相对方/回款/程序 → 该列不渲染，网格才对得齐）
  const hasData: Record<MatterColumnKey, boolean> = {
    intakeDate: true,
    client: true,
    opposing: opposingName !== undefined,
    cause: true,
    claim: true,
    received: receivedAmount !== undefined,
    code: true,
    procedure: procedure !== undefined,
    owner: true
  };
  // 左侧网格列按显隐 + 数据可用重算 grid-template-columns，保证对齐
  const leftCols = MATTER_COLUMNS.filter(
    (c) => c.side === "left" && visible[c.key] && hasData[c.key]
  );
  const gridTemplate =
    leftCols.length > 0 ? leftCols.map((c) => c.width).join(" ") : "minmax(0, 1fr)";
  return (
    <li>
      <Link
        href={href}
        className="group block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30"
      >
        {/* 两列布局：左主信息 + 右编号/程序/主办 */}
        <div className="flex items-stretch gap-4">
          <div className="min-w-0 flex-1">
            {/* 左上：类别图标 + 标题 + 状态 chip（状态上移，层次更清）*/}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                aria-hidden
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold leading-none text-white"
                style={{ background: accent }}
              >
                {categoryShort}
              </span>
              <span className="text-[14px] font-medium text-foreground transition-colors group-hover:text-primary">
                {title || "（未命名）"}
              </span>
              <StatusChip label={status.label} dot={status.dot} />
            </div>

            {/* 左下：列宽 grid（按显隐动态重算），位置永远对齐 */}
            {leftCols.length > 0 && (
              <div
                className="mt-1.5 grid items-baseline gap-x-5 gap-y-0.5 text-[12.5px]"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {visible.intakeDate && (
                  <Cell label="收案" noTruncate>
                    {intakeDate ? (
                      <span className="font-mono">
                        {new Date(intakeDate).toLocaleDateString("zh-CN")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </Cell>
                )}
                {visible.client && (
                  <Cell label="委托" title={clientName ?? undefined}>
                    {clientName ?? <span className="text-muted-foreground/60">—</span>}
                  </Cell>
                )}
                {visible.opposing && hasData.opposing && (
                  <Cell label="相对" title={opposingName ?? undefined}>
                    {opposingName ?? <span className="text-muted-foreground/60">—</span>}
                  </Cell>
                )}
                {visible.cause && (
                  <Cell label="案由" title={causeText ?? undefined}>
                    {causeText ?? <span className="text-muted-foreground/60">—</span>}
                  </Cell>
                )}
                {visible.claim && (
                  <Cell label="标的" noTruncate>
                    {claimAmount != null ? (
                      <span className="font-mono">
                        {formatCurrency(claimAmount, { compact: true })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </Cell>
                )}
                {visible.received && hasData.received && (
                  <Cell label="回款" noTruncate>
                    {receivedAmount && receivedAmount > 0 ? (
                      <span className="font-mono text-emerald-600">
                        {formatCurrency(receivedAmount, { compact: true })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">¥0</span>
                    )}
                  </Cell>
                )}
              </div>
            )}
          </div>

          {/* 右侧上下分：上=系统编号；下=当前程序 chip + 主办律师 */}
          <div className="hidden w-44 shrink-0 sm:flex flex-col items-end justify-between gap-1.5 text-[12px] text-muted-foreground">
            {visible.code && internalCode ? (
              <span className="font-mono text-[11.5px]">{internalCode}</span>
            ) : (
              <span />
            )}
            <div className="flex flex-col items-end gap-1">
              {visible.procedure && hasData.procedure && procedure && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10.5px] text-foreground/70">
                  {procedure.label}
                  <span className="text-muted-foreground/60">·{procedure.status}</span>
                </span>
              )}
              {visible.owner && (
                <span className="flex items-baseline gap-1">
                  <span>主办：</span>
                  <span className="text-foreground/80">{owner ?? "—"}</span>
                </span>
              )}
            </div>
          </div>
          {/* 移动端：编号+程序+律师一行 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
            {visible.code && internalCode && (
              <span className="font-mono text-[11px]">{internalCode}</span>
            )}
            {visible.procedure && hasData.procedure && procedure && (
              <span className="text-foreground/70">
                {procedure.label}·{procedure.status}
              </span>
            )}
            {visible.owner && <span>主办：{owner ?? "—"}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function Cell({
  label,
  title,
  noTruncate,
  children
}: {
  label: string;
  title?: string;
  noTruncate?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <span className="shrink-0 text-[11px] text-muted-foreground/70">{label}：</span>
      <span
        className={cn("text-foreground/90", noTruncate ? "whitespace-nowrap" : "truncate")}
        title={title}
      >
        {children}
      </span>
    </div>
  );
}

function StatusChip({ label, dot }: { label: string; dot: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 text-[11px] text-foreground/75"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}
