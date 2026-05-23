import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, FileText, AlertTriangle } from "lucide-react";
import { getIntakeById } from "@/server/intakes/actions";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  matterCategoryLabel,
  matterCategoryColor,
  intakeStatusLabel,
  clientTypeLabel
} from "@/lib/enums";
import { ConflictSection } from "./_components/conflict-section";
import { IntakeActions } from "./_components/intake-actions";

export default async function IntakeDetailPage({ params }: { params: { id: string } }) {
  const intake = await getIntakeById(params.id);
  if (!intake) notFound();

  const opposing = intake.parties.filter((p) => p.role === "OPPOSING_PARTY");
  const thirdParty = intake.parties.filter((p) => p.role === "THIRD_PARTY");
  const latestCheckRaw = intake.conflictChecks[0] ?? null;

  // 拉每条 hit 对应的 Matter 详情（编号 / 名 / 案由 / 主办 / 当事人角色）
  let latestCheck: Parameters<typeof ConflictSection>[0]["latestCheck"] = null;
  if (latestCheckRaw) {
    const matterIds = Array.from(
      new Set(
        latestCheckRaw.hits.filter((h) => h.targetType === "Matter").map((h) => h.targetId)
      )
    );
    const matters = matterIds.length
      ? await prisma.matter.findMany({
          where: { id: { in: matterIds }, deletedAt: null },
          select: {
            id: true,
            internalCode: true,
            title: true,
            cause: { select: { name: true } },
            causeFreeText: true,
            owner: { select: { name: true } },
            parties: { select: { name: true, idNumber: true, role: true, standing: true } }
          }
        })
      : [];
    const matterById = new Map(matters.map((m) => [m.id, m]));

    const hitsWithMatter = latestCheckRaw.hits.map((h) => {
      const m = matterById.get(h.targetId);
      const matchedParty = m?.parties.find(
        (p) =>
          (h.matchedField === "name" && p.name === h.matchedValue) ||
          (h.matchedField === "idNumber" && p.idNumber === h.matchedValue)
      );
      return {
        id: h.id,
        hitType: h.hitType,
        targetType: h.targetType,
        targetId: h.targetId,
        matchedName: h.matchedName,
        matchedField: h.matchedField,
        matchedValue: h.matchedValue,
        matchedRatio: h.matchedRatio,
        severity: h.severity,
        reason: h.reason,
        matter: m
          ? {
              id: m.id,
              code: m.internalCode,
              title: m.title,
              causeText: m.cause?.name ?? m.causeFreeText ?? null,
              ownerName: m.owner?.name ?? null,
              partyRole: matchedParty?.role ?? null,
              partyStanding: matchedParty?.standing ?? null
            }
          : null
      };
    });

    // 兼容 V1 旧数据：queryPayload 没有 sameNameClients / idMatchedClients
    const payload = (latestCheckRaw.queryPayload ?? {}) as {
      sameNameClients?: { clientId: string; name: string }[];
      idMatchedClients?: { clientId: string; name: string; idNumber: string }[];
    };

    latestCheck = {
      id: latestCheckRaw.id,
      conclusion: latestCheckRaw.conclusion,
      hits: hitsWithMatter,
      decidedBy: latestCheckRaw.decidedBy,
      decidedAt: latestCheckRaw.decidedAt,
      note: latestCheckRaw.note,
      checkedAt: latestCheckRaw.checkedAt,
      sameNameClients: payload.sameNameClients ?? [],
      idMatchedClients: payload.idMatchedClients ?? []
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/intakes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回收案列表
        </Link>
      </div>

      {/* 头部 */}
      <header className="rounded-xl border border-border bg-card/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FileText className="h-5 w-5 text-primary" />
              {intake.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
                style={{
                  borderColor: `${matterCategoryColor[intake.category]}40`,
                  color: matterCategoryColor[intake.category]
                }}
              >
                {matterCategoryLabel[intake.category]}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {intakeStatusLabel[intake.status]}
              </Badge>
              {intake.matter && (
                <Link
                  href={`/matters/${intake.matter.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/15"
                >
                  已转为案件 {intake.matter.internalCode} →
                </Link>
              )}
            </div>
          </div>

          {intake.status !== "CONVERTED" && intake.status !== "DECLINED" && (
            <IntakeActions intakeId={intake.id} />
          )}
        </div>

        <Separator className="my-5" />

        <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <InfoItem label="案由">
            {intake.cause?.name ?? intake.causeFreeText ?? "—"}
          </InfoItem>
          <InfoItem label="主办律师">{intake.ownerUser?.name ?? "—"}</InfoItem>
          <InfoItem label="委托方">
            {intake.client ? (
              <Link
                href={`/clients/${intake.client.id}`}
                className="text-primary hover:underline"
              >
                {intake.client.name}
              </Link>
            ) : (
              "—"
            )}
          </InfoItem>
          <InfoItem label="收案日期">
            {new Date(intake.receivedAt).toLocaleDateString("zh-CN")}
          </InfoItem>
        </dl>

        {intake.description && (
          <>
            <Separator className="my-5" />
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                描述
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {intake.description}
              </p>
            </div>
          </>
        )}

        {intake.declinedReason && (
          <>
            <Separator className="my-5" />
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                不接案原因
              </div>
              <p className="text-foreground/90">{intake.declinedReason}</p>
            </div>
          </>
        )}
      </header>

      {/* 冲突检索 */}
      <ConflictSection
        intakeId={intake.id}
        intakeClientName={intake.client?.name}
        intakeClientIdNumber={intake.client?.idNumber ?? undefined}
        opposingParties={opposing.map((p) => ({
          name: p.name,
          idNumber: p.idNumber ?? undefined
        }))}
        thirdParties={thirdParty.map((p) => ({
          name: p.name,
          idNumber: p.idNumber ?? undefined
        }))}
        latestCheck={latestCheck}
        canEditConclusion={intake.status !== "CONVERTED" && intake.status !== "DECLINED"}
      />

      {/* 当事人 */}
      <section className="rounded-xl border border-border bg-card/40 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-primary" />
          当事人
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Column title="委托方" color="#5B8DEF">
            {intake.client ? (
              <PartyCard
                name={intake.client.name}
                sub={clientTypeLabel[intake.client.type]}
                href={`/clients/${intake.client.id}`}
              />
            ) : (
              <Empty />
            )}
          </Column>
          <Column title="对方" color="#FB923C">
            {opposing.length === 0 ? (
              <Empty />
            ) : (
              opposing.map((p) => <PartyCard key={p.id} name={p.name} sub={p.idNumber ?? undefined} />)
            )}
          </Column>
          <Column title="第三人" color="#9B7BF7">
            {thirdParty.length === 0 ? (
              <Empty />
            ) : (
              thirdParty.map((p) => (
                <PartyCard key={p.id} name={p.name} sub={p.idNumber ?? undefined} />
              ))
            )}
          </Column>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Column({
  title,
  color,
  children
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function PartyCard({ name, sub, href }: { name: string; sub?: string; href?: string }) {
  const inner = (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="truncate text-sm font-medium">{name}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border py-2 text-center text-[11px] text-muted-foreground">
      —
    </div>
  );
}
