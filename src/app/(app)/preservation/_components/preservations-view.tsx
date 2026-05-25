"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  Pencil,
  RotateCw,
  Unlock,
  Trash2,
  Calendar
} from "lucide-react";
import { buildIcs, downloadIcs, type IcsEvent } from "@/lib/ics";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioChips } from "@/components/ui/radio-chips";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { deletePreservation } from "@/server/preservations/actions";
import {
  PreservationDialog,
  RenewPreservationDialog,
  LiftPreservationDialog
} from "./preservation-dialog";
import {
  PRES_TYPE_CN,
  PROPERTY_TYPE_CN,
  PRES_STATUS_CN,
  PRES_STATUS_COLOR,
  classifyExpiry,
  type PreservationRow,
  type MatterOption,
  type UserOption
} from "./preservation-types";
import type { PreservationStatus } from "@prisma/client";

type StatusFilter = PreservationStatus | "ALL";

export function PreservationsView({
  items,
  matters,
  users
}: {
  items: PreservationRow[];
  matters: MatterOption[];
  users: UserOption[];
}) {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PreservationRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<PreservationRow | null>(null);
  const [liftTarget, setLiftTarget] = useState<PreservationRow | null>(null);

  // KPI
  const stats = useMemo(() => {
    let active = 0;
    let total = 0;
    let expiring30 = 0;
    let overdue = 0;
    const now = new Date();
    for (const p of items) {
      if (p.status === "ACTIVE" || p.status === "RENEWED") {
        active++;
        total += p.amount ? Number(p.amount) : 0;
        const days = Math.ceil((p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 0) overdue++;
        else if (days <= 30) expiring30++;
      }
    }
    return { active, total, expiring30, overdue };
  }, [items]);

  // 过滤
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items.filter((p) => {
      if (status !== "ALL" && p.status !== status) return false;
      if (!kw) return true;
      return (
        p.respondent.toLowerCase().includes(kw) ||
        (p.matter?.title ?? "").toLowerCase().includes(kw) ||
        (p.matter?.internalCode ?? "").toLowerCase().includes(kw) ||
        (p.rulingNumber ?? "").toLowerCase().includes(kw)
      );
    });
  }, [items, status, search]);

  // 导出全部活跃保全的 ICS
  const exportAllIcs = () => {
    const actives = items.filter((p) => p.status === "ACTIVE" || p.status === "RENEWED");
    if (actives.length === 0) {
      toast.warning("无活跃保全可导出");
      return;
    }
    const events: IcsEvent[] = [];
    for (const p of actives) {
      const expiry = new Date(p.expiryDate);
      const title = `【保全到期】${p.respondent} · ${PROPERTY_TYPE_CN[p.propertyType]}`;
      const desc = [
        p.matter ? `案件：${p.matter.internalCode} ${p.matter.title}` : "诉前保全（未关联案件）",
        `类型：${PRES_TYPE_CN[p.type]}`,
        p.amount ? `金额：${Number(p.amount).toLocaleString()} 元` : null,
        p.court ? `保全法院：${p.court}` : null,
        p.rulingNumber ? `裁定书：${p.rulingNumber}` : null
      ]
        .filter(Boolean)
        .join("\n");
      events.push({
        uid: `preservation-${p.id}`,
        title,
        start: expiry,
        allDay: true,
        description: desc,
        reminderMinutes: (p.remindDays ?? [30, 15, 7, 3, 1]).map((d) => d * 24 * 60)
      });
    }
    const ics = buildIcs({ calendarName: "LawLink 保全到期提醒", events });
    downloadIcs(`保全提醒_${new Date().toISOString().slice(0, 10)}.ics`, ics);
    toast.success(`已导出 ${actives.length} 条到期提醒`);
  };

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl italic">财产保全</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            到期自动分级预警 30/15/7/3/1 天 · 续保留痕
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportAllIcs}
            className="gap-1.5"
            title="导出所有活跃保全到期日，含 30/15/7/3/1 天提醒"
          >
            <Calendar className="h-3.5 w-3.5" />
            导出日历
          </Button>
          <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            新建保全
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Shield className="h-3.5 w-3.5" />}
          label="生效保全"
          value={stats.active.toString()}
          accent="rgb(22 163 74)"
        />
        <Kpi
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="累计保全金额"
          value={`¥${(stats.total / 10000).toFixed(1)}万`}
          accent="rgb(37 99 235)"
        />
        <Kpi
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="30 天内到期"
          value={stats.expiring30.toString()}
          accent="rgb(217 119 6)"
        />
        <Kpi
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="已过期未处理"
          value={stats.overdue.toString()}
          accent="rgb(220 38 38)"
        />
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 被保全人 / 案件名 / 编号 / 裁定书"
            className="h-9 border-border bg-card pl-9"
          />
        </div>
        <RadioChips
          size="sm"
          items={[
            { value: "ALL", label: "全部" },
            { value: "ACTIVE", label: "生效中" },
            { value: "RENEWED", label: "已续保" },
            { value: "EXPIRED", label: "已到期" },
            { value: "LIFTED", label: "已解除" }
          ]}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
      </div>

      {/* 列表 */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {filtered.length === 0 ? (
          <div className="ll-surface rounded-lg border border-border p-12 text-center text-sm text-muted-foreground">
            <Shield className="mx-auto mb-2 h-6 w-6 opacity-40" />
            {items.length === 0 ? "暂无保全记录，点右上「新建保全」添加" : "没有匹配的保全记录"}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <PresCard
                key={p.id}
                pres={p}
                onEdit={() => setEditTarget(p)}
                onRenew={() => setRenewTarget(p)}
                onLift={() => setLiftTarget(p)}
              />
            ))}
          </div>
        )}
      </motion.div>

      <PreservationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        matters={matters}
        users={users}
      />
      {editTarget && (
        <PreservationDialog
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          matters={matters}
          users={users}
          initial={editTarget}
        />
      )}
      {renewTarget && (
        <RenewPreservationDialog
          open
          onOpenChange={(o) => !o && setRenewTarget(null)}
          pres={renewTarget}
        />
      )}
      {liftTarget && (
        <LiftPreservationDialog
          open
          onOpenChange={(o) => !o && setLiftTarget(null)}
          pres={liftTarget}
        />
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="ll-surface rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-3xl italic" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function PresCard({
  pres,
  onEdit,
  onRenew,
  onLift
}: {
  pres: PreservationRow;
  onEdit: () => void;
  onRenew: () => void;
  onLift: () => void;
}) {
  const now = new Date();
  const daysLeft = Math.ceil((pres.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const exp = classifyExpiry(daysLeft);
  const sc = PRES_STATUS_COLOR[pres.status];
  const isActive = pres.status === "ACTIVE" || pres.status === "RENEWED";
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!confirm(`确认删除保全记录「${pres.respondent}」？此操作不可撤销。`)) return;
    startTransition(async () => {
      try {
        await deletePreservation({ id: pres.id });
        toast.success("已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <div className="ll-surface flex flex-col gap-2 rounded-lg border border-border p-4">
      {/* 行 1：类型 + 财产 + 状态 + 到期倒计时 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
          {PRES_TYPE_CN[pres.type]}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
          {PROPERTY_TYPE_CN[pres.propertyType]}
        </span>
        <Badge
          variant="outline"
          className="px-1.5 text-[10px] font-normal"
          style={{ borderColor: sc.border, background: sc.bg, color: sc.text }}
        >
          {PRES_STATUS_CN[pres.status]}
        </Badge>
        {isActive && (
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium",
              exp.tone === "danger" && "bg-red-500/10 text-red-700",
              exp.tone === "warn" && "bg-amber-500/15 text-amber-700",
              exp.tone === "muted" && "bg-muted/60 text-muted-foreground",
              exp.tone === "ok" && "bg-green-500/10 text-green-700"
            )}
          >
            {exp.label}
          </span>
        )}
      </div>

      {/* 行 2：被保全人 + 金额 */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="line-clamp-1 text-[1rem] italic text-foreground">
          {pres.respondent}
        </h3>
        {pres.amount && (
          <span className="font-mono text-[13px] text-foreground/85">
            {formatCurrency(Number(pres.amount), { compact: true })}
          </span>
        )}
      </div>

      {/* 行 3：关联案件 */}
      {pres.matter ? (
        <Link
          href={`/matters/${pres.matter.id}`}
          className="group inline-flex items-center gap-1 text-[11px] hover:text-primary"
        >
          <Briefcase className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {pres.matter.internalCode}
          </span>
          <span className="truncate text-muted-foreground group-hover:text-primary">
            {pres.matter.title}
          </span>
        </Link>
      ) : (
        <span className="text-[11px] italic text-muted-foreground/60">未关联案件（诉前）</span>
      )}

      {/* 行 4：日期 + 法院 + 裁定书 */}
      <div className="mt-1 space-y-0.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <span>生效：{fmtDate(pres.startDate)}</span>
          <span>到期：{fmtDate(pres.expiryDate)}</span>
        </div>
        {pres.court && <div className="truncate">{pres.court}</div>}
        {pres.rulingNumber && <div className="font-mono text-[10px]">{pres.rulingNumber}</div>}
        {pres.renewals.length > 0 && (
          <div className="text-[10px] text-blue-700/70">已续保 {pres.renewals.length} 次</div>
        )}
      </div>

      {/* 操作 */}
      <div className="mt-auto flex items-center justify-end gap-1 pt-2">
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 gap-1 px-2 text-[11px]">
          <Pencil className="h-3 w-3" />
          编辑
        </Button>
        {isActive && (
          <Button size="sm" variant="ghost" onClick={onRenew} className="h-7 gap-1 px-2 text-[11px] text-blue-700">
            <RotateCw className="h-3 w-3" />
            续保
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="ghost" onClick={onLift} className="h-7 gap-1 px-2 text-[11px]">
            <Unlock className="h-3 w-3" />
            解除
          </Button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("zh-CN");
}
