"use client";

import Link from "next/link";
import type { Matter, PartyRole, LitigationStanding, Prisma } from "@prisma/client";
import {
  matterCategoryLabel,
  matterCategoryColor,
  matterStatusLabel,
  procedureTypeLabel,
  litigationStandingLabel
} from "@/lib/enums";
import { formatCurrency, cn } from "@/lib/utils";

export type MatterRow = Matter & {
  primaryClient: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  cause: { id: string; name: string } | null;
  procedures: { id: string; type: string; caseNumber: string | null; status: string }[];
  parties: { id: string; name: string; role: PartyRole; standing: LitigationStanding | null }[];
  _count: { procedures: number };
  claimAmount: Prisma.Decimal | null;
  intakeDate: Date | null;
};

/**
 * v0.16: 案件列表统一两行布局（divide-y 列表）
 * 行 1：编号 · 标题 · 类别 · 状态 · (右) 主办律师
 * 行 2：委托人 · 对方 · 三人 · 案由 · 程序+案号 · 收案 · 标的
 */
export function MattersTable({ items }: { items: MatterRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card flex flex-col items-center gap-2 py-20 text-center">
        <div className="text-base text-muted-foreground">没有匹配的案件</div>
        <div className="text-xs text-muted-foreground/70">
          点击右上角 <span className="text-foreground/80">新建收案</span> 开始
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <ul className="divide-y divide-border">
        {items.map((m) => (
          <MatterListRow key={m.id} m={m} />
        ))}
      </ul>
    </div>
  );
}

function MatterListRow({ m }: { m: MatterRow }) {
  const current = m.procedures[0];
  const opposing = m.parties.filter((p) => p.role === "OPPOSING_PARTY");
  const third = m.parties.filter((p) => p.role === "THIRD_PARTY");
  const categoryColor = matterCategoryColor[m.category];
  const causeText = m.cause?.name ?? m.causeFreeText ?? null;
  const procLabel = current
    ? procedureTypeLabel[current.type as keyof typeof procedureTypeLabel] ?? current.type
    : null;

  return (
    <Link
      href={`/matters/${m.id}`}
      className="group block px-4 py-3 transition-colors hover:bg-muted/40"
    >
      {/* 行 1：编号 + 标题 + 类别 + 状态 + 右侧主办 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] tabular text-muted-foreground">
          {m.internalCode}
        </span>
        <span className="text-[14px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {m.title}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0 text-[10px]"
          style={{ background: `${categoryColor}18`, color: categoryColor }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: categoryColor }} />
          {matterCategoryLabel[m.category]}
        </span>
        <StatusChip status={m.status} />

        <div className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span>主办</span>
          {m.owner ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary">
                {m.owner.name.charAt(0)}
              </span>
              <span className="text-foreground/85">{m.owner.name}</span>
            </>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {/* 行 2：客户 / 对方 / 案由 / 程序 / 收案 / 标的 */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <Field label="委托" tone="primary">
          {m.primaryClient?.name ?? "—"}
        </Field>
        {opposing.length > 0 && (
          <Field label="对方" tone="warn">
            {opposing
              .map(
                (p) =>
                  `${p.name}${p.standing ? `（${litigationStandingLabel[p.standing]}）` : ""}`
              )
              .join("、")}
          </Field>
        )}
        {third.length > 0 && (
          <Field label="三人" tone="purple">
            {third.map((p) => p.name).join("、")}
          </Field>
        )}
        {causeText && <Field label="案由">{causeText}</Field>}
        {procLabel && (
          <Field label="程序">
            {procLabel}
            {current?.caseNumber && (
              <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">
                · {current.caseNumber}
              </span>
            )}
          </Field>
        )}
        {m.intakeDate && (
          <Field label="收案">
            <span className="font-mono tabular">
              {new Date(m.intakeDate).toLocaleDateString("zh-CN")}
            </span>
          </Field>
        )}
        {m.claimAmount && (
          <Field label="标的">
            <span className="font-mono tabular font-medium text-foreground/85">
              {formatCurrency(Number(m.claimAmount), { compact: true })}
            </span>
          </Field>
        )}
      </div>
    </Link>
  );
}

function Field({
  label,
  tone,
  children
}: {
  label: string;
  tone?: "primary" | "warn" | "purple";
  children: React.ReactNode;
}) {
  const dot =
    tone === "primary"
      ? "#5B8DEF"
      : tone === "warn"
        ? "#FB923C"
        : tone === "purple"
          ? "#9B7BF7"
          : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground/70">
        {dot && <span className="h-1 w-1 rounded-full" style={{ background: dot }} />}
        {label}
      </span>
      <span className="text-foreground/90">{children}</span>
    </span>
  );
}

function StatusChip({ status }: { status: MatterRow["status"] }) {
  const tone: Record<MatterRow["status"], string> = {
    PENDING_ACCEPTANCE: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    IN_PROGRESS: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    ON_HOLD: "bg-slate-400/15 text-slate-700 border-slate-400/30",
    CLOSED: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    ARCHIVED: "bg-purple-500/15 text-purple-700 border-purple-500/30"
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium",
        tone[status]
      )}
    >
      {matterStatusLabel[status]}
    </span>
  );
}
