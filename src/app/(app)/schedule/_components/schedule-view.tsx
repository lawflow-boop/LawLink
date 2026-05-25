"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gavel,
  AlertTriangle,
  CheckSquare,
  List,
  Grid3X3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, daysUntil } from "@/lib/utils";
import type { ScheduleItem } from "@/server/schedule/actions";
import { procedureTypeLabel } from "@/lib/enums";

const typeMeta = {
  hearing: { icon: Gavel, label: "开庭", color: "#5B8DEF" },
  deadline: { icon: AlertTriangle, label: "期限", color: "#FBBF24" },
  task: { icon: CheckSquare, label: "任务", color: "#4FD1C5" }
} as const;

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export function ScheduleView({ items }: { items: ScheduleItem[] }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
            <p className="text-[13px] text-muted-foreground">未来 90 天的开庭、期限、任务</p>
          </div>

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
        />
      )}
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
  const time = new Date(item.occurredAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  return (
    <li className="px-5 py-3 transition-colors hover:bg-popover">
      <Link href={`/matters/${item.matter.id}`} className="flex items-start gap-3">
        <span className="w-12 shrink-0 font-mono text-sm tabular text-muted-foreground">
          {item.type === "task" ? "--:--" : time}
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
            <span className="font-mono">{item.matter.internalCode}</span>
            <span>·</span>
            <span className="line-clamp-1">{item.matter.title}</span>
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

function CalendarView({
  items,
  monthOffset,
  onOffsetChange,
  selectedDay,
  onSelectDay
}: {
  items: (ScheduleItem & { dateKey: string })[];
  monthOffset: number;
  onOffsetChange: (n: number) => void;
  selectedDay: string | null;
  onSelectDay: (d: string | null) => void;
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
        <header className="mb-3 flex items-center justify-between">
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

        <div className="grid grid-cols-7 gap-1">
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
              return <div key={idx} className="h-20 rounded-md border border-transparent" />;
            }
            const dayItems = itemsByKey.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDay;
            const hasHearing = dayItems.some((it) => it.type === "hearing");
            const hasDeadline = dayItems.some((it) => it.type === "deadline");
            const hasTask = dayItems.some((it) => it.type === "task");

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectDay(cell.key)}
                className={cn(
                  "group flex h-20 flex-col rounded-md border p-1.5 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/15"
                    : "border-border bg-background hover:border-input",
                  isToday && !isSelected && "border-primary/40"
                )}
              >
                <div
                  className={cn(
                    "font-mono text-xs tabular",
                    isToday ? "text-primary font-semibold" : "text-foreground/80"
                  )}
                >
                  {cell.date.getDate()}
                </div>
                <div className="mt-auto flex items-center gap-1">
                  {hasHearing && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "#5B8DEF" }}
                    />
                  )}
                  {hasDeadline && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "#FBBF24" }}
                    />
                  )}
                  {hasTask && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "#4FD1C5" }}
                    />
                  )}
                  {dayItems.length > 0 && (
                    <span className="ml-auto font-mono text-[10px] tabular text-muted-foreground">
                      {dayItems.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 右侧：选中日详情 */}
      <section className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
        {selectedDay ? (
          <>
            <header className="mb-3">
              <h3 className="text-base font-semibold">
                {new Date(selectedDay).toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long"
                })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedItems.length} 项
              </p>
            </header>
            {selectedItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">这一天没有日程</p>
            ) : (
              <ul className="space-y-2">
                {selectedItems.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <Row item={it} />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">点击月历上的日期查看详细</p>
          </div>
        )}
      </section>
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
