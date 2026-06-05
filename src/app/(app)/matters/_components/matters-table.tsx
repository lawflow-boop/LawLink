"use client";

import Link from "next/link";
import type { Matter, PartyRole, LitigationStanding, Prisma } from "@prisma/client";
import {
  matterCategoryLabel,
  matterCategoryColor,
  matterCategoryShort,
  matterStatusLabel
} from "@/lib/enums";
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
  firmCaseNo: string | null;
  intakeDate: Date | null;
  latestHearingAt: Date | null;
};

type MetaColumn = "hearing" | "firmCaseNo";

const MATTER_ROW_GRID =
  "grid gap-x-4 gap-y-2 lg:grid-cols-[7.5rem_minmax(25rem,1fr)_9rem_8rem_7rem] lg:items-center";

export function CaseListHeader({
  metaColumn = "hearing"
}: {
  metaColumn?: MetaColumn;
}) {
  return (
    <div
      className={cn(
        MATTER_ROW_GRID,
        "hidden border-b border-border bg-muted/30 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground lg:grid"
      )}
    >
      <div>收案时间</div>
      <div>案件名称</div>
      <div>标的</div>
      <div>{metaColumn === "firmCaseNo" ? "所内案号" : "开庭时间"}</div>
      <div>状态</div>
    </div>
  );
}

export function MattersTable({
  items,
  metaColumn = "hearing"
}: {
  items: MatterRow[];
  metaColumn?: MetaColumn;
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
    <div className="ll-surface overflow-hidden rounded-lg">
      <CaseListHeader metaColumn={metaColumn} />
      <ul>
        {items.map((m) => (
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
            intakeDate={m.intakeDate}
            latestHearingAt={m.latestHearingAt}
            firmCaseNo={m.firmCaseNo}
            claimAmount={m.claimAmount ? Number(m.claimAmount) : null}
            metaColumn={metaColumn}
            inTable
          />
        ))}
      </ul>
    </div>
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
  intakeDate,
  latestHearingAt = null,
  firmCaseNo = null,
  claimAmount,
  metaColumn = "hearing",
  inTable = false
}: {
  href: string;
  title: string;
  accent: string;
  status: { label: string; dot: string };
  categoryShort: string;
  intakeDate: Date | null;
  latestHearingAt?: Date | null;
  firmCaseNo?: string | null;
  claimAmount: number | null;
  metaColumn?: MetaColumn;
  inTable?: boolean;
}) {
  return (
    <li className={cn(inTable ? "border-t border-border first:border-t-0" : "rounded-lg border border-border bg-card")}>
      <Link
        href={href}
        className={cn(
          "group block transition-colors",
          inTable ? "px-3 py-2.5 hover:bg-muted/30" : "rounded-lg px-4 py-3 hover:bg-muted/40"
        )}
      >
        <div className={MATTER_ROW_GRID}>
          <DataCell label="收案时间">
            <span className="font-mono tabular-nums text-foreground/70">
              {formatDate(intakeDate)}
            </span>
          </DataCell>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border px-1 text-[10.5px] font-medium leading-none"
                style={{
                  background: `${accent}14`,
                  borderColor: `${accent}66`,
                  color: accent
                }}
              >
                {categoryShort}
              </span>
              <span className="min-w-0 truncate text-[12px] font-normal leading-5 text-primary">
                {title || "（未命名）"}
              </span>
            </div>
          </div>

          <DataCell label="标的">
            <span className="font-mono tabular-nums text-foreground/75">
              {claimAmount != null ? formatCurrency(claimAmount) : "—"}
            </span>
          </DataCell>

          <DataCell label={metaColumn === "firmCaseNo" ? "所内案号" : "开庭时间"}>
            {metaColumn === "firmCaseNo" ? (
              <span className="font-mono tabular-nums text-foreground/75">
                {firmCaseNo || "—"}
              </span>
            ) : (
              <span
                className={cn(
                  "font-mono tabular-nums",
                  latestHearingAt ? "text-primary" : "text-muted-foreground/55"
                )}
              >
                {formatDateTime(latestHearingAt)}
              </span>
            )}
          </DataCell>

          <DataCell label="状态">
            <StatusChip label={status.label} dot={status.dot} />
          </DataCell>
        </div>
      </Link>
    </li>
  );
}

function DataCell({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground lg:block", className)}>
      <span className="shrink-0 text-[11px] text-muted-foreground/60 lg:hidden">
        {label}：
      </span>
      {children}
    </div>
  );
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatDateTime(value: Date | null) {
  if (!value) return "暂无开庭";
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function StatusChip({ label, dot }: { label: string; dot: string }) {
  return (
    <span
      className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[10.5px]"
      style={{
        background: `${dot}12`,
        borderColor: `${dot}55`,
        color: dot
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}
