"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { HeroData } from "@/server/dashboard/actions";
import { ConflictDialog } from "@/components/conflict-dialog";

function getGreeting(hour: number) {
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早安";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function HeroBlock({ data }: { data: HeroData }) {
  const today = new Date();
  const router = useRouter();
  const { data: session } = useSession();
  const greeting = getGreeting(today.getHours());
  const name = session?.user?.name ?? "";
  const [conflictOpen, setConflictOpen] = useState(false);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Left: greeting + summary */}
      <div className="lg:col-span-8">
        <div className="flex h-full flex-col justify-between gap-5">
          {/* Date line */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {formatDate(today, "full")}
            </span>
          </div>

          {/* Main heading */}
          <div>
            <h1 className="text-[clamp(2rem,3.6vw,3rem)] font-medium leading-[1.05] tracking-tight">
              {greeting}
              {name && <span className="text-foreground/85">，{name}</span>}
              <span className="text-muted-foreground/50">。</span>
            </h1>

            <div className="mt-3 max-w-xl text-[0.9rem] leading-relaxed text-muted-foreground">
              您今天有{" "}
              <SummaryNum>{data.todayDeadlineCount}</SummaryNum> 件事需处理；本周开庭{" "}
              <SummaryNum>{data.weekHearingCount}</SummaryNum> 场；近期期限{" "}
              <SummaryNum>{data.nearTermCount}</SummaryNum> 项。
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => router.push("/matters?tab=intake&new=1")}
              className="h-9 gap-1.5 px-4 shadow-sm"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              新建收案
            </Button>
            <button
              type="button"
              onClick={() => setConflictOpen(true)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium",
                "border border-border bg-background text-foreground/90",
                "transition-colors hover:bg-muted/60"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
              利益冲突检索
            </button>
          </div>
        </div>
      </div>

      {/* Right: today focus card */}
      {data.focus ? (
        <Link
          href={data.focus.href}
          className={cn(
            "group relative flex flex-col justify-between overflow-hidden p-5 lg:col-span-4",
            "ll-surface transition-colors hover:bg-muted/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-medium uppercase tracking-widest text-primary/85">
              今日焦点
            </span>
            <ArrowUpRight
              className="h-4 w-4 text-primary/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.5}
            />
          </div>

          <div className="my-3">
            <div className="text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              距 {data.focus.title}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-[4rem] leading-none font-medium tabular text-foreground/95" style={{ letterSpacing: "-0.02em" }}>
                {data.focus.daysLeft}
              </span>
              <span className="text-[12px] text-muted-foreground">天</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[0.95rem] leading-snug font-medium text-foreground/90">
              {data.focus.matter}
            </div>
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground tabular">
              {data.focus.internalCode}
            </div>
          </div>
        </Link>
      ) : (
        <div
          className={cn(
            "group relative flex flex-col justify-between overflow-hidden p-5 lg:col-span-4",
            "ll-surface"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-medium uppercase tracking-widest text-primary/85">
              今日焦点
            </span>
          </div>

          <div className="my-3 flex flex-1 items-center justify-center">
            <span className="text-sm text-muted-foreground">暂无近期期限</span>
          </div>
        </div>
      )}

      <ConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </motion.section>
  );
}

function SummaryNum({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[1.15rem] font-medium tabular text-foreground" style={{ letterSpacing: "-0.02em" }}>
      {children}
    </span>
  );
}
