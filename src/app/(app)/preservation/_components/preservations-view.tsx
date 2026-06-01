"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield, Plus, Search, ChevronDown, ChevronRight,
  Pencil, RotateCw, Trash2, UserPlus, Landmark
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioChips } from "@/components/ui/radio-chips";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { deletePreservationCase } from "@/server/preservations/actions-v2";
import {
  PreservationCaseDialog,
  AddTargetDialog,
  AddPropertyDialog,
  RenewPropertyDialog
} from "./preservation-dialog";
import {
  PRES_TYPE_CN,
  PROPERTY_TYPE_CN,
  PRES_STATUS_CN,
  PRES_STATUS_COLOR,
  classifyExpiry,
  type PreservationCaseRow,
  type MatterOption,
  type UserOption
} from "./preservation-types";

const STATUS_FILTERS = [
  { value: "ALL", label: "全部" },
  { value: "ACTIVE", label: "生效中" },
  { value: "RENEWED", label: "已续保" },
  { value: "EXPIRED", label: "已到期" },
  { value: "LIFTED", label: "已解除" }
];

export function PreservationsView({
  items,
  matters,
  users
}: {
  items: PreservationCaseRow[];
  matters: MatterOption[];
  users: UserOption[];
}) {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allProperties = useMemo(
    () => items.flatMap((c) => c.targets.flatMap((t) => t.properties)),
    [items]
  );
  const activeCount = allProperties.filter((p) => p.status === "ACTIVE" || p.status === "RENEWED").length;
  const totalAmount = allProperties.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const expiring30 = allProperties.filter((p) => {
    if (p.status !== "ACTIVE" && p.status !== "RENEWED") return false;
    const days = Math.ceil((p.expiryDate.getTime() - Date.now()) / 86400000);
    return days <= 30;
  }).length;
  const expiredCount = allProperties.filter((p) => p.status === "EXPIRED").length;

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== "ALL") {
      list = list.filter((c) => {
        const ps = c.targets.flatMap((t) => t.properties);
        if (statusFilter === "ACTIVE") return ps.some((p) => p.status === "ACTIVE");
        if (statusFilter === "RENEWED") return ps.some((p) => p.status === "RENEWED");
        if (statusFilter === "EXPIRED") return ps.some((p) => p.status === "EXPIRED");
        if (statusFilter === "LIFTED") return c.status === "LIFTED";
        return true;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.court?.toLowerCase().includes(q) ||
          c.rulingNumber?.toLowerCase().includes(q) ||
          c.targets.some((t) => t.name.toLowerCase().includes(q)) ||
          c.matter?.title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, statusFilter, search]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl">
          <Shield className="h-5 w-5 text-primary" strokeWidth={1.8} />
          财产保全
        </h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          按被保全人及财产跟踪保全期限，到期前持续提醒
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="生效保全" value={activeCount} />
        <KpiCard label="累计保全金额" value={formatCurrency(totalAmount)} />
        <KpiCard label="30天内到期" value={expiring30} tone="warn" />
        <KpiCard label="已过期未处理" value={expiredCount} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索被保全人 / 案件 / 法院" className="pl-8 text-xs" />
        </div>
        <RadioChips items={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <Button size="sm" onClick={() => setCreateOpen(true)} className="ml-auto gap-1.5">
          <Plus className="h-3.5 w-3.5" /> 新建保全
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Shield className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{search ? `没有匹配「${search}」的保全记录` : "还没有保全记录"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cs) => (
            <CaseCard key={cs.id} caseData={cs} expanded={expandedId === cs.id} onToggle={() => setExpandedId(expandedId === cs.id ? null : cs.id)} matters={matters} users={users} />
          ))}
        </div>
      )}

      <PreservationCaseDialog open={createOpen} onOpenChange={setCreateOpen} matters={matters} users={users} />
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular", tone === "danger" && "text-destructive", tone === "warn" && "text-amber-500")}>{value}</div>
    </div>
  );
}

function CaseCard({ caseData: cs, expanded, onToggle, matters, users }: { caseData: PreservationCaseRow; expanded: boolean; onToggle: () => void; matters: MatterOption[]; users: UserOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [addTargetOpen, setAddTargetOpen] = useState(false);
  const [addPropOpen, setAddPropOpen] = useState<string | null>(null);
  const [renewPropOpen, setRenewPropOpen] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const allProps = cs.targets.flatMap((t) => t.properties);
  const worstExpiry = allProps.length ? Math.min(...allProps.map((p) => Math.ceil((p.expiryDate.getTime() - Date.now()) / 86400000))) : null;
  const expiryInfo = worstExpiry !== null ? classifyExpiry(worstExpiry) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <Shield className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{cs.matter ? cs.matter.title : "未关联案件"}</span>
            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-primary border-primary/30 bg-primary/5">{PRES_TYPE_CN[cs.type]}</span>
            {expiryInfo && <span className={cn("shrink-0 text-[10px] font-medium", expiryInfo.tone === "danger" ? "text-destructive" : expiryInfo.tone === "warn" ? "text-amber-500" : "text-muted-foreground")}>{expiryInfo.label}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {cs.court && <span>{cs.court}</span>}{cs.rulingNumber && <span> · {cs.rulingNumber}</span>}{" · "}{cs.targets.length} 个被保全人 · {allProps.length} 项财产
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setEditOpen(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => { if (confirm("确认删除此保全案件及所有记录？")) { startTransition(async () => { try { await deletePreservationCase({ id: cs.id }); toast.success("已删除"); } catch (e) { toast.error("删除失败"); } }); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {cs.targets.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">还没有被保全人</p>
          ) : cs.targets.map((target) => (
            <div key={target.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{target.name}</span>
                <button type="button" onClick={() => setAddPropOpen(target.id)} className="ml-auto text-[11px] text-primary hover:underline">+ 添加财产</button>
              </div>
              {target.properties.length === 0 ? (
                <p className="pl-6 text-xs text-muted-foreground">暂无财产记录</p>
              ) : (
                <div className="pl-6 space-y-1.5">
                  {target.properties.map((prop) => {
                    const days = Math.ceil((prop.expiryDate.getTime() - Date.now()) / 86400000);
                    const exp = classifyExpiry(days);
                    const sc = PRES_STATUS_COLOR[prop.status] ?? PRES_STATUS_COLOR.ACTIVE;
                    return (
                      <div key={prop.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                        <Landmark className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium">{PROPERTY_TYPE_CN[prop.propertyType]}</span>
                        {prop.amount && <span className="text-[11px] text-muted-foreground">{formatCurrency(Number(prop.amount))}</span>}
                        {prop.propertyDetail && <span className="truncate text-[10px] text-muted-foreground">({prop.propertyDetail})</span>}
                        <span className={cn("ml-auto shrink-0 text-[10px] font-medium", exp.tone === "danger" ? "text-destructive" : exp.tone === "warn" ? "text-amber-500" : "text-muted-foreground")}>{exp.label}</span>
                        <span className="shrink-0 rounded border px-1.5 py-0 text-[9px]" style={{ borderColor: sc.border, color: sc.text, backgroundColor: sc.bg }}>{PRES_STATUS_CN[prop.status]}</span>
                        {(prop.status === "ACTIVE" || prop.status === "RENEWED") && (
                          <>
                            <button type="button" onClick={() => setRenewPropOpen(prop.id)} className="shrink-0 text-[10px] text-primary hover:underline">续保</button>
                            <button type="button" onClick={() => { startTransition(async () => { try { const { liftProperty } = await import("@/server/preservations/actions-v2"); await liftProperty(prop.id); toast.success("已解除"); } catch { toast.error("操作失败"); } }); }} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">解除</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setAddTargetOpen(true)} className="gap-1 text-xs"><UserPlus className="h-3 w-3" /> 添加被保全人</Button>
        </div>
      )}

      <PreservationCaseDialog open={editOpen} onOpenChange={setEditOpen} editCase={cs} matters={matters} users={users} />
      <AddTargetDialog open={addTargetOpen} onOpenChange={setAddTargetOpen} caseId={cs.id} />
      {addPropOpen && <AddPropertyDialog open={!!addPropOpen} onOpenChange={(o) => { if (!o) setAddPropOpen(null); }} targetId={addPropOpen} />}
      {renewPropOpen && (() => { const prop = allProps.find((p) => p.id === renewPropOpen); return prop ? <RenewPropertyDialog open={!!renewPropOpen} onOpenChange={(o) => { if (!o) setRenewPropOpen(null); }} property={prop} /> : null; })()}
    </motion.div>
  );
}
