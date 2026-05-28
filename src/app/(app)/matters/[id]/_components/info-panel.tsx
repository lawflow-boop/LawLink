"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  matterCategoryLabel,
  matterStatusLabel
} from "@/lib/enums";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { MatterPayload, UserOption, FinancePayload } from "./matter-detail-tabs";
import { TeamEditorDialog } from "./team-editor-dialog";
import { PartiesPanel } from "./parties-panel";
import { AddReminderDialog } from "./add-reminder-dialog";

export function InfoPanel({
  matter,
  userOptions,
  finance
}: {
  matter: MatterPayload;
  userOptions: UserOption[];
  finance: FinancePayload;
}) {
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

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
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const sortedMembers = matter.members.slice().sort((a, b) => {
    const order = { LEAD: 0, CO_LEAD: 1, ASSISTANT: 2 } as const;
    return order[a.role] - order[b.role];
  });
  const lead = sortedMembers.find((m) => m.role === "LEAD");
  const others = sortedMembers.filter((m) => m.role !== "LEAD");

  // 取第一个 ENGAGED 程序的 caseNumber 用作展示（程序级字段如法院/法官/诉讼地位
  // 已不在本卡展示，请到对应程序 tab 查看）
  const firstProc = matter.procedures.find((p) => p.engagement === "ENGAGED");
  const caseNumber = firstProc?.caseNumber ?? null;

  const primaryClientName = matter.primaryClient?.name
    ?? matter.clientLinks.find((cl) => cl.isPrimary)?.client.name
    ?? matter.clientLinks[0]?.client.name
    ?? null;

  const opposingNames = matter.parties
    .filter((p) => p.role === "OPPOSING_PARTY")
    .map((p) => p.name);
  const thirdNames = matter.parties
    .filter((p) => p.role === "THIRD_PARTY")
    .map((p) => p.name);

  // 重要时限及提醒：合并 期限 + 开庭 + 任务（未完成且有 dueAt）
  const upcomingTasks = matter.tasks
    .filter((t) => !t.completed && t.dueAt)
    .map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      date: new Date(t.dueAt!),
      procedureLabel: "提醒"
    }));

  const allEvents = [
    ...upcomingDeadlines.map((d) => ({
      kind: "deadline" as const,
      id: d.id,
      title: d.title,
      date: new Date(d.dueAt),
      procedureLabel: d.procedureLabel
    })),
    ...upcomingHearings.map((h) => ({
      kind: "hearing" as const,
      id: h.id,
      title: h.title,
      date: new Date(h.startsAt),
      procedureLabel: h.procedureLabel
    })),
    ...upcomingTasks
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-4">
      {/* —— 左：案件信息（dense 两列）；右：近期事件迷你 —— */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="rounded-lg border border-border bg-card lg:col-span-8">
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[13px] font-medium">案件信息</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTeamEditorOpen(true)}
              className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-primary"
            >
              <Pencil className="h-3 w-3" strokeWidth={1.8} />
              编辑
            </Button>
          </header>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 px-4 py-3 text-[12.5px] md:grid-cols-2">
            <Row label="系统编号">
              <span className="font-mono tabular">{matter.internalCode}</span>
            </Row>
            <Row label="收案日">
              {matter.intakeDate ? formatDate(matter.intakeDate) : "—"}
            </Row>

            <Row label="案号">
              <span className="font-mono tabular">{caseNumber ?? "—"}</span>
            </Row>
            <Row label="案由">{matter.cause?.name ?? matter.causeFreeText ?? "—"}</Row>

            <Row label="类型">{matterCategoryLabel[matter.category]}</Row>
            <Row label="状态">{matterStatusLabel[matter.status]}</Row>

            <Row label="主办律师">{lead ? lead.user.name : "—"}</Row>
            <Row label="协办">
              {others.length === 0
                ? "—"
                : others.map((m) => `${m.user.name}（${m.role === "CO_LEAD" ? "协办" : "助理"}）`).join("，")}
            </Row>

            <Row label="委托人">{primaryClientName ?? "—"}</Row>
            <Row label="对方">
              {opposingNames.length === 0 ? "—" : opposingNames.join("、")}
            </Row>

            <Row label="第三人">{thirdNames.length === 0 ? "—" : thirdNames.join("、")}</Row>
            <Row label="标的">
              {matter.claimAmount ? (
                <span className="font-mono tabular">¥{Number(matter.claimAmount).toLocaleString()}</span>
              ) : (
                "—"
              )}
            </Row>
          </dl>
        </section>

        {/* —— 右：重要时限及提醒 mini —— */}
        <section className="rounded-lg border border-border bg-card lg:col-span-4">
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-[13px] font-medium">
              重要时限及提醒
              {allEvents.length > 0 && (
                <span className="ml-1 text-[11px] text-muted-foreground">({allEvents.length})</span>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReminderOpen(true)}
              className="h-6 gap-1 px-1.5 text-[11px] text-primary"
              title="新建重要时限 / 提醒"
            >
              <Plus className="h-3 w-3" />
              新建
            </Button>
          </header>
          {allEvents.length === 0 ? (
            <p className="py-6 text-center text-[11.5px] text-muted-foreground">
              暂无开庭 / 期限 / 提醒
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {allEvents.slice(0, 6).map((e) => {
                const days = Math.ceil(
                  (e.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const isOverdue = days < 0;
                const isWarn = !isOverdue && days <= 3;
                return (
                  <li key={`${e.kind}-${e.id}`} className="px-3 py-1.5 text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-1 py-0 text-[9.5px]",
                          e.kind === "hearing"
                            ? "bg-blue-500/10 text-blue-700"
                            : e.kind === "task"
                              ? "bg-primary/10 text-primary"
                              : "bg-amber-500/10 text-amber-700"
                        )}
                      >
                        {e.kind === "hearing" ? "庭" : e.kind === "task" ? "提" : "限"}
                      </span>
                      <span
                        className={cn(
                          "font-mono tabular text-[11px]",
                          isOverdue
                            ? "text-destructive"
                            : isWarn
                              ? "text-amber-500"
                              : "text-muted-foreground"
                        )}
                      >
                        {isOverdue ? `逾期 ${-days}d` : days === 0 ? "今天" : `${days}d`}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate" title={e.title}>{e.title}</div>
                    <div className="font-mono text-[10px] tabular text-muted-foreground">
                      {e.date.toLocaleDateString("zh-CN")} · {e.procedureLabel}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* —— 参与方（仅在有相对方时显示，否则上面"对方/第三人"已经覆盖）—— */}
      {(opposingNames.length > 0 || thirdNames.length > 0 || matter.clientLinks.length > 1) && (
        <PartiesPanel matter={matter} />
      )}

      <TeamEditorDialog
        open={teamEditorOpen}
        onOpenChange={setTeamEditorOpen}
        matterId={matter.id}
        matterMeta={{
          internalCode: matter.internalCode,
          intakeDate: matter.intakeDate ?? null,
          category: matter.category,
          title: matter.title,
          causeId: matter.causeId ?? null,
          causeFreeText: matter.causeFreeText ?? null,
          claimAmount:
            matter.claimAmount === null || matter.claimAmount === undefined
              ? null
              : Number(matter.claimAmount),
          ourStanding: matter.ourStanding ?? null
        }}
        currentOwnerId={matter.ownerId}
        currentMembers={matter.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          name: m.user.name
        }))}
        userOptions={userOptions}
      />
      <AddReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        matterId={matter.id}
      />
    </div>
  );
}

/* —— Sub-components —— */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <dt className="w-24 shrink-0 text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-foreground/95">{children}</dd>
    </div>
  );
}

