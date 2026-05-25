"use client";

import Link from "next/link";
import type { Matter, PartyRole, LitigationStanding, Prisma } from "@prisma/client";
import {
  matterCategoryLabel,
  matterCategoryColor,
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
  intakeDate: Date | null;
};

/**
 * v0.17: 案件列表卡片 - 统一两行 + 角落定位
 * 布局：
 *   左上: 标题 + 状态 chip          | 右上: 系统编号
 *   左下: 收案/委托/案由/标的 4 列   | 右下: 主办律师
 * 左侧 3px category 竖条作为唯一彩色装饰
 */
export function MattersTable({ items }: { items: MatterRow[] }) {
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
    <ul className="space-y-2.5">
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
          internalCode={m.internalCode}
          owner={m.owner?.name ?? null}
          intakeDate={m.intakeDate}
          clientName={m.primaryClient?.name ?? null}
          causeText={m.cause?.name ?? m.causeFreeText ?? null}
          claimAmount={m.claimAmount ? Number(m.claimAmount) : null}
        />
      ))}
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
  internalCode,
  owner,
  intakeDate,
  clientName,
  causeText,
  claimAmount
}: {
  href: string;
  title: string;
  accent: string;
  status: { label: string; dot: string };
  internalCode: string | null;
  owner: string | null;
  intakeDate: Date | null;
  clientName: string | null;
  causeText: string | null;
  claimAmount: number | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group block rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-foreground/30"
      >
        {/* 两列布局：左主信息 + 右编号/主办 */}
        <div className="flex items-stretch gap-4">
          <div className="min-w-0 flex-1">
            {/* 左上：标题（独占） */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] font-medium text-foreground transition-colors group-hover:text-primary">
                {title || "（未命名）"}
              </span>
            </div>

            {/* 左下：收案时间 / 客户 / 案由 / 标的 — 紧凑 inline 排列 */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
              <Cell label="收案时间">
                {intakeDate ? (
                  <span className="font-mono">
                    {new Date(intakeDate).toLocaleDateString("zh-CN")}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </Cell>
              <Cell label="客户" minWidthCh={16}>
                {clientName ?? <span className="text-muted-foreground/60">—</span>}
              </Cell>
              <Cell label="案由" minWidthCh={14}>
                {causeText ?? <span className="text-muted-foreground/60">—</span>}
              </Cell>
              <Cell label="标的">
                {claimAmount != null ? (
                  <span className="font-mono">
                    {formatCurrency(claimAmount, { compact: true })}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </Cell>
            </div>
          </div>

          {/* 右侧上下分：上=系统编号 + 状态 chip；下=主办律师 */}
          <div className="flex w-52 shrink-0 flex-col items-end justify-between gap-2 text-[12.5px] text-muted-foreground">
            <div className="flex items-center gap-2">
              {internalCode && (
                <span className="font-mono text-[12px]">{internalCode}</span>
              )}
              <StatusChip label={status.label} dot={status.dot} />
            </div>
            <div className="flex items-baseline gap-1">
              <span>主办：</span>
              <span className="text-foreground/80">{owner ?? "—"}</span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Cell({
  label,
  children,
  minWidthCh
}: {
  label: string;
  children: React.ReactNode;
  minWidthCh?: number;
}) {
  return (
    <div
      className="flex min-w-0 items-baseline gap-1"
      style={minWidthCh ? { minWidth: `${minWidthCh}ch` } : undefined}
    >
      <span className="shrink-0 text-[11px] text-muted-foreground/70">{label}：</span>
      <span className="truncate text-foreground/90">{children}</span>
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
