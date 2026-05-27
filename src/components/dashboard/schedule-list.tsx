"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Calendar, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleItem } from "@/server/dashboard/actions";

const typeMeta = {
  deadline: { icon: AlertTriangle, color: "text-amber-600", label: "期限" },
  hearing: { icon: Calendar, color: "text-primary", label: "开庭" },
  task: { icon: Clock, color: "text-primary", label: "任务" }
};

export function ScheduleList({ data }: { data: ScheduleItem[] }) {
  const grouped = data.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    const key = `${item.date} · ${item.weekday}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="ll-surface flex h-full flex-col"
    >
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <div>
          <h2 className="text-lg font-medium tracking-tight">近期日程</h2>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            按时间排序 · 开庭 / 期限 / 任务
          </p>
        </div>
        <Link
          href="/schedule"
          className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          完整日历
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      </header>

      <div className="border-t border-border flex-1 space-y-4 overflow-y-auto px-5 py-3">
        {Object.entries(grouped).map(([dateKey, items]) => (
          <div key={dateKey}>
            <div className="mb-2 flex items-center gap-2.5">
              <div className="text-[0.9rem] font-medium text-foreground">
                {dateKey.split(" · ")[0]}
              </div>
              <div className="text-[0.68rem] text-muted-foreground">
                {dateKey.split(" · ")[1]}
              </div>
              <div className="ll-rule flex-1" />
            </div>

            <div className="space-y-0">
              {items.map((item) => (
                <ScheduleRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const meta = typeMeta[item.type];
  const Icon = meta.icon;
  return (
    <button className="ll-row flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground tabular">
        {item.time ?? "--:--"}
      </span>
      <Icon className={cn("h-3 w-3 shrink-0", meta.color)} strokeWidth={1.8} />
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-[13px] font-medium">{item.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {item.matter}
          {item.procedure ? <span className="text-muted-subtle"> · {item.procedure}</span> : null}
        </div>
      </div>
    </button>
  );
}
