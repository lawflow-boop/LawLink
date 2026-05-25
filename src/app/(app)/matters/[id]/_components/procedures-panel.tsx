"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { procedureTypeLabel } from "@/lib/enums";
import { ProcedureContent } from "./procedure-content";
import { AddProcedureSheet } from "./procedure-forms";
import type { MatterPayload } from "./matter-detail-tabs";

export function ProceduresPanel({ matter }: { matter: MatterPayload }) {
  const [activeId, setActiveId] = useState<string | null>(
    matter.procedures.find((p) => p.engagement === "ENGAGED")?.id ??
      matter.procedures[0]?.id ??
      null
  );
  const [addOpen, setAddOpen] = useState(false);

  const active = matter.procedures.find((p) => p.id === activeId);

  return (
    <div className="space-y-4">
      {/* 程序 tabs */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 scrollbar-none">
        {matter.procedures.map((p) => {
          const isInfo = p.engagement === "INFORMATIONAL";
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn(
                "group flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-all",
                isActive
                  ? "border-primary bg-primary/15 text-primary shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-input hover:text-foreground",
                isInfo && !isActive && "opacity-60"
              )}
            >
              <span className="font-mono text-[10px] tabular text-muted-foreground">
                {p.order}
              </span>
              <span>{p.customLabel ?? procedureTypeLabel[p.type]}</span>
              {isInfo && (
                <Badge variant="outline" className="px-1 text-[9px]">
                  参考
                </Badge>
              )}
            </button>
          );
        })}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="ml-auto shrink-0 gap-1 text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          添加程序
        </Button>
      </div>

      {/* 当前程序内容 */}
      {active ? (
        <ProcedureContent procedure={active} />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            还没有程序。点击 <span className="text-foreground">添加程序</span> 开始
          </p>
        </div>
      )}

      <AddProcedureSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        matterId={matter.id}
        category={matter.category}
        nextOrder={matter.procedures.length + 1}
      />
    </div>
  );
}
