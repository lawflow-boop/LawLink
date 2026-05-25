"use client";

import type { TimelineEvent } from "@prisma/client";
import { Clock, FileText, Gavel, Coins } from "lucide-react";

const iconByType: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  MATTER_CREATED: FileText,
  PROCEDURE_ADDED: FileText,
  HEARING_SCHEDULED: Gavel,
  FEE_RECEIVED: Coins
};

const colorByType: Record<string, string> = {
  MATTER_CREATED: "#5B8DEF",
  PROCEDURE_ADDED: "#4FD1C5",
  HEARING_SCHEDULED: "#FBBF24",
  FEE_RECEIVED: "#4ADE80"
};

export function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">还没有时间线事件</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <ul className="relative space-y-4">
        <span
          aria-hidden
          className="absolute left-[15px] top-1 bottom-1 w-px bg-border"
        />
        {events.map((e) => {
          const Icon = iconByType[e.eventType] ?? Clock;
          const color = colorByType[e.eventType] ?? "#5B8DEF";
          return (
            <li key={e.id} className="relative flex gap-3 pl-1">
              <div
                className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card"
                style={{ borderColor: `${color}50` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{e.title}</span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground tabular">
                  {new Date(e.occurredAt).toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </div>
                {e.content && (
                  <p className="mt-1 text-xs text-muted-foreground">{e.content}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
