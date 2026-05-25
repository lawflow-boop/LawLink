"use client";

import { cn } from "@/lib/utils";

export type RadioChipItem<T extends string> = {
  value: T;
  label: string;
  description?: string;
  accent?: string;
};

export function RadioChips<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className
}: {
  items: RadioChipItem<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => {
        const active = item.value === value;
        const accent = item.accent;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            title={item.description}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-all",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]",
              active
                ? "border-primary bg-primary/12 text-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
            style={
              active && accent
                ? { borderColor: `${accent}AA`, background: `${accent}1A`, color: accent }
                : undefined
            }
          >
            {active && accent && (
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
