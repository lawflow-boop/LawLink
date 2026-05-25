"use client";

import { useState } from "react";
import {
  Users,
  CalendarClock,
  Gavel,
  FileText,
  Download,
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { userRoleLabel } from "@/lib/enums";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { calcCourtFee } from "@/lib/legal-calc";
import type { MatterPayload, UserOption } from "./matter-detail-tabs";
import type { DocumentPayload } from "./documents-panel";
import { TeamEditorDialog } from "./team-editor-dialog";
import { PartiesPanel } from "./parties-panel";

export function InfoPanel({
  matter,
  intakeContracts,
  userOptions
}: {
  matter: MatterPayload;
  intakeContracts: DocumentPayload[];
  userOptions: UserOption[];
}) {
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);

  const upcomingDeadlines = matter.procedures
    .flatMap((p) =>
      p.deadlines
        .filter((d) => !d.completed)
        .map((d) => ({ ...d, procedureLabel: p.customLabel ?? p.type }))
    )
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);

  const upcomingHearings = matter.procedures
    .flatMap((p) =>
      p.hearings
        .filter((h) => new Date(h.startsAt) >= new Date())
        .map((h) => ({ ...h, procedureLabel: p.customLabel ?? p.type }))
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-5">
      {/* 4 数据点（H1 已展示编号/类别/状态/名/客户/案由） */}
      <section className="ll-surface rounded-lg border border-border p-4">
        <dl className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
          <Datum label="案由">
            {matter.cause?.name ?? matter.causeFreeText ?? "—"}
          </Datum>
          <Datum label="涉案标的">
            {matter.claimAmount ? (
              <>
                <span className="font-mono">{formatCurrency(Number(matter.claimAmount))}</span>
                <CourtFeeHint amount={Number(matter.claimAmount)} />
              </>
            ) : (
              "—"
            )}
          </Datum>
          <Datum label="收案日">
            {matter.intakeDate ? formatDate(matter.intakeDate) : "—"}
          </Datum>
          <Datum label="立案日">
            {matter.firstAcceptedAt ? formatDate(matter.firstAcceptedAt) : "—"}
          </Datum>
        </dl>
      </section>

      {/* 主区两列 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 左 */}
        <div className="space-y-4 lg:col-span-8">
          {/* 当事人 */}
          <section className="ll-surface p-5">
            <CardHeader title="当事人" icon={Users} />
            <div className="mt-3">
              <PartiesPanel matter={matter} />
            </div>
          </section>

          {/* 近期期限 */}
          <section className="ll-surface p-5">
            <CardHeader title="近期期限" icon={CalendarClock} />
            {upcomingDeadlines.length === 0 ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                暂无未完成的期限
              </p>
            ) : (
              <ul className="mt-3 -mx-2">
                {upcomingDeadlines.map((d) => {
                  const days = Math.ceil(
                    (new Date(d.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  const isOverdue = days < 0;
                  const isWarn = !isOverdue && days <= 3;
                  return (
                    <li
                      key={d.id}
                      className="ll-row flex items-center justify-between gap-3 rounded-md px-2 py-2"
                    >
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-[0.875rem] font-medium">{d.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {d.procedureLabel}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={cn(
                            "font-mono text-sm tabular",
                            isOverdue
                              ? "text-destructive"
                              : isWarn
                                ? "text-amber-500"
                                : "text-foreground"
                          )}
                        >
                          {isOverdue
                            ? `逾期 ${-days}d`
                            : days === 0
                              ? "今天"
                              : `${days}d`}
                        </div>
                        <div className="font-mono text-[10px] tabular text-muted-foreground">
                          {new Date(d.dueAt).toLocaleDateString("zh-CN")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 近期开庭 */}
          <section className="ll-surface p-5">
            <CardHeader title="近期开庭" icon={Gavel} />
            {upcomingHearings.length === 0 ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">暂无</p>
            ) : (
              <ul className="mt-3 -mx-2">
                {upcomingHearings.map((h) => (
                  <li key={h.id} className="ll-row rounded-md px-2 py-2">
                    <div className="text-[0.875rem] font-medium">{h.title}</div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground tabular">
                      {new Date(h.startsAt).toLocaleString("zh-CN", {
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      <span className="ml-2 text-muted-subtle">· {h.procedureLabel}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* 右 */}
        <div className="space-y-4 lg:col-span-4">
          {/* 团队 */}
          <section className="ll-surface p-6">
            <CardHeader
              title="团队"
              icon={Users}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTeamEditorOpen(true)}
                  className="h-7 gap-1 text-primary"
                >
                  <Pencil className="h-3 w-3" strokeWidth={1.8} />
                  编辑
                </Button>
              }
            />
            <ul className="mt-3 space-y-2">
              {matter.members
                .slice()
                .sort((a, b) => {
                  const order = { LEAD: 0, CO_LEAD: 1, ASSISTANT: 2 } as const;
                  return order[a.role] - order[b.role];
                })
                .map((m) => (
                  <li key={m.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium",
                          m.role === "LEAD"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground/70"
                        )}
                      >
                        {m.user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-[0.875rem] font-medium">{m.user.name}</div>
                        <div className="text-[10.5px] text-muted-foreground">
                          {userRoleLabel[m.user.role]}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[0.58rem]",
                        m.role === "LEAD" ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {m.role === "LEAD" ? "主办" : m.role === "CO_LEAD" ? "协办" : "助理"}
                    </span>
                  </li>
                ))}
            </ul>
          </section>

          {/* 委托合同 */}
          <section className="ll-surface p-6">
            <CardHeader title="委托合同" icon={FileText} />
            {intakeContracts.length === 0 ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                收案时未上传委托合同
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {intakeContracts.map((d) => (
                  <li
                    key={d.id}
                    className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-border"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" strokeWidth={1.6} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-[0.82rem] font-medium">{d.name}</div>
                      <div className="font-mono text-[10px] tabular text-muted-foreground">
                        {d.size ? `${(d.size / 1024).toFixed(0)} KB` : ""} ·{" "}
                        {new Date(d.createdAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                    <a
                      href={`/api/documents/${d.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground transition-colors hover:text-primary"
                      aria-label="下载"
                    >
                      <Download className="h-4 w-4" strokeWidth={1.6} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>

      <TeamEditorDialog
        open={teamEditorOpen}
        onOpenChange={setTeamEditorOpen}
        matterId={matter.id}
        currentOwnerId={matter.ownerId}
        currentMembers={matter.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          name: m.user.name
        }))}
        userOptions={userOptions}
      />
    </div>
  );
}

/* —— Sub-components —— */

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-[13px] text-foreground">{children}</div>
    </div>
  );
}

function CourtFeeHint({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  const res = calcCourtFee({ caseType: "PROPERTY", amount });
  return (
    <div className="mt-0.5 text-[10px] text-muted-foreground">
      诉讼费约 <span className="font-mono">¥{res.fee.toLocaleString()}</span>
      <span className="ml-1 text-muted-foreground/60">/ 简易 ¥{res.feeSimplified.toLocaleString()}</span>
    </div>
  );
}

function CardHeader({
  title,
  icon: Icon,
  action
}: {
  title: string;
  icon: typeof Users;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
        <span className="text-[15px] italic">{title}</span>
      </div>
      {action}
    </header>
  );
}
