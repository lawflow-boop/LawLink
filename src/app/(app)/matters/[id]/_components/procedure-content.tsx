"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  AlertTriangle,
  Plus,
  Gavel,
  Check,
  Trash2,
  Loader2,
  StickyNote,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ScanLine,
  ScanText
} from "lucide-react";
import type {
  Deadline,
  Hearing,
  MatterStage,
  MatterProcedure,
  ProcedureMemo
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn, daysUntil } from "@/lib/utils";
import { procedureTypeLabel } from "@/lib/enums";
import {
  addDeadline,
  addHearing,
  toggleDeadlineCompleted,
  deleteDeadline,
  deleteHearing,
  addProcedureMemo,
  deleteProcedureMemo
} from "@/server/procedures/actions";
import type { DeadlineCreateInput } from "@/server/procedures/schemas";
import { createExpress, deleteExpress } from "@/server/express/actions";
import { parseExpressLabel } from "@/server/ai/parse-express";
import { parseSummons } from "@/server/ai/parse-summons";
import type { ExpressItem } from "./info-extras";

type ProcedureWithChildren = MatterProcedure & {
  deadlines: Deadline[];
  hearings: Hearing[];
  stages: MatterStage[];
  memos: ProcedureMemo[];
};

// 聚合后带程序标签的行类型
type HearingRowItem = Hearing & { procLabel: string };
type DeadlineRowItem = Deadline & { procLabel: string };
type MemoRowItem = ProcedureMemo & { procLabel: string };
type ImportantFilter = "hearing" | "deadline" | "express" | "memo";

const procLabelOf = (p: MatterProcedure) =>
  p.customLabel ?? procedureTypeLabel[p.type];

/**
 * v0.46：「重要事项」全案聚合（开庭安排 + 重要时限 + 快递记录 + 其他备忘）。
 */
export function ProcedureRemindersAndMemos({
  matterId,
  procedures,
  currentProcedureId,
  expresses,
  canManage
}: {
  matterId: string;
  procedures: ProcedureWithChildren[];
  currentProcedureId: string;
  expresses: ExpressItem[];
  canManage: boolean;
}) {
  const multiProc = procedures.length > 1;
  const procOptions = procedures.map((p) => ({ id: p.id, label: procLabelOf(p) }));

  const hearings: HearingRowItem[] = procedures.flatMap((p) =>
    p.hearings.map((h) => ({ ...h, procLabel: procLabelOf(p) }))
  );
  const deadlines: DeadlineRowItem[] = procedures.flatMap((p) =>
    p.deadlines.map((d) => ({ ...d, procLabel: procLabelOf(p) }))
  );
  const memos: MemoRowItem[] = procedures
    .flatMap((p) => p.memos.map((m) => ({ ...m, procLabel: procLabelOf(p) })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <ImportantItemsCard
      matterId={matterId}
      deadlines={deadlines}
      hearings={hearings}
      expresses={expresses}
      memos={memos}
      procedures={procOptions}
      defaultProcedureId={currentProcedureId}
      hearingCounts={Object.fromEntries(procedures.map((p) => [p.id, p.hearings.length]))}
      proceduresDetail={Object.fromEntries(
        procedures.map((p) => [
          p.id,
          { handlingAgency: p.handlingAgency, panel: p.panel, jurisdiction: p.jurisdiction }
        ])
      )}
      multiProc={multiProc}
      canManage={canManage}
    />
  );
}

// ============ 重要事项（四类统一展示）============

function ImportantItemsCard({
  matterId,
  deadlines,
  hearings,
  expresses,
  memos,
  procedures,
  defaultProcedureId,
  hearingCounts,
  proceduresDetail,
  multiProc,
  canManage
}: {
  matterId: string;
  deadlines: DeadlineRowItem[];
  hearings: HearingRowItem[];
  expresses: ExpressItem[];
  memos: MemoRowItem[];
  procedures: { id: string; label: string }[];
  defaultProcedureId: string;
  hearingCounts: Record<string, number>;
  proceduresDetail: Record<string, { handlingAgency?: string | null; panel?: string | null; jurisdiction?: string | null }>;
  multiProc: boolean;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ImportantFilter>("hearing");
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<ImportantFilter>("hearing");

  function handleToggle(id: string) {
    startTransition(async () => {
      try {
        await toggleDeadlineCompleted(id);
      } catch {
        toast.error("操作失败");
      }
    });
  }

  function handleDeleteDeadline(id: string) {
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

  function handleDeleteHearing(id: string) {
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

  function handleDeleteExpress(id: string) {
    if (!confirm("删除这条快递记录？")) return;
    startTransition(async () => {
      try {
        await deleteExpress({ id });
        toast.success("已删除");
      } catch {
        toast.error("删除失败");
      }
    });
  }

  function handleDeleteMemo(id: string) {
    startTransition(async () => {
      try {
        await deleteProcedureMemo(id);
      } catch {
        toast.error("删除失败");
      }
    });
  }

  const total = hearings.length + deadlines.length + expresses.length + memos.length;
  const filters: { value: ImportantFilter; label: string; count: number }[] = [
    { value: "hearing", label: "开庭", count: hearings.length },
    { value: "deadline", label: "时限", count: deadlines.length },
    { value: "express", label: "快递", count: expresses.length },
    { value: "memo", label: "备忘", count: memos.length }
  ];

  const currentCount = filters.find((f) => f.value === filter)?.count ?? 0;
  const currentLabel = filters.find((f) => f.value === filter)?.label ?? "重要事项";

  function openAddDialog() {
    setAddType(filter);
    setAddOpen(true);
  }

  return (
    <section className="flex h-full flex-col rounded-lg border border-border bg-card">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-[#FBBF24]" />
            重要事项
            <span className="ml-1 font-mono text-[11px] text-muted-foreground tabular">
              {total}
            </span>
          </span>
          {/* 分类按钮组 */}
          <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span className="ml-1 font-mono text-[10px] tabular opacity-75">
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={openAddDialog}
            className="h-6 gap-0.5 px-2 text-[11px]"
          >
            <Plus className="h-2.5 w-2.5" />
            添加
          </Button>
        )}
      </header>

      {currentCount === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-6 text-center text-xs text-muted-foreground">
          暂无{currentLabel}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4 py-2">
          {filter === "hearing" &&
            hearings.map((h) => (
              <HearingRow
                key={h.id}
                h={h}
                multiProc={multiProc}
                onDelete={() => handleDeleteHearing(h.id)}
                canManage={canManage}
              />
            ))}
          {filter === "deadline" &&
            deadlines.map((d) => (
              <DeadlineRow
                key={d.id}
                d={d}
                multiProc={multiProc}
                onToggle={() => handleToggle(d.id)}
                onDelete={() => handleDeleteDeadline(d.id)}
                pending={isPending}
                canManage={canManage}
              />
            ))}
          {filter === "express" &&
            expresses.map((e) => (
              <ExpressRow
                key={e.id}
                item={e}
                onDelete={() => handleDeleteExpress(e.id)}
                canManage={canManage}
              />
            ))}
          {filter === "memo" &&
            memos.map((m) => (
              <MemoRow
                key={m.id}
                memo={m}
                multiProc={multiProc}
                onDelete={() => handleDeleteMemo(m.id)}
                canManage={canManage}
              />
            ))}
        </ul>
      )}

      {canManage && (
        <ImportantItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          matterId={matterId}
          defaultType={addType}
          procedures={procedures}
          defaultProcedureId={defaultProcedureId}
          hearingCounts={hearingCounts}
          proceduresDetail={proceduresDetail}
        />
      )}
    </section>
  );
}

// 程序标签小徽章（仅多程序时显示，标明该条属于哪个程序）
function ProcTag({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-border bg-muted/40 px-1 text-[9px] font-normal text-muted-foreground"
    >
      {label}
    </Badge>
  );
}

function DeadlineRow({
  d,
  multiProc,
  onToggle,
  onDelete,
  pending,
  canManage
}: {
  d: DeadlineRowItem;
  multiProc: boolean;
  onToggle: () => void;
  onDelete: () => void;
  pending: boolean;
  canManage: boolean;
}) {
  const days = daysUntil(d.dueAt);
  const isOverdue = !d.completed && days < 0;
  const isWarn = !d.completed && days <= d.remindDays && days >= 0;
  return (
    <li
      className={cn(
        "group flex items-center gap-3 py-2 text-xs transition-colors",
        d.completed && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={pending || !canManage}
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
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[12.5px] font-medium",
              d.completed && "line-through text-muted-foreground"
            )}
          >
            {d.title}
          </span>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[9px]">
            {deadlineCategoryLabel[d.category]}
          </Badge>
          {multiProc && <ProcTag label={d.procLabel} />}
        </div>
        {d.basis && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{d.basis}</div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 text-right">
        <div className="font-mono text-xs tabular">
          {d.completed ? (
            "已完成"
          ) : isOverdue ? (
            <span className="text-destructive">逾期 {-days}d</span>
          ) : days === 0 ? (
            <span className="text-[#FBBF24]">今天</span>
          ) : isWarn ? (
            <span className="text-[#FBBF24]">{days}d</span>
          ) : (
            <span>{days}d</span>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground tabular">
          {new Date(d.dueAt).toLocaleDateString("zh-CN")}
        </div>
      </div>

      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          className="opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="删除"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </li>
  );
}

function HearingRow({
  h,
  multiProc,
  onDelete,
  canManage
}: {
  h: HearingRowItem;
  multiProc: boolean;
  onDelete: () => void;
  canManage: boolean;
}) {
  const upcoming = new Date(h.startsAt) > new Date();
  return (
    <li className="group flex items-center gap-3 py-2 text-xs">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Calendar className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{h.title}</span>
          {multiProc && <ProcTag label={h.procLabel} />}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {h.room || h.address || h.judge
            ? [h.room, h.address, h.judge].filter(Boolean).join(" · ")
            : "未填写法庭信息"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
          {upcoming ? "未召开" : "已召开"}
        </Badge>
        <span className="font-mono text-[10px] tabular text-muted-foreground">
          {new Date(h.startsAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })}
        </span>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </li>
  );
}

function ExpressRow({
  item,
  onDelete,
  canManage
}: {
  item: ExpressItem;
  onDelete: () => void;
  canManage: boolean;
}) {
  const isOutbound = item.direction === "OUTBOUND";
  return (
    <li className="group flex items-center gap-3 py-2 text-xs">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          isOutbound
            ? "bg-orange-500/10 text-orange-600"
            : "bg-emerald-500/10 text-emerald-600"
        )}
      >
        {isOutbound ? (
          <ArrowUpFromLine className="h-3.5 w-3.5" strokeWidth={1.8} />
        ) : (
          <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.8} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{item.purpose}</span>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[9px]">
            {isOutbound ? "寄出" : "收件"}
          </Badge>
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] tabular text-muted-foreground">
          {item.companyCode ?? "待识别"} · {item.trackingNo}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <div className="max-w-[96px] truncate text-[11px] text-foreground/80">
          {item.lastState ?? "待跟踪"}
        </div>
        <div className="font-mono text-[10px] tabular text-muted-foreground">
          {item.lastUpdateAt
            ? new Date(item.lastUpdateAt).toLocaleDateString("zh-CN")
            : new Date(item.createdAt).toLocaleDateString("zh-CN")}
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="删除"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </li>
  );
}

function MemoRow({
  memo,
  multiProc,
  onDelete,
  canManage
}: {
  memo: MemoRowItem;
  multiProc: boolean;
  onDelete: () => void;
  canManage: boolean;
}) {
  return (
    <li className="group flex items-start gap-3 py-2 text-xs">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <StickyNote className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">
          {memo.content}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {multiProc && <ProcTag label={memo.procLabel} />}
          <span className="font-mono tabular">
            {new Date(memo.createdAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="删除"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </li>
  );
}

// ============ 统一添加重要事项 ============

const deadlineCategoryLabel: Record<DeadlineCreateInput["category"], string> = {
  LIMITATION: "诉讼时效",
  EVIDENCE: "举证期限",
  APPEAL: "上诉期",
  PERFORMANCE: "履行期",
  RESPONSE: "答辩期",
  ENFORCEMENT: "执行申请",
  ARBITRATION_SET_ASIDE: "撤销仲裁期",
  PRESERVATION: "保全期限",
  CUSTOM: "其他"
};

const importantTypeMeta: Record<ImportantFilter, { label: string; icon: React.ElementType }> = {
  hearing: { label: "开庭", icon: Gavel },
  deadline: { label: "时限", icon: AlertTriangle },
  express: { label: "快递", icon: Package },
  memo: { label: "备忘", icon: StickyNote }
};

const CN_NUM: Record<number, string> = {
  1: "一",
  2: "二",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
  10: "十"
};

function toDateInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function toDateTimeInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function ImportantItemDialog({
  open,
  onOpenChange,
  matterId,
  defaultType,
  procedures,
  defaultProcedureId,
  hearingCounts,
  proceduresDetail
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
  defaultType: ImportantFilter;
  procedures: { id: string; label: string }[];
  defaultProcedureId: string;
  hearingCounts: Record<string, number>;
  proceduresDetail: Record<string, { handlingAgency?: string | null; panel?: string | null; jurisdiction?: string | null }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [summonsPending, startSummons] = useTransition();
  const [expressOcrPending, startExpressOcr] = useTransition();
  const summonsRef = useRef<HTMLInputElement>(null);
  const expressRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ImportantFilter>(defaultType);
  const [hearingProcedureId, setHearingProcedureId] = useState(defaultProcedureId);
  const [hearingTitle, setHearingTitle] = useState("");
  const [hearingStartsAt, setHearingStartsAt] = useState(toDateTimeInput());
  const [hearingRoom, setHearingRoom] = useState("");
  const [hearingAddress, setHearingAddress] = useState("");
  const [hearingJudge, setHearingJudge] = useState("");
  const [hearingContact, setHearingContact] = useState("");
  const [hearingNotes, setHearingNotes] = useState("");

  const [deadlineProcedureId, setDeadlineProcedureId] = useState(defaultProcedureId);
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [deadlineCategory, setDeadlineCategory] =
    useState<DeadlineCreateInput["category"]>("CUSTOM");
  const [deadlineDueAt, setDeadlineDueAt] = useState(toDateInput());
  const [deadlineBasis, setDeadlineBasis] = useState("");
  const [deadlineRemindDays, setDeadlineRemindDays] = useState(3);

  const [trackingNo, setTrackingNo] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [purpose, setPurpose] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const [memoProcedureId, setMemoProcedureId] = useState(defaultProcedureId);
  const [memoContent, setMemoContent] = useState("");

  useEffect(() => {
    if (!open) return;
    const procId = defaultProcedureId || procedures[0]?.id || "";
    const proc = procedures.find((p) => p.id === procId);
    const count = (hearingCounts[procId] ?? 0) + 1;
    const numStr = CN_NUM[count] ?? String(count);
    setType(defaultType);
    setHearingProcedureId(procId);
    setHearingTitle(proc ? `${proc.label}第${numStr}次开庭` : "");
    setHearingStartsAt(toDateTimeInput());
    setHearingRoom("");
    setHearingAddress("");
    setHearingJudge("");
    setHearingContact("");
    setHearingNotes("");
    setDeadlineProcedureId(procId);
    setDeadlineTitle("");
    setDeadlineCategory("CUSTOM");
    setDeadlineDueAt(toDateInput());
    setDeadlineBasis("");
    setDeadlineRemindDays(3);
    setTrackingNo("");
    setCompanyCode("");
    setDirection("OUTBOUND");
    setPurpose("");
    setRecipient("");
    setRecipientPhone("");
    setMemoProcedureId(procId);
    setMemoContent("");
    if (summonsRef.current) summonsRef.current.value = "";
    if (expressRef.current) expressRef.current.value = "";
  }, [open, defaultType, defaultProcedureId, procedures, hearingCounts]);

  function autoHearingTitle(procId: string) {
    const proc = procedures.find((p) => p.id === procId);
    if (!proc) return;
    const count = (hearingCounts[procId] ?? 0) + 1;
    const numStr = CN_NUM[count] ?? String(count);
    setHearingTitle(`${proc.label}第${numStr}次开庭`);
  }

  function handleSummonsUpload(file: File) {
    startSummons(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const result = await parseSummons(fd);
        if (result.hearingDate && result.hearingTime) {
          setHearingStartsAt(`${result.hearingDate}T${result.hearingTime}`);
        } else if (result.hearingDate) {
          setHearingStartsAt(`${result.hearingDate}T09:00`);
        }
        if (result.courtRoom) setHearingRoom(result.courtRoom);
        if (result.judge) setHearingJudge(result.judge);
        if (result.caseNumber || result.parties) {
          const parts: string[] = [];
          if (result.caseNumber) parts.push(`案号：${result.caseNumber}`);
          if (result.parties?.length) parts.push(`当事人：${result.parties.join("、")}`);
          setHearingNotes(parts.join("\n"));
        }
        toast.success("传票识别完成，请核对信息");
      } catch (err) {
        toast.error("传票识别失败", {
          description: err instanceof Error ? err.message : "请手动填写"
        });
      } finally {
        if (summonsRef.current) summonsRef.current.value = "";
      }
    });
  }

  function handleExpressOcr(file: File) {
    startExpressOcr(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const result = await parseExpressLabel(fd);
        if (result.trackingNo) {
          setTrackingNo(result.trackingNo);
          toast.success(`已识别单号：${result.trackingNo}`);
        } else {
          toast.warning("未识别到单号，请手动输入");
        }
        if (result.companyCode) setCompanyCode(result.companyCode);
      } catch (err) {
        toast.error("识别失败", {
          description: err instanceof Error ? err.message : ""
        });
      } finally {
        if (expressRef.current) expressRef.current.value = "";
      }
    });
  }

  function submitHearing() {
    if (!hearingProcedureId) {
      toast.error("请先选择所处程序");
      return;
    }
    if (!hearingTitle.trim()) {
      toast.error("请填写开庭主题");
      return;
    }
    const startsAt = new Date(hearingStartsAt);
    if (Number.isNaN(startsAt.getTime())) {
      toast.error("请填写有效开庭时间");
      return;
    }
    startTransition(async () => {
      try {
        await addHearing({
          procedureId: hearingProcedureId,
          title: hearingTitle.trim(),
          startsAt,
          endsAt: undefined,
          room: hearingRoom.trim(),
          address: hearingAddress.trim(),
          judge: hearingJudge.trim(),
          contact: hearingContact.trim(),
          notes: hearingNotes.trim()
        });
        toast.success("开庭安排已添加");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function submitDeadline() {
    if (!deadlineProcedureId) {
      toast.error("请先选择所处程序");
      return;
    }
    if (!deadlineTitle.trim()) {
      toast.error("请填写时限名称");
      return;
    }
    const dueAt = new Date(`${deadlineDueAt}T00:00:00`);
    if (Number.isNaN(dueAt.getTime())) {
      toast.error("请填写有效到期日");
      return;
    }
    startTransition(async () => {
      try {
        await addDeadline({
          procedureId: deadlineProcedureId,
          title: deadlineTitle.trim(),
          category: deadlineCategory,
          dueAt,
          basis: deadlineBasis.trim(),
          remindDays: deadlineRemindDays
        });
        toast.success("重要时限已添加");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function submitExpress() {
    if (!trackingNo.trim()) {
      toast.error("请填写或识别快递单号");
      return;
    }
    if (!purpose.trim()) {
      toast.error("请填写快递用途");
      return;
    }
    startTransition(async () => {
      try {
        await createExpress({
          trackingNo: trackingNo.trim(),
          companyCode: companyCode.trim(),
          direction,
          matterId,
          purpose: purpose.trim(),
          recipient: recipient.trim(),
          recipientPhone: recipientPhone.trim()
        });
        toast.success("快递记录已添加");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function submitMemo() {
    if (!memoProcedureId) {
      toast.error("请先选择所处程序");
      return;
    }
    if (!memoContent.trim()) {
      toast.error("请填写备忘内容");
      return;
    }
    startTransition(async () => {
      try {
        await addProcedureMemo({
          procedureId: memoProcedureId,
          content: memoContent.trim()
        });
        toast.success("其他备忘已添加");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (type === "hearing") submitHearing();
    if (type === "deadline") submitDeadline();
    if (type === "express") submitExpress();
    if (type === "memo") submitMemo();
  }

  const needsProcedure = type !== "express";
  const procedureMissing = needsProcedure && procedures.length === 0;
  const submitLabel = `添加${importantTypeMeta[type].label}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>添加重要事项</DialogTitle>
          <DialogDescription className="text-xs">
            在一个窗口内选择事项分类并填写信息
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-6 py-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(importantTypeMeta) as ImportantFilter[]).map((key) => {
                const Icon = importantTypeMeta[key].icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                      type === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {importantTypeMeta[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {procedureMissing && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                请先添加案件程序后，再录入开庭安排、重要时限或其他备忘。
              </div>
            )}

            {type === "hearing" && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    ref={summonsRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSummonsUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={summonsPending || procedureMissing}
                    onClick={() => summonsRef.current?.click()}
                  >
                    {summonsPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ScanText className="h-3.5 w-3.5" />
                    )}
                    {summonsPending ? "识别中…" : "上传传票识别"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    上传传票照片，自动填充开庭信息
                  </span>
                </div>
                <ImportantField label="主题" required>
                  <Input
                    value={hearingTitle}
                    onChange={(e) => setHearingTitle(e.target.value)}
                    placeholder="如：第一次开庭"
                    disabled={procedureMissing}
                  />
                </ImportantField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ImportantField label="所处程序" required>
                    <ProcedureSelect
                      value={hearingProcedureId}
                      procedures={procedures}
                      disabled={procedureMissing}
                      onChange={(value) => {
                        setHearingProcedureId(value);
                        autoHearingTitle(value);
                      }}
                    />
                  </ImportantField>
                  <ImportantField label="审理法院">
                    <Input
                      readOnly
                      value={proceduresDetail[hearingProcedureId]?.handlingAgency ?? "—"}
                      className="bg-muted/50 text-muted-foreground"
                    />
                  </ImportantField>
                  <ImportantField label="开庭时间" required>
                    <Input
                      type="datetime-local"
                      value={hearingStartsAt}
                      onChange={(e) => setHearingStartsAt(e.target.value)}
                      disabled={procedureMissing}
                    />
                  </ImportantField>
                  <ImportantField label="法庭">
                    <Input
                      value={hearingRoom}
                      onChange={(e) => setHearingRoom(e.target.value)}
                      placeholder="如：第三法庭"
                      disabled={procedureMissing}
                    />
                  </ImportantField>
                  <ImportantField label="主审 / 仲裁员">
                    <Input
                      value={hearingJudge}
                      onChange={(e) => setHearingJudge(e.target.value)}
                      disabled={procedureMissing}
                    />
                  </ImportantField>
                  <ImportantField label="联系方式">
                    <Input
                      value={hearingContact}
                      onChange={(e) => setHearingContact(e.target.value)}
                      placeholder="法官/书记员电话"
                      disabled={procedureMissing}
                    />
                  </ImportantField>
                </div>
                <ImportantField label="开庭地址">
                  <Input
                    value={hearingAddress}
                    onChange={(e) => setHearingAddress(e.target.value)}
                    placeholder="如：XX路XX号XX法院"
                    disabled={procedureMissing}
                  />
                </ImportantField>
                <ImportantField label="备注">
                  <Textarea
                    rows={4}
                    value={hearingNotes}
                    onChange={(e) => setHearingNotes(e.target.value)}
                    disabled={procedureMissing}
                  />
                </ImportantField>
              </>
            )}

            {type === "deadline" && (
              <>
                <ImportantField label="所处程序" required>
                  <ProcedureSelect
                    value={deadlineProcedureId}
                    procedures={procedures}
                    disabled={procedureMissing}
                    onChange={setDeadlineProcedureId}
                  />
                </ImportantField>
                <ImportantField label="时限名称" required>
                  <Input
                    value={deadlineTitle}
                    onChange={(e) => setDeadlineTitle(e.target.value)}
                    placeholder="如：举证截止 / 上诉到期日"
                    disabled={procedureMissing}
                  />
                </ImportantField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ImportantField label="时限类型">
                    <Select
                      value={deadlineCategory}
                      onValueChange={(value) =>
                        setDeadlineCategory(value as DeadlineCreateInput["category"])
                      }
                      disabled={procedureMissing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(deadlineCategoryLabel).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ImportantField>
                  <ImportantField label="到期日" required>
                    <Input
                      type="date"
                      value={deadlineDueAt}
                      onChange={(e) => setDeadlineDueAt(e.target.value)}
                      disabled={procedureMissing}
                    />
                  </ImportantField>
                </div>
                <ImportantField label="计算依据">
                  <Input
                    value={deadlineBasis}
                    onChange={(e) => setDeadlineBasis(e.target.value)}
                    placeholder="如：判决书送达日 2026-05-01 + 15 日"
                    disabled={procedureMissing}
                  />
                </ImportantField>
                <ImportantField label="提前提醒（天）">
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    className="font-mono tabular"
                    value={deadlineRemindDays}
                    onChange={(e) => setDeadlineRemindDays(Number(e.target.value))}
                    disabled={procedureMissing}
                  />
                </ImportantField>
              </>
            )}

            {type === "express" && (
              <>
                <ImportantField label="单号" required>
                  <div className="flex gap-1">
                    <Input
                      value={trackingNo}
                      onChange={(e) => setTrackingNo(e.target.value)}
                      placeholder="可手动输入或上传图片识别"
                      className="font-mono"
                    />
                    <input
                      ref={expressRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleExpressOcr(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => expressRef.current?.click()}
                      disabled={expressOcrPending}
                      className="h-9 shrink-0 gap-1"
                    >
                      {expressOcrPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ScanLine className="h-3 w-3" />
                      )}
                      识别
                    </Button>
                  </div>
                </ImportantField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ImportantField label="快递公司">
                    <Input
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value)}
                      placeholder="留空则自动识别"
                    />
                  </ImportantField>
                  <ImportantField label="方向">
                    <Select
                      value={direction}
                      onValueChange={(value) => setDirection(value as "OUTBOUND" | "INBOUND")}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OUTBOUND">寄出（我方→外）</SelectItem>
                        <SelectItem value="INBOUND">收件（外→我方）</SelectItem>
                      </SelectContent>
                    </Select>
                  </ImportantField>
                </div>
                <ImportantField label="用途" required>
                  <Input
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="如：起诉状寄朝阳法院"
                  />
                </ImportantField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ImportantField label="收件人 / 单位">
                    <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  </ImportantField>
                  <ImportantField label="收件电话">
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className="font-mono"
                    />
                  </ImportantField>
                </div>
              </>
            )}

            {type === "memo" && (
              <>
                <ImportantField label="所处程序" required>
                  <ProcedureSelect
                    value={memoProcedureId}
                    procedures={procedures}
                    disabled={procedureMissing}
                    onChange={setMemoProcedureId}
                  />
                </ImportantField>
                <ImportantField label="备忘内容" required>
                  <Textarea
                    rows={6}
                    value={memoContent}
                    onChange={(e) => setMemoContent(e.target.value)}
                    placeholder="输入备忘内容..."
                    disabled={procedureMissing}
                  />
                </ImportantField>
              </>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isPending || summonsPending || expressOcrPending || procedureMissing}
              className="gap-1.5"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProcedureSelect({
  value,
  procedures,
  disabled,
  onChange
}: {
  value: string;
  procedures: { id: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="选择所处程序" />
      </SelectTrigger>
      <SelectContent>
        {procedures.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ImportantField({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
