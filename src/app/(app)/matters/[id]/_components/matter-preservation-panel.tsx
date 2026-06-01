"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Shield, Plus, Pencil, RotateCw, Unlock, Trash2, UserPlus, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { deletePreservationCase, liftProperty } from "@/server/preservations/actions-v2";
import {
  PreservationCaseDialog,
  AddTargetDialog,
  AddPropertyDialog,
  RenewPropertyDialog
} from "@/app/(app)/preservation/_components/preservation-dialog";
import {
  PRES_TYPE_CN,
  PROPERTY_TYPE_CN,
  PRES_STATUS_CN,
  PRES_STATUS_COLOR,
  classifyExpiry,
  type PreservationCaseRow,
  type MatterOption,
  type UserOption
} from "@/app/(app)/preservation/_components/preservation-types";

export function MatterPreservationPanel({
  matterId,
  matterCode,
  matterTitle,
  preservations: _legacyData,
  users
}: {
  matterId: string;
  matterCode: string;
  matterTitle: string;
  preservations: PreservationCaseRow[];
  users: UserOption[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const cases = _legacyData;

  const matters: MatterOption[] = [{ id: matterId, internalCode: matterCode, title: matterTitle }];

  const totalProps = cases.flatMap((c) => c.targets.flatMap((t) => t.properties));

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg">
          <Shield className="h-4 w-4 text-primary" />
          财产保全
          {totalProps.length > 0 && <span className="font-mono text-[11px] text-muted-foreground">{totalProps.length} 项</span>}
        </h3>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> 新建保全
        </Button>
      </div>

      {cases.length === 0 ? (
        <div className="ll-surface rounded-lg border border-border p-10 text-center text-sm text-muted-foreground">
          <Shield className="mx-auto mb-2 h-6 w-6 opacity-40" />
          该案件暂无保全记录
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((cs) => (
            <CaseCard key={cs.id} cs={cs} matters={matters} users={users} />
          ))}
        </div>
      )}

      <PreservationCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matters={matters}
        users={users}
        initialMatterId={matterId}
      />
    </motion.div>
  );
}

function CaseCard({ cs, matters, users }: { cs: PreservationCaseRow; matters: MatterOption[]; users: UserOption[] }) {
  const [expanded, setExpanded] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [addTargetOpen, setAddTargetOpen] = useState(false);
  const [addPropOpen, setAddPropOpen] = useState<string | null>(null);
  const [renewPropOpen, setRenewPropOpen] = useState<string | null>(null);

  const allProps = cs.targets.flatMap((t) => t.properties);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Shield className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{PRES_TYPE_CN[cs.type]}</span>
            {cs.court && <span className="text-xs text-muted-foreground">{cs.court}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {cs.targets.length} 个被保全人 · {allProps.length} 项财产
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setEditOpen(true)} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
          <button type="button" onClick={() => { if (confirm("确认删除？")) { startTransition(async () => { try { await deletePreservationCase({ id: cs.id }); toast.success("已删除"); } catch { toast.error("删除失败"); } }); } }} className="rounded-md p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {cs.targets.map((t) => (
            <div key={t.id}>
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">{t.name}</span>
                <button type="button" onClick={() => setAddPropOpen(t.id)} className="text-[10px] text-primary hover:underline">+ 添加财产</button>
              </div>
              {t.properties.length === 0 ? (
                <p className="pl-5 text-[11px] text-muted-foreground">暂无财产</p>
              ) : (
                <div className="pl-5 space-y-1">
                  {t.properties.map((p) => {
                    const days = Math.ceil((p.expiryDate.getTime() - Date.now()) / 86400000);
                    const exp = classifyExpiry(days);
                    const sc = PRES_STATUS_COLOR[p.status] ?? PRES_STATUS_COLOR.ACTIVE;
                    const isActive = p.status === "ACTIVE" || p.status === "RENEWED";
                    return (
                      <div key={p.id} className="flex items-center gap-2 rounded border border-border bg-background px-2.5 py-1.5 text-[11px]">
                        <Landmark className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{PROPERTY_TYPE_CN[p.propertyType]}</span>
                        {p.amount && <span className="text-muted-foreground">{formatCurrency(Number(p.amount), { compact: true })}</span>}
                        <span className={cn("ml-auto shrink-0 font-medium", exp.tone === "danger" && "text-destructive", exp.tone === "warn" && "text-amber-500")}>{exp.label}</span>
                        <span className="shrink-0 rounded border px-1 py-0 text-[9px]" style={{ borderColor: sc.border, color: sc.text, backgroundColor: sc.bg }}>{PRES_STATUS_CN[p.status]}</span>
                        {isActive && (
                          <>
                            <button type="button" onClick={() => setRenewPropOpen(p.id)} className="shrink-0 text-[10px] text-primary hover:underline">续保</button>
                            <button type="button" onClick={() => { startTransition(async () => { try { await liftProperty(p.id); toast.success("已解除"); } catch { toast.error("操作失败"); } }); }} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">解除</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setAddTargetOpen(true)} className="h-7 gap-1 text-[11px]"><UserPlus className="h-3 w-3" />添加被保全人</Button>
        </div>
      )}

      <PreservationCaseDialog open={editOpen} onOpenChange={setEditOpen} editCase={cs} matters={matters} users={users} />
      <AddTargetDialog open={addTargetOpen} onOpenChange={setAddTargetOpen} caseId={cs.id} />
      {addPropOpen && <AddPropertyDialog open={!!addPropOpen} onOpenChange={(o) => { if (!o) setAddPropOpen(null); }} targetId={addPropOpen} />}
      {renewPropOpen && (() => { const prop = allProps.find((p) => p.id === renewPropOpen); return prop ? <RenewPropertyDialog open={!!renewPropOpen} onOpenChange={(o) => { if (!o) setRenewPropOpen(null); }} property={prop} /> : null; })()}
    </div>
  );
}
