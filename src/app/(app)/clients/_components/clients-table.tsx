"use client";

import Link from "next/link";
import { Building2, User, Briefcase, Pencil, Phone, Mail } from "lucide-react";
import type { Client, ClientType, Contact } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clientTypeLabel } from "@/lib/enums";

type ClientRow = Client & {
  contacts: Contact[];
  _count: { matters: number; intakes: number };
};

const TypeIcon = ({ type }: { type: ClientType }) => {
  const cls = "h-3.5 w-3.5";
  if (type === "INDIVIDUAL") return <User className={cls} />;
  if (type === "COMPANY") return <Building2 className={cls} />;
  return <Briefcase className={cls} />;
};

export function ClientsTable({
  items,
  onEdit
}: {
  items: ClientRow[];
  onEdit: (c: ClientRow) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 flex flex-col items-center gap-2 py-20 text-center">
        <div className="text-sm text-muted-foreground">还没有客户</div>
        <div className="text-xs text-muted-foreground">
          点击右上角 <span className="text-foreground/80">新建客户</span> 开始
        </div>
      </div>
    );
  }

  return (
    <div className="ll-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[0.68rem] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-2.5">客户</th>
            <th className="px-4 py-2.5">类型</th>
            <th className="px-4 py-2.5">联系方式</th>
            <th className="px-4 py-2.5">主要联系人</th>
            <th className="px-4 py-2.5">案件</th>
            <th className="px-4 py-2.5">标签</th>
            <th className="w-20 px-5 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const primary = c.contacts[0];
            return (
              <tr
                key={c.id}
                className="group border-t border-border transition-colors hover:bg-muted/30"
              >
                <td className="px-5 py-2.5">
                  <Link href={`/clients/${c.id}`} className="block">
                    <div className="text-[0.92rem] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                      {c.name}
                    </div>
                    {c.idNumber && (
                      <div className="mt-1 font-mono text-[10.5px] tracking-wide text-muted-foreground tabular">
                        {c.idNumber}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-[11px]">
                    <TypeIcon type={c.type} />
                    {clientTypeLabel[c.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    {c.phone && (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Phone className="h-3 w-3" strokeWidth={1.8} />
                        <span className="font-mono tabular">{c.phone}</span>
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Mail className="h-3 w-3" strokeWidth={1.8} />
                        {c.email}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {primary ? (
                    <div>
                      <div className="text-[0.875rem] text-foreground/90">{primary.name}</div>
                      {primary.phone && (
                        <div className="font-mono text-[10.5px] text-muted-foreground">
                          {primary.phone}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="ll-stat text-base">{c._count.matters}</span>
                  {c._count.intakes > 0 && (
                    <span className="ml-2 font-mono text-[10.5px] text-muted-foreground tabular">
                      +{c._count.intakes} 收案
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(c)}
                    className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
