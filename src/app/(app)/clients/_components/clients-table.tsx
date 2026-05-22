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
      <div className="rounded-xl border border-dashed border-border bg-card/20 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          还没有客户。点击右上角 <span className="text-foreground">新建客户</span> 开始
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-popover/30">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-3 font-medium">客户</th>
            <th className="px-5 py-3 font-medium">类型</th>
            <th className="px-5 py-3 font-medium">联系方式</th>
            <th className="px-5 py-3 font-medium">主要联系人</th>
            <th className="px-5 py-3 font-medium">案件</th>
            <th className="px-5 py-3 font-medium">标签</th>
            <th className="w-20 px-5 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((c) => {
            const primary = c.contacts[0];
            return (
              <tr key={c.id} className="group transition-colors hover:bg-popover/40">
                <td className="px-5 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {c.name}
                  </Link>
                  {c.idNumber && (
                    <div className="font-mono text-xs text-muted-foreground">{c.idNumber}</div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2 py-0.5 text-xs">
                    <TypeIcon type={c.type} />
                    {clientTypeLabel[c.type]}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    {c.phone && (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Phone className="h-3 w-3" />
                        <span className="tabular">{c.phone}</span>
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {primary ? (
                    <div>
                      <div className="text-foreground">{primary.name}</div>
                      {primary.phone && (
                        <div className="font-mono text-xs">{primary.phone}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className="font-mono text-sm tabular">{c._count.matters}</span>
                  {c._count.intakes > 0 && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground tabular">
                      +{c._count.intakes} 收案
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(c)}
                    className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" />
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
