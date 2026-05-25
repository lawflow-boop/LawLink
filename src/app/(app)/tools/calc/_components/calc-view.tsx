"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Scale, Coins, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { CourtFeeCalc } from "./court-fee-calc";
import { LateInterestCalc } from "./late-interest-calc";
import { DaysCalc } from "./days-calc";

type Tab = "courtFee" | "lateInterest" | "days";

const TABS: { key: Tab; label: string; icon: typeof Scale }[] = [
  { key: "courtFee", label: "诉讼费", icon: Scale },
  { key: "lateInterest", label: "迟延履行金", icon: Coins },
  { key: "days", label: "天数计算", icon: CalendarDays }
];

export function CalcView() {
  const [tab, setTab] = useState<Tab>("courtFee");

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl italic">
          <Calculator className="h-5 w-5 text-primary" strokeWidth={1.6} />
          律师工具箱
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          诉讼费 / 迟延履行金 / 天数 —— 纯前端速算，无需联网
        </p>
      </div>

      {/* Tab */}
      <div className="border-b border-border">
        <div className="flex gap-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 pb-2.5 pt-1 text-[13px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {t.label}
                {active && (
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-3xl"
      >
        {tab === "courtFee" && <CourtFeeCalc />}
        {tab === "lateInterest" && <LateInterestCalc />}
        {tab === "days" && <DaysCalc />}
      </motion.div>
    </div>
  );
}
