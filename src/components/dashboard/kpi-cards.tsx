"use client";

import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, AlertTriangle, Minus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { KpiItem } from "@/server/dashboard/actions";

export function KpiCards({ data }: { data: KpiItem[] }) {
  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } }
      }}
      className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
    >
      {data.map((kpi) => (
        <motion.div
          key={kpi.key}
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0 }
          }}
          className="group relative overflow-hidden bg-card px-5 py-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              {kpi.label}
            </span>
            <TrendBadge direction={kpi.trend.direction} text={kpi.trend.text} />
          </div>

          <div className="mt-3 flex items-baseline gap-1">
            <span className="ll-stat text-[2rem] leading-none text-foreground">
              {kpi.valueFormat === "currency"
                ? formatCurrency(kpi.value, { compact: true })
                : kpi.value}
            </span>
          </div>

          <div className="mt-3 h-6">
            <Sparkline values={kpi.sparkline} />
          </div>
        </motion.div>
      ))}
    </motion.section>
  );
}

function TrendBadge({
  direction,
  text
}: {
  direction: "up" | "down" | "warn";
  text: string;
}) {
  const Icon =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : direction === "warn" ? AlertTriangle : Minus;
  const cls =
    direction === "up"
      ? "text-emerald-600 bg-emerald-500/8 border-emerald-500/20"
      : direction === "warn"
        ? "text-amber-600 bg-amber-500/8 border-amber-500/20"
        : "text-red-600 bg-red-500/8 border-red-500/20";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular",
        cls
      )}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      {text}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const stepX = w / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="sparkline-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g className="text-primary">
        <polygon points={areaPoints} fill="url(#sparkline-fill)" />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}
