"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Trash2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { triggerAuditCleanupNow } from "@/server/cron/manual-triggers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { AuditListResult, AuditFilter } from "@/server/audit-list";
import { cn } from "@/lib/utils";

type Options = {
  actions: string[];
  targetTypes: string[];
  users: { id: string; name: string }[];
};

const ALL_VALUE = "__all__";

export function AuditView({
  result,
  options,
  currentFilter
}: {
  result: AuditListResult;
  options: Options;
  currentFilter: AuditFilter;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cleaning, startCleaning] = useTransition();

  function handleCleanup() {
    if (
      !confirm(
        "立刻清理超过保留期（默认 365 天，AUDIT_RETENTION_DAYS 环境变量可改）的审计记录？此操作不可撤销。"
      )
    )
      return;
    startCleaning(async () => {
      try {
        const r = await triggerAuditCleanupNow();
        toast.success(
          `清理完成：保留 ${r.retentionDays} 天，删除 ${r.deleted} 条`
        );
        router.refresh();
      } catch (err) {
        toast.error("清理失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function navigate(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    next.delete("cursor"); // 任何筛选改变都重置分页
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === ALL_VALUE) next.delete(k);
      else next.set(k, v);
    }
    router.push(`/audit?${next.toString()}`);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function nextPage() {
    if (!result.nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set("cursor", result.nextCursor);
    router.push(`/audit?${next.toString()}`);
  }

  const hasFilter =
    !!currentFilter.userId ||
    !!currentFilter.action ||
    !!currentFilter.targetType ||
    !!currentFilter.startStr ||
    !!currentFilter.endStr;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.8} />
            审计日志
          </h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            记录每个用户的关键操作。默认保留 365 天，每天 03:00 自动清理旧记录
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCleanup}
          disabled={cleaning}
          className="gap-1.5"
          title="立刻清理过期记录（不等到 03:00）"
        >
          {cleaning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          清理过期
        </Button>
      </header>

      {/* 筛选区 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <FilterCol label="操作人">
            <Select
              value={currentFilter.userId || ALL_VALUE}
              onValueChange={(v) => navigate({ userId: v === ALL_VALUE ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部</SelectItem>
                {options.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCol>

          <FilterCol label="动作">
            <Select
              value={currentFilter.action || ALL_VALUE}
              onValueChange={(v) => navigate({ action: v === ALL_VALUE ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部</SelectItem>
                {options.actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCol>

          <FilterCol label="对象类型">
            <Select
              value={currentFilter.targetType || ALL_VALUE}
              onValueChange={(v) => navigate({ targetType: v === ALL_VALUE ? undefined : v })}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部</SelectItem>
                {options.targetTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterCol>

          <FilterCol label="起始日">
            <Input
              type="date"
              value={currentFilter.startStr ?? ""}
              onChange={(e) => navigate({ start: e.target.value || undefined })}
              className="h-8 w-36 text-xs"
            />
          </FilterCol>

          <FilterCol label="结束日">
            <Input
              type="date"
              value={currentFilter.endStr ?? ""}
              onChange={(e) => navigate({ end: e.target.value || undefined })}
              className="h-8 w-36 text-xs"
            />
          </FilterCol>

          {hasFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  userId: undefined,
                  action: undefined,
                  targetType: undefined,
                  start: undefined,
                  end: undefined
                })
              }
              className="ml-auto h-8 gap-1"
            >
              <X className="h-3 w-3" />
              清空筛选
            </Button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-1.5"></th>
              <th className="w-40 px-2 py-1.5 text-left font-normal">时间</th>
              <th className="w-20 px-2 py-1.5 text-left font-normal">操作人</th>
              <th className="px-2 py-1.5 text-left font-normal">动作</th>
              <th className="w-32 px-2 py-1.5 text-left font-normal">对象类型</th>
              <th className="w-40 px-2 py-1.5 text-left font-normal">对象 ID</th>
              <th className="w-24 px-2 py-1.5 text-left font-normal">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-10 text-center text-muted-foreground">
                  没有匹配的审计记录
                </td>
              </tr>
            ) : (
              result.items.flatMap((e) => {
                const hasDetail = e.detail !== null && e.detail !== undefined;
                const isOpen = expanded.has(e.id);
                const rows = [
                  <tr
                    key={e.id}
                    className={cn("hover:bg-muted/20", isOpen && "bg-muted/20")}
                  >
                    <td className="px-2 py-1.5 text-center">
                      {hasDetail && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(e.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {e.createdAt.toLocaleString("zh-CN")}
                    </td>
                    <td className="px-2 py-1.5">{e.user?.name ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-foreground">{e.action}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{e.targetType ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {e.targetId
                        ? e.targetId.length > 18
                          ? `${e.targetId.slice(0, 8)}…${e.targetId.slice(-6)}`
                          : e.targetId
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ];
                if (isOpen && hasDetail) {
                  rows.push(
                    <tr key={`${e.id}-detail`}>
                      <td></td>
                      <td colSpan={6} className="px-2 pb-2 pt-0">
                        <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-foreground">
                          {JSON.stringify(e.detail, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>本页 {result.items.length} 条</span>
        {result.nextCursor && (
          <Button size="sm" variant="outline" onClick={nextPage}>
            下一页 →
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
