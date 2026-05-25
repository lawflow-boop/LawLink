"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  AlertTriangle,
  Plus,
  Gavel,
  Check,
  Trash2,
  Loader2
} from "lucide-react";
import type { Deadline, Hearing, MatterStage, MatterProcedure } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn, formatDate, daysUntil } from "@/lib/utils";
import { procedureTypeLabel } from "@/lib/enums";
import {
  toggleDeadlineCompleted,
  deleteDeadline,
  deleteHearing
} from "@/server/procedures/actions";
import { AddDeadlineSheet, AddHearingSheet } from "./procedure-forms";

type ProcedureWithChildren = MatterProcedure & {
  deadlines: Deadline[];
  hearings: Hearing[];
  stages: MatterStage[];
};

const deadlineCategoryLabel: Record<Deadline["category"], string> = {
  LIMITATION: "诉讼时效",
  EVIDENCE: "举证期限",
  APPEAL: "上诉期",
  PERFORMANCE: "履行期",
  RESPONSE: "答辩期",
  ENFORCEMENT: "执行申请",
  ARBITRATION_SET_ASIDE: "撤销仲裁期",
  CUSTOM: "其他"
};

export function ProcedureContent({ procedure }: { procedure: ProcedureWithChildren }) {
  const [deadlineSheetOpen, setDeadlineSheetOpen] = useState(false);
  const [hearingSheetOpen, setHearingSheetOpen] = useState(false);

  const isInformational = procedure.engagement === "INFORMATIONAL";

  return (
    <div className="space-y-4">
      {/* 程序信息卡 */}
      <section
        className={cn(
          "rounded-xl border p-5",
          isInformational
            ? "border-dashed border-border bg-card"
            : "border-border bg-card"
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">
                {procedure.customLabel ?? procedureTypeLabel[procedure.type]}
              </h3>
              {isInformational && (
                <Badge variant="outline" className="text-[10px]">
                  前序参考
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {procedure.status === "IN_PROGRESS"
                  ? "进行中"
                  : procedure.status === "CONCLUDED"
                    ? "已结"
                    : "待启动"}
              </Badge>
            </div>
            {procedure.caseNumber && (
              <div className="mt-1 font-mono text-xs text-muted-foreground tabular">
                案号：{procedure.caseNumber}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <Slot label="办理机关">{procedure.handlingAgency ?? "—"}</Slot>
          <Slot label="主审 / 仲裁员">{procedure.handler ?? "—"}</Slot>
          <Slot label="立案日">
            {procedure.acceptedAt ? formatDate(procedure.acceptedAt) : "—"}
          </Slot>
          <Slot label="结案日">
            {procedure.concludedAt ? formatDate(procedure.concludedAt) : "—"}
          </Slot>
        </div>
      </section>

      {/* INFORMATIONAL 程序不显示期限、开庭、阶段（按设计） */}
      {!isInformational && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 期限 */}
          <DeadlinesCard
            deadlines={procedure.deadlines}
            onAdd={() => setDeadlineSheetOpen(true)}
          />

          {/* 开庭 */}
          <HearingsCard
            hearings={procedure.hearings}
            onAdd={() => setHearingSheetOpen(true)}
          />
        </div>
      )}

      <AddDeadlineSheet
        open={deadlineSheetOpen}
        onOpenChange={setDeadlineSheetOpen}
        procedureId={procedure.id}
      />
      <AddHearingSheet
        open={hearingSheetOpen}
        onOpenChange={setHearingSheetOpen}
        procedureId={procedure.id}
      />
    </div>
  );
}

function Slot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-foreground">{children}</div>
    </div>
  );
}

function DeadlinesCard({
  deadlines,
  onAdd
}: {
  deadlines: Deadline[];
  onAdd: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string) {
    startTransition(async () => {
      try {
        await toggleDeadlineCompleted(id);
      } catch {
        toast.error("操作失败");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("删除这条期限？")) return;
    startTransition(async () => {
      try {
        await deleteDeadline(id);
        toast.success("已删除");
      } catch {
        toast.error("删除失败");
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-[#FBBF24]" />
          期限 <span className="text-muted-foreground">({deadlines.length})</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdd} className="h-7 gap-1 text-primary">
          <Plus className="h-3.5 w-3.5" />
          添加期限
        </Button>
      </header>

      {deadlines.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">还没有期限</p>
      ) : (
        <ul className="space-y-2">
          {deadlines.map((d) => {
            const days = daysUntil(d.dueAt);
            const isOverdue = !d.completed && days < 0;
            const isWarn = !d.completed && days <= d.remindDays && days >= 0;
            return (
              <li
                key={d.id}
                className={cn(
                  "group flex items-start gap-3 rounded-md border bg-background px-3 py-2 transition-colors",
                  d.completed
                    ? "border-border opacity-50"
                    : isOverdue
                      ? "border-destructive/40"
                      : isWarn
                        ? "border-[#FBBF24]/40"
                        : "border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(d.id)}
                  disabled={isPending}
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    d.completed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:border-primary"
                  )}
                  aria-label={d.completed ? "标记未完成" : "标记完成"}
                >
                  {d.completed && <Check className="h-2.5 w-2.5" />}
                </button>

                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        d.completed && "line-through text-muted-foreground"
                      )}
                    >
                      {d.title}
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      {deadlineCategoryLabel[d.category]}
                    </Badge>
                  </div>
                  {d.basis && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{d.basis}</div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="font-mono text-xs tabular">
                    {d.completed
                      ? "已完成"
                      : isOverdue
                        ? <span className="text-destructive">逾期 {-days}d</span>
                        : days === 0
                          ? <span className="text-[#FBBF24]">今天</span>
                          : isWarn
                            ? <span className="text-[#FBBF24]">{days}d</span>
                            : <span>{days}d</span>}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground tabular">
                    {new Date(d.dueAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(d.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isPending && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          处理中...
        </div>
      )}
    </section>
  );
}

function HearingsCard({
  hearings,
  onAdd
}: {
  hearings: Hearing[];
  onAdd: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("删除这条开庭记录？")) return;
    startTransition(async () => {
      try {
        await deleteHearing(id);
        toast.success("已删除");
      } catch {
        toast.error("删除失败");
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gavel className="h-4 w-4 text-primary" />
          开庭 <span className="text-muted-foreground">({hearings.length})</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdd} className="h-7 gap-1 text-primary">
          <Plus className="h-3.5 w-3.5" />
          添加开庭
        </Button>
      </header>

      {hearings.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">还没有开庭记录</p>
      ) : (
        <ul className="space-y-2">
          {hearings.map((h) => {
            const upcoming = new Date(h.startsAt) > new Date();
            return (
              <li
                key={h.id}
                className="group rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">{h.title}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {upcoming ? "未召开" : "已召开"}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    <span className="text-foreground/60">时间：</span>
                    <span className="font-mono tabular text-foreground">
                      {new Date(h.startsAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  {h.room && (
                    <div>
                      <span className="text-foreground/60">法庭：</span>
                      <span className="text-foreground">{h.room}</span>
                    </div>
                  )}
                  {h.judge && (
                    <div className="col-span-2">
                      <span className="text-foreground/60">主审：</span>
                      <span className="text-foreground">{h.judge}</span>
                    </div>
                  )}
                  {h.notes && (
                    <div className="col-span-2 mt-1 whitespace-pre-wrap text-foreground/80">
                      {h.notes}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isPending && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          处理中...
        </div>
      )}
    </section>
  );
}
