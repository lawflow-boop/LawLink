"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Plus, AlertTriangle, Pencil, RotateCw, Unlock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { deletePreservation } from "@/server/preservations/actions";
import {
  PreservationDialog,
  RenewPreservationDialog,
  LiftPreservationDialog
} from "@/app/(app)/preservation/_components/preservation-dialog";
import {
  PRES_TYPE_CN,
  PROPERTY_TYPE_CN,
  PRES_STATUS_CN,
  PRES_STATUS_COLOR,
  classifyExpiry,
  type PreservationRow,
  type MatterOption,
  type UserOption
} from "@/app/(app)/preservation/_components/preservation-types";

export function MatterPreservationPanel({
  matterId,
  matterCode,
  matterTitle,
  preservations,
  users
}: {
  matterId: string;
  matterCode: string;
  matterTitle: string;
  preservations: PreservationRow[];
  users: UserOption[];
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PreservationRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<PreservationRow | null>(null);
  const [liftTarget, setLiftTarget] = useState<PreservationRow | null>(null);

  // 给 Dialog 传一个只含本案的 matter 列表（PreservationDialog 需要 matters[]）
  const matters: MatterOption[] = [{ id: matterId, internalCode: matterCode, title: matterTitle }];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg italic">
          <Shield className="h-4 w-4 text-primary" />
          财产保全
          {preservations.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {preservations.length} 条
            </span>
          )}
        </h3>
        <Button onClick={() => setNewOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          新建保全
        </Button>
      </div>

      {preservations.length === 0 ? (
        <div className="ll-surface rounded-lg border border-border p-10 text-center text-sm text-muted-foreground">
          <Shield className="mx-auto mb-2 h-6 w-6 opacity-40" />
          该案件暂无保全记录。点上方&ldquo;新建保全&rdquo;创建。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {preservations.map((p) => (
            <Card
              key={p.id}
              p={p}
              onEdit={() => setEditTarget(p)}
              onRenew={() => setRenewTarget(p)}
              onLift={() => setLiftTarget(p)}
            />
          ))}
        </div>
      )}

      {/* 新建：预填 matterId */}
      <PreservationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        matters={matters}
        users={users}
        initial={{ matterId } as Partial<PreservationRow> as PreservationRow}
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
    </motion.div>
  );
}

function Card({
  p,
  onEdit,
  onRenew,
  onLift
}: {
  p: PreservationRow;
  onEdit: () => void;
  onRenew: () => void;
  onLift: () => void;
}) {
  const now = new Date();
  const daysLeft = Math.ceil((p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const exp = classifyExpiry(daysLeft);
  const sc = PRES_STATUS_COLOR[p.status];
  const isActive = p.status === "ACTIVE" || p.status === "RENEWED";
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!confirm(`确认删除保全「${p.respondent}」？`)) return;
    startTransition(async () => {
      try {
        await deletePreservation({ id: p.id });
        toast.success("已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <div className="ll-surface flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
          {PRES_TYPE_CN[p.type]}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
          {PROPERTY_TYPE_CN[p.propertyType]}
        </span>
        <Badge
          variant="outline"
          className="px-1.5 text-[10px] font-normal"
          style={{ borderColor: sc.border, background: sc.bg, color: sc.text }}
        >
          {PRES_STATUS_CN[p.status]}
        </Badge>
        {isActive && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              exp.tone === "danger" && "bg-red-500/10 text-red-700",
              exp.tone === "warn" && "bg-amber-500/15 text-amber-700",
              exp.tone === "muted" && "bg-muted/60 text-muted-foreground",
              exp.tone === "ok" && "bg-green-500/10 text-green-700"
            )}
          >
            {exp.tone === "danger" && <AlertTriangle className="h-3 w-3" />}
            {exp.label}
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h4 className="line-clamp-1 text-[1rem] italic">{p.respondent}</h4>
        {p.amount && (
          <span className="font-mono text-[13px] text-foreground/85">
            {formatCurrency(Number(p.amount), { compact: true })}
          </span>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>生效：{p.startDate.toLocaleDateString("zh-CN")}</span>
          <span>到期：{p.expiryDate.toLocaleDateString("zh-CN")}</span>
        </div>
        {p.court && <div className="truncate">{p.court}</div>}
        {p.rulingNumber && <div className="font-mono text-[10px]">{p.rulingNumber}</div>}
        {p.renewals.length > 0 && (
          <div className="text-[10px] text-blue-700/70">已续保 {p.renewals.length} 次</div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 pt-2">
        <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 gap-1 px-2 text-[11px]">
          <Pencil className="h-3 w-3" />
          编辑
        </Button>
        {isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRenew}
            className="h-7 gap-1 px-2 text-[11px] text-blue-700"
          >
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
