"use client";

import type { IntakeStatus, ConflictSeverity } from "@prisma/client";
import {
  matterCategoryLabel,
  matterCategoryColor,
  matterCategoryShort,
  intakeStatusLabel
} from "@/lib/enums";
import { CaseListCard, CaseListHeader } from "./matters-table";

export type IntakeRow = {
  id: string;
  title: string;
  category: keyof typeof matterCategoryLabel;
  status: IntakeStatus;
  receivedAt: Date;
  client: { id: string; name: string } | null;
  cause: { id: string; name: string } | null;
  conflictChecks: { id: string; conclusion: string; hits: { severity: ConflictSeverity }[] }[];
  parties: { name: string }[];
  matter: { id: string; internalCode: string } | null;
  claimAmount?: number | null;
  ownerName?: string | null;
};

/**
 * v0.17: 待审批 / 待补正 收案列表 — 复用 MattersTable 的 CaseListCard 保证视觉一致
 */
export function IntakesTable({
  items,
  kind = "intake"
}: {
  items: IntakeRow[];
  kind?: "intake" | "revision";
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card py-20 text-center">
        <div className="text-base text-muted-foreground">
          {kind === "revision" ? "暂无待补正收案" : "暂无待审批收案"}
        </div>
        <div className="text-xs text-muted-foreground/70">
          {kind === "revision"
            ? "在 待审批 中拒绝的收案，可补正材料后重新提交，会出现在这里"
            : (
              <>
                点击右上角 <span className="text-foreground/80">新建收案</span> 开始
              </>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="ll-surface overflow-hidden rounded-lg">
      <CaseListHeader />
      <ul>
        {items.map((it) => {
          const statusLabel =
            kind === "revision" ? "待补正" : intakeStatusLabel[it.status] ?? it.status;
          const dot =
            kind === "revision"
              ? "#f97316" // orange
              : it.status === "PENDING_CONFIRMATION"
                ? "#f59e0b" // amber
                : "#10b981"; // emerald
          return (
            <CaseListCard
              key={it.id}
              href={`/intakes/${it.id}`}
              title={it.title}
              accent={matterCategoryColor[it.category]}
              status={{ label: statusLabel, dot }}
              categoryShort={matterCategoryShort[it.category]}
              intakeDate={it.receivedAt}
              claimAmount={it.claimAmount ?? null}
              inTable
            />
          );
        })}
      </ul>
    </div>
  );
}
