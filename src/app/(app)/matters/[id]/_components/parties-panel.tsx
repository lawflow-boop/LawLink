"use client";

import Link from "next/link";
import { ChevronRight, Phone, MapPin, IdCard, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clientTypeLabel, litigationStandingLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";
import type { MatterPayload } from "./matter-detail-tabs";

type PartyRow = MatterPayload["parties"][number];

export function PartiesPanel({ matter }: { matter: MatterPayload }) {
  const ourSide = matter.parties.filter((p) => p.role === "CLIENT_PARTY");
  const opposing = matter.parties.filter((p) => p.role === "OPPOSING_PARTY");
  const thirdParty = matter.parties.filter((p) => p.role === "THIRD_PARTY");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Column title="委托方" accent="#5B8DEF">
        {matter.clientLinks.map((cl) => (
          <ClientCard
            key={cl.clientId}
            name={cl.client.name}
            typeLabel={clientTypeLabel[cl.client.type]}
            href={`/clients/${cl.client.id}`}
            primary={cl.isPrimary}
          />
        ))}
        {ourSide.map((p) => (
          <PartyCard key={p.id} party={p} />
        ))}
        {matter.clientLinks.length + ourSide.length === 0 && <Empty />}
      </Column>

      <Column title="对方" accent="#FB923C">
        {opposing.length === 0 ? <Empty /> : opposing.map((p) => <PartyCard key={p.id} party={p} />)}
      </Column>

      <Column title="第三人" accent="#9B7BF7">
        {thirdParty.length === 0 ? <Empty /> : thirdParty.map((p) => <PartyCard key={p.id} party={p} />)}
      </Column>
    </div>
  );
}

function Column({
  title,
  accent,
  children
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ll-surface rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ClientCard({
  name,
  typeLabel,
  href,
  primary
}: {
  name: string;
  typeLabel: string;
  href: string;
  primary: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[88px] flex-col rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
          <User className="h-3 w-3 text-muted-foreground" strokeWidth={1.8} />
          {name}
        </span>
        {primary && <Badge variant="secondary" className="px-1.5 text-[10px]">主</Badge>}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{typeLabel}</div>
      <div className="mt-auto flex items-center justify-end pt-2 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        客户档案 <ChevronRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function PartyCard({ party }: { party: PartyRow }) {
  const standing = party.standing ? litigationStandingLabel[party.standing] : null;
  return (
    <div className="flex min-h-[88px] flex-col rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{party.name}</span>
        {standing && (
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {standing}
          </span>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        {party.idNumber && (
          <Line icon={<IdCard className="h-3 w-3" />} value={party.idNumber} mono />
        )}
        {party.phone && (
          <Line icon={<Phone className="h-3 w-3" />} value={party.phone} mono />
        )}
        {party.address && (
          <Line icon={<MapPin className="h-3 w-3" />} value={party.address} />
        )}
        {!party.idNumber && !party.phone && !party.address && (
          <span className="italic text-muted-foreground/60">无补充信息</span>
        )}
      </div>
    </div>
  );
}

function Line({ icon, value, mono }: { icon: React.ReactNode; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className={cn("truncate", mono && "font-mono")} title={value}>
        {value}
      </span>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border py-3 text-center text-[11px] text-muted-foreground">
      —
    </div>
  );
}
