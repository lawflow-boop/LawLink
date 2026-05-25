"use client";

import Link from "next/link";
import type { Matter, PartyRole, LitigationStanding, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
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

export function MattersTable({ items }: { items: MatterRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 flex flex-col items-center gap-2 py-20 text-center">
        <div className="text-base text-muted-foreground">没有匹配的案件</div>
        <div className="text-xs text-muted-subtle">
          点击右上角 <span className="text-foreground/80">新建收案</span> 开始
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr
              className="border-b border-border text-left text-[10px] tracking-wider text-muted-foreground/80"
            >
              <th className="px-4 py-2.5 font-medium">案件</th>
              <th className="px-3 py-2.5 font-medium">类别·状态</th>
              <th className="px-3 py-2.5 font-medium">当事人</th>
              <th className="px-3 py-2.5 font-medium">主办</th>
              <th className="px-3 py-2.5 font-medium">当前程序 / 案号</th>
              <th className="px-3 py-2.5 text-right font-medium">收案 / 标的</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m, idx) => (
              <MatterRowTr key={m.id} m={m} first={idx === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatterRowTr({ m, first }: { m: MatterRow; first: boolean }) {
  const current = m.procedures[0];
  const opposing = m.parties.filter((p) => p.role === "OPPOSING_PARTY");
  const third = m.parties.filter((p) => p.role === "THIRD_PARTY");
  const categoryColor = matterCategoryColor[m.category];
  const causeText = m.cause?.name ?? m.causeFreeText ?? null;

  return (
    <tr
      className={cn(
        "group transition-colors hover:bg-muted/30",
        !first && "border-t border-border"
      )}
    >
      {/* 案件：编号 + 案件名 + 案由 */}
      <td className="px-4 py-3 align-top">
        <Link href={`/matters/${m.id}`} className="block">
          <div className="font-mono text-[10.5px] tracking-wider text-muted-foreground tabular">
            {m.internalCode}
          </div>
          <div className="mt-0.5 text-[14px] font-medium italic leading-snug text-foreground transition-colors group-hover:text-primary">
            {m.title}
          </div>
          {causeText && (
            <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {causeText}
            </div>
          )}
        </Link>
      </td>

      {/* 类别 + 状态 */}
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col gap-1">
          <span
            className="inline-flex w-fit items-center gap-1 rounded-sm px-2 py-0.5 text-[10px]"
            style={{ background: `${categoryColor}14`, color: categoryColor }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: categoryColor }} />
            {matterCategoryLabel[m.category]}
          </span>
          <Badge
            variant="outline"
            className="w-fit border-border px-1.5 py-0 text-[10px] font-normal"
          >
            {matterStatusLabel[m.status]}
          </Badge>
        </div>
      </td>

      {/* 当事人：委托 / 对方 / 第三人 三行紧凑 */}
      <td className="px-3 py-3 align-top text-[11.5px]">
        <PartyLine
          dot="#5B8DEF"
          label="委托"
          text={m.primaryClient?.name ?? "—"}
        />
        {opposing.length > 0 && (
          <PartyLine
            dot="#FB923C"
            label="对方"
            text={opposing
              .map(
                (p) =>
                  `${p.name}${p.standing ? `(${litigationStandingLabel[p.standing]})` : ""}`
              )
              .join("、")}
          />
        )}
        {third.length > 0 && (
          <PartyLine
            dot="#9B7BF7"
            label="三人"
            text={third.map((p) => p.name).join("、")}
          />
        )}
      </td>

      {/* 主办律师 */}
      <td className="px-3 py-3 align-top text-[11.5px]">
        {m.owner ? (
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">
              {m.owner.name.charAt(0)}
            </span>
            <span className="truncate text-foreground/85">{m.owner.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* 当前程序 / 案号 */}
      <td className="px-3 py-3 align-top text-[11.5px]">
        {current ? (
          <div>
            <div className="text-[12.5px] italic text-foreground/85">
              {procedureTypeLabel[current.type as keyof typeof procedureTypeLabel]}
            </div>
            {current.caseNumber ? (
              <div className="mt-0.5 font-mono text-[10.5px] tabular text-muted-foreground">
                {current.caseNumber}
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] italic text-muted-foreground/60">未立案</div>
            )}
            {m._count.procedures > 1 && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                共 {m._count.procedures} 个程序
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* 收案日 / 标的 */}
      <td className="px-3 py-3 align-top text-right text-[11.5px]">
        {m.intakeDate ? (
          <div className="font-mono text-[10.5px] tabular text-muted-foreground">
            {new Date(m.intakeDate).toLocaleDateString("zh-CN")}
          </div>
        ) : (
          <div className="text-[10px] italic text-muted-foreground/60">未收案</div>
        )}
        {m.claimAmount ? (
          <div className={cn("mt-0.5 font-mono tabular text-[12px] font-medium text-foreground/85")}>
            {formatCurrency(Number(m.claimAmount), { compact: true })}
          </div>
        ) : (
          <div className="mt-0.5 text-[10px] italic text-muted-foreground/60">无标的</div>
        )}
      </td>
    </tr>
  );
}

function PartyLine({ dot, label, text }: { dot: string; label: string; text: string }) {
  return (
    <div className="flex items-baseline gap-1.5 leading-tight">
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/70">
        <span className="h-1 w-1 rounded-full" style={{ background: dot }} />
        {label}
      </span>
      <span className="line-clamp-1 text-foreground/85" title={text}>
        {text}
      </span>
    </div>
  );
}
