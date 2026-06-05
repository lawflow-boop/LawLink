"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ConflictDialog } from "@/components/conflict-dialog";
import { cn } from "@/lib/utils";

/** v0.43：工作台问候栏的「利益冲突检索」入口（原在 HeroBlock，重构后保留） */
export function ConflictSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
          "border border-border bg-background text-foreground/90 transition-colors hover:bg-muted/60"
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
        利益冲突检索
      </button>
      <ConflictDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
