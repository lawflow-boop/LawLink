"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Gavel,
  AlertTriangle,
  List,
  Plus,
  Grid3X3,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn, daysUntil } from "@/lib/utils";
import type { ScheduleItem } from "@/server/schedule/actions";
import { procedureTypeLabel } from "@/lib/enums";
import { AddTaskDialog } from "./add-task-dialog";

const typeMeta = {
  hearing: { icon: Gavel, label: "开庭", color: "#5B8DEF" },
  deadline: { icon: AlertTriangle, label: "期限", color: "#FBBF24" },
  task: { icon: ClipboardList, label: "事项", color: "#4FD1C5" }
} as const;

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const VISIBLE_ITEMS_PER_DAY = 4;

export function ScheduleView({
  items,
  matters
}: {
  items: ScheduleItem[];
  matters: { id: string; internalCode: string; title: string }[];
}) {
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ScheduleItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<Date | null>(null);

  const itemsWithDate = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        dateKey: dateKey(new Date(it.occurredAt))
      })),
    [items]
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  function openAddDialog(date?: Date | null) {
    setAddDate(date ?? (selectedDay ? parseDateKey(selectedDay) : today));
    setAddOpen(true);
  }

  const stats = useMemo(() => {
    const todayCount = itemsWithDate.filter(
      (it) => it.dateKey === dateKey(today)
    ).length;
    const weekCount = itemsWithDate.filter((it) => {
      const d = new Date(it.occurredAt);
      return d >= today && d < weekEnd;
    }).length;
    const hearingCount = items.filter((it) => it.type === "hearing").length;
    const deadlineCount = items.filter((it) => it.type === "deadline").length;
    return { todayCount, weekCount, hearingCount, deadlineCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsWithDate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <header className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-medium tracking-tight">日程</h1>
            <p className="text-[13px] text-muted-foreground">未来 90 天的开庭与期限</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" onClick={() => openAddDialog()} className="h-8 gap-1.5">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
              添加日程
            </Button>
            <div
              className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
            >
              <Button
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
                className="h-7 gap-1"
              >
                <List className="h-3.5 w-3.5" strokeWidth={1.8} />
                列表
              </Button>
              <Button
                size="sm"
                variant={view === "calendar" ? "default" : "ghost"}
                onClick={() => setView("calendar")}
                className="h-7 gap-1"
              >
                <Grid3X3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                月历
              </Button>
            </div>
          </div>
        </div>
        <div className="ll-rule" />
      </header>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="今日" value={stats.todayCount} color="hsl(var(--primary))" icon={<Clock className="h-3.5 w-3.5" />} />
        <Stat label="本周" value={stats.weekCount} color="#4FD1C5" icon={<Calendar className="h-3.5 w-3.5" />} />
        <Stat label="开庭" value={stats.hearingCount} color="hsl(var(--primary))" icon={<Gavel className="h-3.5 w-3.5" />} />
        <Stat label="期限" value={stats.deadlineCount} color="#EA580C" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
      </div>

      {view === "list" ? (
        <ListView items={itemsWithDate} today={today} />
      ) : (
        <CalendarView
          items={itemsWithDate}
          monthOffset={monthOffset}
          onOffsetChange={setMonthOffset}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onSelectItem={setDetailItem}
          onAddDay={openAddDialog}
        />
      )}
      <ScheduleItemDialog item={detailItem} onOpenChange={(open) => !open && setDetailItem(null)} />
      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        date={addDate}
        matters={matters}
      />
    </motion.div>
  );
}

function ListView({
  items,
  today
}: {
  items: (ScheduleItem & { dateKey: string })[];
  today: Date;
}) {
  // 按日分组
  const groups = useMemo(() => {
    const map = new Map<string, (ScheduleItem & { dateKey: string })[]>();
    for (const it of items) {
      if (!map.has(it.dateKey)) map.set(it.dateKey, []);
      map.get(it.dateKey)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">未来 90 天没有日程</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([key, group]) => {
        const d = new Date(key);
        const isToday = key === dateKey(today);
        const days = daysUntil(d);
        return (
          <section
            key={key}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <header
              className={cn(
                "flex items-center justify-between border-b border-border px-5 py-3",
                isToday && "bg-primary/10"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("text-base font-semibold", isToday && "text-primary")}>
                  {d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.toLocaleDateString("zh-CN", { weekday: "long" })}
                </span>
                {isToday ? (
                  <Badge className="bg-primary text-primary-foreground text-[10px]">今天</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {days === 1 ? "明天" : days > 0 ? `${days} 天后` : `${-days} 天前`}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs tabular text-muted-foreground">
                {group.length} 项
              </span>
            </header>
            <ul className="divide-y divide-border">
              {group.map((it) => (
                <Row key={it.id} item={it} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Row({ item }: { item: ScheduleItem }) {
  const meta = typeMeta[item.type];
  const Icon = meta.icon;
  const time = formatTime(item.occurredAt);
  const subject = displaySubject(item);

  return (
    <li className="px-5 py-3 transition-colors hover:bg-popover">
      <Link href={`/matters/${item.matter.id}`} className="flex items-start gap-3">
        <span className="w-12 shrink-0 font-mono text-sm tabular text-muted-foreground">
          {time}
        </span>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.color }} />
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{item.title}</span>
            <Badge variant="outline" className="text-[9px]" style={{ borderColor: `${meta.color}50`, color: meta.color }}>
              {meta.label}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn(item.clientName ? "" : "font-mono")}>{subject}</span>
            {item.procedureLabel && (
              <>
                <span>·</span>
                <span>
                  {procedureTypeLabel[item.procedureLabel as keyof typeof procedureTypeLabel] ??
                    item.procedureLabel}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function CalendarCellItem({
  item,
  onSelect
}: {
  item: ScheduleItem;
  onSelect: (item: ScheduleItem) => void;
}) {
  const meta = typeMeta[item.type];
  const color = meta.color;
  const subject = displaySubject(item);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
      title={`${meta.label}：${formatTime(item.occurredAt)} ${item.title} · ${subject}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-sm border px-1 py-0.5 text-left text-[10px] leading-4 transition-colors hover:border-current",
        item.completed && "line-through opacity-50"
      )}
      style={{ backgroundColor: `${color}16`, borderColor: `${color}45` }}
    >
      <span
        className="shrink-0 rounded-[3px] px-1 text-[9px] font-medium"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {meta.label}
      </span>
      <span className="shrink-0 font-mono text-[9.5px] tabular" style={{ color }}>
        {formatTime(item.occurredAt)}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/85">
        {item.title}
        {subject ? <span className="text-muted-foreground"> · {subject}</span> : null}
      </span>
    </button>
  );
}

function CalendarView({
  items,
  monthOffset,
  onOffsetChange,
  selectedDay,
  onSelectDay,
  onSelectItem,
  onAddDay
}: {
  items: (ScheduleItem & { dateKey: string })[];
  monthOffset: number;
  onOffsetChange: (n: number) => void;
  selectedDay: string | null;
  onSelectDay: (d: string | null) => void;
  onSelectItem: (item: ScheduleItem) => void;
  onAddDay: (date: Date) => void;
}) {
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // 一个月有多少天
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // 当月第一天是周几（周一=1 ... 周日=7，转化为 0-6 让"周一在最左"）
  const firstWeekday = ((new Date(year, month, 1).getDay() + 6) % 7); // 0=周一

  const cells: { date: Date | null; key: string | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, key: null });
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, key: dateKey(d) });
  }
  // 补齐到 6 行 = 42 格
  while (cells.length < 42) cells.push({ date: null, key: null });

  // 按 key 聚合 items
  const itemsByKey = useMemo(() => {
    const map = new Map<string, (ScheduleItem & { dateKey: string })[]>();
    for (const it of items) {
      if (!map.has(it.dateKey)) map.set(it.dateKey, []);
      map.get(it.dateKey)!.push(it);
    }
    return map;
  }, [items]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);

  const selectedItems = selectedDay ? itemsByKey.get(selectedDay) ?? [] : [];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOffsetChange(monthOffset - 1)}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-semibold tabular">
            {year} 年 {month + 1} 月
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOffsetChange(monthOffset + 1)}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {monthOffset !== 0 && (
          <Button variant="outline" size="sm" onClick={() => onOffsetChange(0)} className="h-7 text-xs">
            回到本月
          </Button>
        )}
      </header>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            className="py-1.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.date || !cell.key) {
            return (
              <div
                key={idx}
                className="min-h-[8rem] rounded-md border border-transparent sm:min-h-[9rem]"
              />
            );
          }
          const dayItems = itemsByKey.get(cell.key) ?? [];
          const visibleItems = dayItems.slice(0, VISIBLE_ITEMS_PER_DAY);
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDay;

          return (
            <div
              key={idx}
              onClick={() => onSelectDay(cell.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDay(cell.key);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${month + 1}月${cell.date.getDate()}日，${dayItems.length}项日程`}
              className={cn(
                "group flex min-h-[8rem] flex-col rounded-md border p-1.5 text-left transition-colors sm:min-h-[9rem]",
                isSelected
                  ? "border-primary bg-primary/15"
                  : "border-border bg-background hover:border-input",
                isToday && !isSelected && "border-primary/40"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "font-mono text-xs tabular",
                    isToday ? "font-semibold text-primary" : "text-foreground/80"
                  )}
                >
                  {cell.date.getDate()}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddDay(cell.date!);
                  }}
                  className="h-5 w-5 rounded-sm p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-primary group-hover:opacity-100 group-focus-within:opacity-100"
                  aria-label={`添加 ${month + 1} 月 ${cell.date.getDate()} 日的日程`}
                  title="添加日程"
                >
                  <Plus className="mx-auto h-3 w-3" />
                </button>
              </div>
              <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {visibleItems.map((it) => (
                  <CalendarCellItem key={it.id} item={it} onSelect={onSelectItem} />
                ))}
                {dayItems.length > VISIBLE_ITEMS_PER_DAY && (
                  <span className="px-1 text-[10px] font-medium text-muted-foreground">
                    +{dayItems.length - VISIBLE_ITEMS_PER_DAY}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <section className="mt-4 rounded-lg border border-border bg-background p-4">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">
                {formatDateKey(selectedDay)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedItems.length} 项
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddDay(parseDateKey(selectedDay))}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectDay(null)}
                className="h-7 w-7 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </header>
          {selectedItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              这一天没有日程
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {selectedItems.map((it) => (
                <DayDetailItem key={it.id} item={it} onSelect={onSelectItem} />
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

function DayDetailItem({
  item,
  onSelect
}: {
  item: ScheduleItem;
  onSelect: (item: ScheduleItem) => void;
}) {
  const meta = typeMeta[item.type];
  const Icon = meta.icon;
  const subject = displaySubject(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex min-w-0 items-start gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/60"
    >
      <span className="mt-0.5 rounded-sm p-1" style={{ backgroundColor: `${meta.color}18`, color: meta.color }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] tabular" style={{ color: meta.color }}>
            {formatTime(item.occurredAt)}
          </span>
          <span className="truncate text-sm font-medium">{item.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {subject}
          {item.procedureLabel ? ` · ${formatProcedureLabel(item.procedureLabel)}` : ""}
        </span>
      </span>
    </button>
  );
}

function ScheduleItemDialog({
  item,
  onOpenChange
}: {
  item: ScheduleItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = Boolean(item);
  const meta = item ? typeMeta[item.type] : typeMeta.task;
  const Icon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {item && (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded-md p-1.5"
                  style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ borderColor: `${meta.color}55`, color: meta.color }}
                >
                  {meta.label}
                </Badge>
                {item.completed && (
                  <Badge variant="secondary" className="text-[10px]">
                    已完成
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-base leading-6">{item.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <DetailLine label="时间" value={`${formatFullDate(item.occurredAt)} ${formatTime(item.occurredAt)}`} />
              <DetailLine label="客户" value={item.clientName ?? "未填写客户"} />
              <DetailLine
                label="关联案件"
                value={
                  <Link
                    href={`/matters/${item.matter.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {item.matter.title}
                  </Link>
                }
              />
              {item.procedureLabel && (
                <DetailLine label="程序" value={formatProcedureLabel(item.procedureLabel)} />
              )}
              {item.type === "deadline" && item.category && (
                <DetailLine label="期限类型" value={item.category} />
              )}
              {item.type === "deadline" && item.remindDays !== undefined && (
                <DetailLine label="提醒" value={`提前 ${item.remindDays} 天`} />
              )}
              {item.type === "task" && item.priority !== undefined && (
                <DetailLine label="优先级" value={priorityLabel(item.priority)} />
              )}
              {item.description && (
                <div className="space-y-1 border-t border-border pt-2">
                  <div className="text-[11px] text-muted-foreground">详情</div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{item.description}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              <Button asChild>
                <Link href={`/matters/${item.matter.id}`}>查看案件</Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground">{value}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  icon
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ll-surface px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[0.56rem] text-muted-foreground">{label}</span>
      </div>
      <div className="ll-stat mt-3 text-[1.85rem] leading-none text-foreground">
        {value}
      </div>
    </div>
  );
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(key: string) {
  return parseDateKey(key).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function formatTime(value: Date) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatFullDate(value: Date) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function formatProcedureLabel(value: string) {
  return procedureTypeLabel[value as keyof typeof procedureTypeLabel] ?? value;
}

function priorityLabel(value: number) {
  if (value >= 2) return "紧急";
  if (value === 1) return "高";
  return "普通";
}

function displaySubject(item: ScheduleItem) {
  return item.clientName ?? item.matter.internalCode;
}
