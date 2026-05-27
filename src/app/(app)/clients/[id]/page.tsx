import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  User,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Tag,
  Star,
  ExternalLink,
  MessageCircle
} from "lucide-react";
import { getClientById } from "@/server/clients/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { clientTypeLabel, matterCategoryLabel, matterStatusLabel } from "@/lib/enums";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClientById(params.id);
  if (!client) notFound();

  const TypeIcon =
    client.type === "INDIVIDUAL" ? User : client.type === "COMPANY" ? Building2 : Briefcase;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回客户列表
        </Link>
      </div>

      {/* 头部 */}
      <header className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/40">
              <TypeIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{clientTypeLabel[client.type]}</Badge>
                {client.source && (
                  <span className="text-xs">案源：{client.source}</span>
                )}
              </div>
              {client.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {client.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-5" />

        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <InfoItem icon={<Phone className="h-3.5 w-3.5" />} label="电话" mono>
            {client.phone ?? "—"}
          </InfoItem>
          <InfoItem icon={<Mail className="h-3.5 w-3.5" />} label="邮箱">
            {client.email ?? "—"}
          </InfoItem>
          <InfoItem icon={<MapPin className="h-3.5 w-3.5" />} label="地址">
            {client.address ?? "—"}
          </InfoItem>
          <InfoItem
            icon={<TypeIcon className="h-3.5 w-3.5" />}
            label={client.type === "INDIVIDUAL" ? "身份证号" : "统一社会信用代码"}
            mono
          >
            {client.idNumber ?? "—"}
          </InfoItem>
          {client.type !== "INDIVIDUAL" && (
            <InfoItem icon={<User className="h-3.5 w-3.5" />} label="法定代表人">
              {client.legalRep ?? "—"}
            </InfoItem>
          )}
        </dl>

        {client.notes && (
          <>
            <Separator className="my-5" />
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                备注
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{client.notes}</p>
            </div>
          </>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* 联系人 */}
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <User className="h-4 w-4 text-primary" />
              联系人 <span className="text-muted-foreground">({client.contacts.length})</span>
            </h2>
          </header>

          {client.contacts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              还没添加联系人
            </p>
          ) : (
            <ul className="space-y-3">
              {client.contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      {c.name}
                      {c.isPrimary && (
                        <Star className="h-3 w-3 fill-primary text-primary" />
                      )}
                    </span>
                    {c.title && (
                      <span className="text-xs text-muted-foreground">{c.title}</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {c.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        <span className="font-mono tabular text-foreground">{c.phone}</span>
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
        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-3">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Briefcase className="h-4 w-4 text-primary" />
              关联案件{" "}
              <span className="text-muted-foreground">({client.matters.length})</span>
            </h2>
          </header>

          {client.matters.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              暂无关联案件
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {client.matters.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/matters/${m.id}`}
                    className="flex items-center justify-between py-3 transition-colors hover:bg-popover"
                  >
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-sm font-medium">{m.title}</div>
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
    </div>
  );
}

function InfoItem({
  icon,
  label,
  mono,
  children
}: {
  icon: React.ReactNode;
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1 ${mono ? "font-mono tabular" : ""}`}>{children}</dd>
    </div>
  );
}
