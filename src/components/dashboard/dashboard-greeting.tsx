"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ConflictSearchButton } from "./conflict-search-button";

function getGreeting(hour: number) {
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早安";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** v0.43：仪表盘顶部问候区（恢复留白感，替代被移除的 HeroBlock；不含今日焦点卡片） */
export function DashboardGreeting({
  name,
  summary
}: {
  name: string;
  summary: { todayDeadlineCount: number; weekHearingCount: number; nearTermCount: number };
}) {
  const router = useRouter();
  const today = new Date();
  const greeting = getGreeting(today.getHours());
  const dateLabel = today.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
      className="flex flex-col gap-4 py-3"
    >
      <span className="text-xs text-muted-foreground">{dateLabel}</span>

      <div>
        <h1 className="text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-[1.1] tracking-tight">
          {greeting}
          {name && <span className="text-foreground/85">，{name}</span>}
          <span className="text-muted-foreground/50">。</span>
        </h1>
        <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-muted-foreground">
          今天有 <Num>{summary.todayDeadlineCount}</Num> 件事需处理；本周开庭{" "}
          <Num>{summary.weekHearingCount}</Num> 场；近期期限 <Num>{summary.nearTermCount}</Num> 项。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => router.push("/matters?tab=intake&new=1")}
          className="h-9 gap-1.5 px-4 shadow-sm"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          新建收案
        </Button>
        <ConflictSearchButton />
      </div>
    </motion.section>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[1.15rem] font-medium tabular text-foreground"
      style={{ letterSpacing: "-0.02em" }}
    >
      {children}
    </span>
  );
}
