"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, X, Clock, CheckCircle2, Archive } from "lucide-react";
import type { MatterCategory, ClientType, UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioChips } from "@/components/ui/radio-chips";
import { matterCategoryLabel, matterCategoryColor } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { IntakeSheet } from "@/app/(app)/intakes/_components/intake-sheet";
import { MattersTable, type MatterRow } from "./matters-table";
import { IntakesTable, type IntakeRow } from "./intakes-table";

export type ClientOption = { id: string; name: string; type: ClientType };
export type ColleagueOption = { id: string; name: string; role: UserRole };

type Tab = "intake" | "active" | "closed";

type Props = {
  tab: Tab;
  matterData?: { items: MatterRow[]; total: number };
  intakeData?: { items: IntakeRow[]; total: number };
  clientOptions: ClientOption[];
  colleagues: ColleagueOption[];
  initialFilters: {
    search: string;
    category: MatterCategory | "ALL";
  };
  autoOpenIntake?: boolean;
};

const ALL_CATEGORIES: (MatterCategory | "ALL")[] = [
  "ALL",
  "CIVIL_COMMERCIAL",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
];

const TABS: { key: Tab; label: string; icon: typeof Clock }[] = [
  { key: "intake", label: "待审批", icon: Clock },
  { key: "active", label: "进行中", icon: CheckCircle2 },
  { key: "closed", label: "已结案归档", icon: Archive }
];

export function MattersView({
  tab,
  matterData,
  intakeData,
  clientOptions,
  colleagues,
  initialFilters,
  autoOpenIntake
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialFilters.search);
  const [category, setCategory] = useState<MatterCategory | "ALL">(initialFilters.category);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ?new=1 自动打开
  useEffect(() => {
    if (autoOpenIntake) {
      setSheetOpen(true);
      // 清掉 ?new=1，避免刷新再次弹
      const params = new URLSearchParams();
      if (tab !== "active") params.set("tab", tab);
      if (initialFilters.search) params.set("search", initialFilters.search);
      if (initialFilters.category !== "ALL") params.set("category", initialFilters.category);
      router.replace(`/matters${params.toString() ? `?${params.toString()}` : ""}`, {
        scroll: false
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenIntake]);

  const buildUrl = useCallback(
    (override: { tab?: Tab; search?: string; category?: string }) => {
      const params = new URLSearchParams();
      const t = override.tab ?? tab;
      const s = override.search ?? search;
      const c = override.category ?? category;
      if (t !== "active") params.set("tab", t);
      if (s) params.set("search", s);
      if (c && c !== "ALL") params.set("category", c);
      return `/matters${params.toString() ? `?${params.toString()}` : ""}`;
    },
    [tab, search, category]
  );

  function switchTab(next: Tab) {
    startTransition(() => router.replace(buildUrl({ tab: next })));
  }

  function applyFilters() {
    startTransition(() => router.replace(buildUrl({})));
  }

  function clearFilters() {
    setSearch("");
    setCategory("ALL");
    startTransition(() =>
      router.replace(`/matters${tab !== "active" ? `?tab=${tab}` : ""}`)
    );
  }

  const hasFilters = search || category !== "ALL";
  const total =
    tab === "intake" ? (intakeData?.total ?? 0) : (matterData?.total ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {/* editorial header */}
      <header className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-medium tracking-tight">案件管理</h1>
            <p className="text-[13px] text-muted-foreground">
              <span className="text-foreground/80">
                {TABS.find((t) => t.key === tab)?.label}
              </span>
              <span className="mx-2 text-muted-subtle">·</span>
              共 <span className="font-mono tabular text-foreground">{total}</span> 件
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)} className="h-9 gap-1.5 px-4 shadow-sm">
            <Plus className="h-4 w-4" strokeWidth={2} />
            新建收案
          </Button>
        </div>
        <div className="ll-rule" />
      </header>

      {/* Tab */}
      <div
        className="flex items-end gap-6 border-b"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={cn(
                "relative inline-flex items-center gap-1.5 pb-2.5 pt-0.5 text-[13px] transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
          className="relative min-w-64 flex-1"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={applyFilters}
            placeholder={
              tab === "intake"
                ? "搜索标题 / 客户 / 描述"
                : "搜索案件名称 / 编号 / 客户"
            }
            className="h-9 border-border bg-card pl-9"
          />
        </form>

        {tab !== "intake" && (
          <RadioChips
            size="sm"
            items={ALL_CATEGORIES.map((c) => ({
              value: c,
              label: c === "ALL" ? "全部" : matterCategoryLabel[c as MatterCategory],
              accent: c === "ALL" ? undefined : matterCategoryColor[c as MatterCategory]
            }))}
            value={category}
            onChange={(v) => {
              const next = v as MatterCategory | "ALL";
              setCategory(next);
              startTransition(() => router.replace(buildUrl({ category: next })));
            }}
          />
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            清除筛选
          </Button>
        )}
      </div>

      {tab === "intake" ? (
        <IntakesTable items={intakeData?.items ?? []} />
      ) : (
        <MattersTable items={matterData?.items ?? []} />
      )}

      <IntakeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        clientOptions={clientOptions}
        colleagues={colleagues}
      />
    </motion.div>
  );
}
