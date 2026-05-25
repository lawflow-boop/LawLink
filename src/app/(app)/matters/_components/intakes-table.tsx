"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { IntakeStatus, ConflictSeverity } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { matterCategoryLabel, matterCategoryColor, intakeStatusLabel } from "@/lib/enums";

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
};

function getHighestSeverity(severities: ConflictSeverity[]): ConflictSeverity | null {
  const order = ["LOW", "MEDIUM", "HIGH", "BLOCKING"] as const;
  let max: ConflictSeverity | null = null;
  for (const s of severities) {
    if (!max || order.indexOf(s) > order.indexOf(max)) max = s;
  }
  return max;
}

export function IntakesTable({ items }: { items: IntakeRow[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-md flex flex-col items-center gap-2 py-20 text-center">
        <div className="text-base text-muted-foreground">
          暂无待审批收案
        </div>
        <div className="text-xs text-muted-subtle">
          点击右上角{" "}
          <span className="text-foreground/80">新建收案</span> 开始
        </div>
      </div>
    );
  }

  return (
    <div className="ll-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left text-[0.6rem] text-muted-foreground/80"
          >
            <th className="px-5 py-2.5 font-semibold">案件标题</th>
            <th className="px-4 py-2.5 font-semibold">类别</th>
            <th className="px-4 py-2.5 font-semibold">委托方</th>
            <th className="px-4 py-2.5 font-semibold">相对方</th>
            <th className="px-4 py-2.5 font-semibold">利益冲突</th>
            <th className="px-4 py-2.5 font-semibold">状态</th>
            <th className="px-5 py-2.5 text-right font-semibold">咨询日</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const sev = it.conflictChecks[0]
              ? getHighestSeverity(it.conflictChecks[0].hits.map((h) => h.severity))
              : null;
            return (
              <tr
                key={it.id}
                className="group transition-colors hover:bg-muted/30"
                style={
                  idx > 0 ? { borderTop: "1px solid hsl(var(--border))" } : undefined
                }
              >
                <td className="px-5 py-2.5">
                  <Link href={`/intakes/${it.id}`} className="block">
                    <div className="text-[1.05rem] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                      {it.title}
                    </div>
                    {it.cause && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {it.cause.name}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]"
                    style={{
                      borderColor: `${matterCategoryColor[it.category]}50`,
                      color: matterCategoryColor[it.category],
                      background: `${matterCategoryColor[it.category]}10`
                    }}
                  >
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: matterCategoryColor[it.category] }}
                    />
                    {matterCategoryLabel[it.category]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[0.875rem] text-foreground/90">
                  {it.client ? (
                    it.client.name
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[0.875rem] text-muted-foreground">
                  {it.parties.length > 0 ? (
                    <span className="line-clamp-1">
                      {it.parties.map((p) => p.name).join("、")}
                    </span>
                  ) : (
                    <span className="text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <SeverityBadge severity={sev} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="outline"
                    className="border-border bg-muted/30 text-[10px] font-normal"
                  >
                    {intakeStatusLabel[it.status]}
                  </Badge>
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-[11px] text-muted-foreground tabular">
                  {new Date(it.receivedAt).toLocaleDateString("zh-CN")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ConflictSeverity | null }) {
  if (!severity)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        未检索
      </span>
    );

  const meta: Record<ConflictSeverity, { color: string; label: string; Icon: typeof AlertTriangle }> = {
    BLOCKING: { color: "text-rose-600", label: "阻塞", Icon: AlertTriangle },
    HIGH: { color: "text-orange-500", label: "高", Icon: AlertTriangle },
    MEDIUM: { color: "text-amber-500", label: "中", Icon: AlertTriangle },
    LOW: { color: "text-emerald-600", label: "低", Icon: CheckCircle2 }
  };
  const { color, label, Icon } = meta[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {label}
    </span>
  );
}
