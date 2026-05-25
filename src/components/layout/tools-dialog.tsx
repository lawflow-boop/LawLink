"use client";

import { useState } from "react";
import { Calculator, Scale, Coins, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CourtFeeCalc } from "@/app/(app)/tools/calc/_components/court-fee-calc";
import { LateInterestCalc } from "@/app/(app)/tools/calc/_components/late-interest-calc";
import { DaysCalc } from "@/app/(app)/tools/calc/_components/days-calc";

type Tab = "courtFee" | "lateInterest" | "days";

const TABS: { key: Tab; label: string; icon: typeof Scale }[] = [
  { key: "courtFee", label: "诉讼费", icon: Scale },
  { key: "lateInterest", label: "迟延履行金", icon: Coins },
  { key: "days", label: "天数计算", icon: CalendarDays }
];

export function ToolsDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("courtFee");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            律师工具箱
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-border px-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-[13px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {t.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-px left-0 right-0 h-[2px] bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "courtFee" && <CourtFeeCalc />}
          {tab === "lateInterest" && <LateInterestCalc />}
          {tab === "days" && <DaysCalc />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
