import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  User,
  Briefcase,
  Phone,
  Mail,
  Star,
  ExternalLink,
  MessageCircle,
  Wallet,
  Coins,
  Clock,
  FileText
} from "lucide-react";
import { getClientById, getClientFinanceSummary } from "@/server/clients/actions";
import { Badge } from "@/components/ui/badge";
import {
  clientTypeLabel,
  cooperationStatusLabel,
  genderLabel,
  matterCategoryLabel,
  matterStatusLabel
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { InfoRow, Pair } from "@/app/(app)/matters/[id]/_components/info-panel";
import { ClientEditButton } from "./_components/client-edit-button";

const billingStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "生效中",
  CLOSED: "已结"
};
const yuan = (n: number) => `¥${n.toLocaleString()}`;
const dash = <span className="text-muted-foreground/50">—</span>;

const COOP_TONE: Record<string, string> = {
  POTENTIAL: "bg-amber-100 text-amber-800",
  NEGOTIATING: "bg-sky-100 text-sky-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  TERMINATED: "bg-muted text-muted-foreground"
};

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClientById(params.id);
  if (!client) notFound();
  const finance = await getClientFinanceSummary(params.id);

  const isIndividual = client.type === "INDIVIDUAL";
  const TypeIcon = isIndividual ? User : client.type === "COMPANY" ? Building2 : Briefcase;

  return (
    <div className="space-y-4">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回客户列表
      </Link>

      {/* ① 客户信息 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <TypeIcon className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
            <Badge variant="secondary" className="text-[10px]">
              {clientTypeLabel[client.type]}
            </Badge>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                COOP_TONE[client.cooperationStatus] ?? "bg-muted text-muted-foreground"
              )}
            >
              {cooperationStatusLabel[client.cooperationStatus]}
            </span>
          </div>
          <ClientEditButton client={client} />
        </header>

        <div className="overflow-hidden rounded-md border border-border">
          <InfoRow>
            <Pair label="客户编号" tight>
              {client.internalCode ? (
                <span className="font-mono">{client.internalCode}</span>
              ) : (
                dash
              )}
            </Pair>
            <Pair label="客户类型">{clientTypeLabel[client.type]}</Pair>
            <Pair label="合作状态">{cooperationStatusLabel[client.cooperationStatus]}</Pair>
          </InfoRow>
          <InfoRow>
            <Pair label="联系电话">
              {client.phone ? <span className="font-mono">{client.phone}</span> : dash}
            </Pair>
            <Pair label="邮箱">{client.email || dash}</Pair>
            <Pair label="客户来源">{client.source || dash}</Pair>
          </InfoRow>
          <InfoRow>
            <Pair label="所属行业">{client.industry || dash}</Pair>
            <Pair label="住所地" grow>
              {client.address || dash}
            </Pair>
          </InfoRow>
          {isIndividual ? (
            <InfoRow>
              <Pair label="身份证号">
                {client.idNumber ? <span className="font-mono">{client.idNumber}</span> : dash}
              </Pair>
              <Pair label="性别">{client.gender ? genderLabel[client.gender] : dash}</Pair>
              <Pair label="民族">{client.ethnicity || dash}</Pair>
            </InfoRow>
          ) : (
            <InfoRow>
              <Pair label="信用代码">
                {client.idNumber ? <span className="font-mono">{client.idNumber}</span> : dash}
              </Pair>
              <Pair label="法定代表人" grow>
                {client.legalRep || dash}
              </Pair>
            </InfoRow>
          )}
          {client.tags.length > 0 && (
            <InfoRow>
              <Pair label="标签" grow>
                <span className="flex flex-wrap gap-1">
                  {client.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </span>
              </Pair>
            </InfoRow>
          )}
          {client.notes && (
            <InfoRow>
              <Pair label="备注" grow>
                <span className="whitespace-pre-wrap">{client.notes}</span>
              </Pair>
            </InfoRow>
          )}
        </div>
      </section>

      {/* ② 财务概览 */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <FinanceStat icon={<Wallet className="h-4 w-4" />} label="签约合同总额" value={yuan(finance.contractTotal)} accent />
        <FinanceStat icon={<Coins className="h-4 w-4" />} label="已收款" value={yuan(finance.received)} />
        <FinanceStat icon={<Clock className="h-4 w-4" />} label="待收款" value={yuan(finance.pending)} />
        <FinanceStat icon={<Briefcase className="h-4 w-4" />} label="关联案件" value={`${finance.matterCount} 件`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* 联系人 */}
        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4 text-primary" />
              联系人 <span className="text-muted-foreground">({client.contacts.length})</span>
            </h2>
          </header>

          {client.contacts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">还没添加联系人</p>
          ) : (
            <ul className="space-y-2">
              {client.contacts.map((c) => (
                <li key={c.id} className="rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      {c.name}
                      {c.isPrimary && <Star className="h-3 w-3 fill-primary text-primary" />}
                    </span>
                    {c.title && <span className="text-xs text-muted-foreground">{c.title}</span>}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {c.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span className="font-mono text-foreground">{c.phone}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3" />
                        <span className="text-foreground">{c.email}</span>
                      </div>
                    )}
                    {c.wechat && (
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3 w-3" />
                        <span className="text-foreground">{c.wechat}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 关联案件 */}
        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-3">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Briefcase className="h-4 w-4 text-primary" />
              关联案件 <span className="text-muted-foreground">({client.matters.length})</span>
            </h2>
          </header>

          {client.matters.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无关联案件</p>
          ) : (
            <ul className="divide-y divide-border">
              {client.matters.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/matters/${m.id}`}
                    className="flex items-center justify-between py-2.5 transition-colors hover:bg-popover"
                  >
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-[13px] font-medium">{m.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{m.internalCode}</span>
                        <span>·</span>
                        <span>{matterCategoryLabel[m.category]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px]">
                        {matterStatusLabel[m.status]}
                      </Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ③ 签约合同 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            签约合同 <span className="text-muted-foreground">({finance.billings.length})</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            合计 <span className="font-mono text-foreground">{yuan(finance.contractTotal)}</span>
          </span>
        </header>
        {finance.billings.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">暂无签约合同</p>
        ) : (
          <ul className="divide-y divide-border">
            {finance.billings.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/matters/${b.matter.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-popover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{b.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{b.matter.internalCode}</span>
                      <span>·</span>
                      <span className="truncate">{b.matter.title}</span>
                      {b.signedAt && (
                        <>
                          <span>·</span>
                          <span>{new Date(b.signedAt).toLocaleDateString("zh-CN")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm">{yuan(b.contractAmount)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {billingStatusLabel[b.status] ?? b.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FinanceStat({
  icon,
  label,
  value,
  accent
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        accent ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={accent ? "text-primary" : ""}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}
