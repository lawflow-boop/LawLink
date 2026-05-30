"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, X, Clock, CheckCircle2, Archive, AlertCircle, FolderOpen, SlidersHorizontal } from "lucide-react";
import type { MatterCategory, ClientType, UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { matterCategoryLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { IntakeSheet } from "@/app/(app)/intakes/_components/intake-sheet";
import {
  MattersTable,
  MATTER_COLUMNS,
  type MatterRow,
  type MatterColumnKey,
  type ColumnVisibility
} from "./matters-table";
import { IntakesTable, type IntakeRow } from "./intakes-table";

const COLUMN_PREF_KEY = "lawlink:matters:columns:v2";

function defaultColumns(): ColumnVisibility {
  return MATTER_COLUMNS.reduce((acc, c) => {
    acc[c.key] = true;
    return acc;
  }, {} as ColumnVisibility);
}

export type ClientOption = { id: string; name: string; type: ClientType };
export type ColleagueOption = { id: string; name: string; role: UserRole };

type Tab = "intake" | "active" | "archived" | "revision" | "all";

type Props = {
  tab: Tab;
  matterData?: { items: MatterRow[]; total: number };
  intakeData?: { items: IntakeRow[]; total: number };
  clientOptions: ClientOption[];
  colleagues: ColleagueOption[];
  initialFilters: {
    search: string;
    category: MatterCategory | "ALL";
    status?: string; // all tab 下 status 筛选
    from?: string; // 收案时间起
    to?: string; // 收案时间止
  };
  autoOpenIntake?: boolean;
};

const ALL_CATEGORIES: (MatterCategory | "ALL")[] = [
  "ALL",
  "CIVIL_COMMERCIAL",
  "LABOR_ARBITRATION",
  "COMMERCIAL_ARBITRATION",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
];

const TABS: { key: Tab; label: string; icon: typeof Clock }[] = [
  { key: "all", label: "全部案件", icon: FolderOpen },
  { key: "intake", label: "待审批", icon: Clock },
  { key: "active", label: "进行中", icon: CheckCircle2 },
  { key: "revision", label: "待补正", icon: AlertCircle },
  { key: "archived", label: "已归档", icon: Archive }
];

const ALL_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "全部状态" },
  { value: "active", label: "办理中" },
  { value: "closed", label: "已结案" },
  { value: "archived", label: "已归档" }
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
  const [statusFilter, setStatusFilter] = useState<string>(initialFilters.status ?? "ALL");
  const [dateFrom, setDateFrom] = useState<string>(initialFilters.from ?? "");
  const [dateTo, setDateTo] = useState<string>(initialFilters.to ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnVisibility>(defaultColumns);

  // 列偏好持久化到 localStorage（避免 SSR 不一致：挂载后再读）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_PREF_KEY);
      if (raw) setColumns({ ...defaultColumns(), ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  function toggleColumn(key: MatterColumnKey, value: boolean) {
    setColumns((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
    (override: {
      tab?: Tab;
      search?: string;
      category?: string;
      status?: string;
      from?: string;
      to?: string;
    }) => {
      const params = new URLSearchParams();
      const t = override.tab ?? tab;
      const s = override.search ?? search;
      const c = override.category ?? category;
      const st = override.status ?? statusFilter;
      const f = override.from ?? dateFrom;
      const to_ = override.to ?? dateTo;
      if (t !== "active") params.set("tab", t);
      if (s) params.set("search", s);
      if (c && c !== "ALL") params.set("category", c);
      if (t === "all" && st && st !== "ALL") params.set("status", st);
      if (t === "all" && f) params.set("from", f);
      if (t === "all" && to_) params.set("to", to_);
      return `/matters${params.toString() ? `?${params.toString()}` : ""}`;
    },
    [tab, search, category, statusFilter, dateFrom, dateTo]
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
    setStatusFilter("ALL");
    setDateFrom("");
    setDateTo("");
    startTransition(() =>
      router.replace(`/matters${tab !== "active" ? `?tab=${tab}` : ""}`)
    );
  }

  const isIntakeStyle = tab === "intake" || tab === "revision";
  const isAll = tab === "all";
  const hasFilters =
    search ||
    category !== "ALL" ||
    (isAll && (statusFilter !== "ALL" || dateFrom || dateTo));
  const total =
    isIntakeStyle ? (intakeData?.total ?? 0) : (matterData?.total ?? 0);

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
        className="flex items-end gap-1 border-b border-border"
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
                "relative inline-flex items-center gap-1.5 rounded-t-md px-3 pb-2.5 pt-2 text-[13px] transition-colors",
                active
                  ? "bg-card text-primary font-medium border border-b-transparent border-border"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
          className="relative flex min-w-0 sm:min-w-64 flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.8}
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isIntakeStyle
                  ? "搜索标题 / 客户 / 描述"
                  : "搜索案件名称 / 编号 / 客户"
              }
              className="h-9 border-border bg-card pl-9"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="h-9 gap-1">
            <Search className="h-3.5 w-3.5" />
            搜索
          </Button>
        </form>

        {!isIntakeStyle && (
          <Select
            value={category}
            onValueChange={(v) => {
              const next = v as MatterCategory | "ALL";
              setCategory(next);
              startTransition(() => router.replace(buildUrl({ category: next })));
            }}
          >
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "ALL" ? "全部类型" : matterCategoryLabel[c as MatterCategory]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isAll && (
          <>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                startTransition(() => router.replace(buildUrl({ status: v })));
              }}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <span>收案</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onBlur={applyFilters}
                className="h-9 w-36 px-2"
                title="收案时间起"
              />
              <span>→</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onBlur={applyFilters}
                className="h-9 w-36 px-2"
                title="收案时间止"
              />
            </div>
          </>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            清除筛选
          </Button>
        )}

        {!isIntakeStyle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1" title="列设置">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                列设置
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>显示列</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MATTER_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={columns[c.key]}
                  onCheckedChange={(v) => toggleColumn(c.key, !!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isIntakeStyle ? (
        <IntakesTable items={intakeData?.items ?? []} kind={tab as "intake" | "revision"} />
      ) : (
        <MattersTable items={matterData?.items ?? []} visible={columns} />
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
