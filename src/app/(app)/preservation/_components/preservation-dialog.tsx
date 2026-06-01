"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { PreservationType, PropertyType } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createPreservationCase,
  addTarget,
  addProperty,
  renewProperty,
} from "@/server/preservations/actions-v2";
import { PRES_TYPE_CN, PROPERTY_TYPE_CN, type PreservationCaseRow, type MatterOption, type UserOption } from "./preservation-types";
import { PRESERVATION_DURATION_DAYS } from "@/lib/preservation-defaults";

// ── Case Dialog (create + edit) ──

export function PreservationCaseDialog({
  open,
  onOpenChange,
  editCase,
  matters,
  users,
  initialMatterId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editCase?: PreservationCaseRow;
  matters: MatterOption[];
  users: UserOption[];
  initialMatterId?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!editCase;

  const [matterId, setMatterId] = useState(editCase?.matterId ?? initialMatterId ?? "");
  const [type, setType] = useState<PreservationType>(editCase?.type ?? "LITIGATION");
  const [court, setCourt] = useState(editCase?.court ?? "");
  const [rulingNumber, setRulingNumber] = useState(editCase?.rulingNumber ?? "");
  const [ownerId, setOwnerId] = useState(editCase?.ownerId ?? "");
  const [note, setNote] = useState(editCase?.note ?? "");
  // First target + property (create only)
  const [target, setTarget] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("BANK_DEPOSIT");
  const [propertyDetail, setPropertyDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState("");

  function reset() {
    if (!isEdit) {
      setMatterId(""); setType("LITIGATION"); setCourt(""); setRulingNumber("");
      setOwnerId(""); setNote(""); setTarget(""); setPropertyType("BANK_DEPOSIT");
      setPropertyDetail(""); setAmount(""); setStartDate(""); setDuration("");
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const dur = parseInt(duration) || PRESERVATION_DURATION_DAYS[propertyType];
        const sd = startDate ? new Date(startDate) : new Date();
        const ed = new Date(sd.getTime() + dur * 86400000);

        await createPreservationCase({
          matterId: matterId === "__none__" ? null : (matterId || null),
          type,
          court, rulingNumber,
          ownerId: ownerId === "__none__" ? null : (ownerId || null),
          note,
          remindDays: [30, 15, 7, 3, 1],
          firstTarget: target,
          firstPropertyType: target ? propertyType : undefined,
          firstPropertyDetail: propertyDetail,
          firstAmount: amount ? parseFloat(amount) : null,
          firstStartDate: target ? sd : undefined,
          firstDuration: target ? dur : undefined,
          firstExpiryDate: target ? ed : undefined,
        });
        toast.success(isEdit ? "已更新" : "保全已创建");
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("操作失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑保全" : "新建保全"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="关联案件">
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="选择案件（诉前可空）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不关联</SelectItem>
                  {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.internalCode} {m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="保全类型 *">
              <Select value={type} onValueChange={(v) => setType(v as PreservationType)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRES_TYPE_CN).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="保全法院"><Input value={court} onChange={(e) => setCourt(e.target.value)} className="h-9 text-xs" /></Field>
            <Field label="裁定书编号"><Input value={rulingNumber} onChange={(e) => setRulingNumber(e.target.value)} className="h-9 text-xs font-mono" /></Field>
            <Field label="跟进负责人">
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不指定</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="备注"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs" /></Field>

          {/* First target + property (create only) */}
          {!isEdit && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">首个被保全人及财产（可后续添加更多）</p>
              <Field label="被保全人"><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="被保全人名称" className="h-9 text-xs" /></Field>
              {target && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="财产类型 *">
                    <Select value={propertyType} onValueChange={(v) => { setPropertyType(v as PropertyType); setDuration(String(PRESERVATION_DURATION_DAYS[v as PropertyType])); }}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROPERTY_TYPE_CN).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="保全金额"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 text-xs font-mono" /></Field>
                  <Field label="财产详情"><Input value={propertyDetail} onChange={(e) => setPropertyDetail(e.target.value)} placeholder="如：账号/地址/车牌" className="h-9 text-xs" /></Field>
                  <Field label="生效日期"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" /></Field>
                  <Field label="保全期限（天）"><Input type="number" value={duration || String(PRESERVATION_DURATION_DAYS[propertyType])} onChange={(e) => setDuration(e.target.value)} className="h-9 text-xs font-mono" /></Field>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>取消</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Target ──

export function AddTargetDialog({ open, onOpenChange, caseId }: { open: boolean; onOpenChange: (o: boolean) => void; caseId: string }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleSubmit() {
    startTransition(async () => {
      try {
        await addTarget({ caseId, name });
        toast.success("被保全人已添加");
        setName("");
        onOpenChange(false);
      } catch (err) {
        toast.error("添加失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>添加被保全人</DialogTitle></DialogHeader>
        <Field label="被保全人名称 *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" className="h-9 text-xs" /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim()} className="gap-1.5">{isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Property ──

export function AddPropertyDialog({ open, onOpenChange, targetId }: { open: boolean; onOpenChange: (o: boolean) => void; targetId: string }) {
  const [isPending, startTransition] = useTransition();
  const [propertyType, setPropertyType] = useState<PropertyType>("BANK_DEPOSIT");
  const [propertyDetail, setPropertyDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState("");

  function handleSubmit() {
    const dur = parseInt(duration) || PRESERVATION_DURATION_DAYS[propertyType];
    const sd = startDate ? new Date(startDate) : new Date();
    const ed = new Date(sd.getTime() + dur * 86400000);

    startTransition(async () => {
      try {
        await addProperty({
          targetId,
          propertyType,
          propertyDetail,
          amount: amount ? parseFloat(amount) : null,
          startDate: sd,
          duration: dur,
          expiryDate: ed,
        });
        toast.success("财产已添加");
        onOpenChange(false);
      } catch (err) {
        toast.error("添加失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>添加保全财产</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="财产类型 *">
              <Select value={propertyType} onValueChange={(v) => { setPropertyType(v as PropertyType); setDuration(String(PRESERVATION_DURATION_DAYS[v as PropertyType])); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROPERTY_TYPE_CN).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="保全金额"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs font-mono" /></Field>
            <Field label="财产详情"><Input value={propertyDetail} onChange={(e) => setPropertyDetail(e.target.value)} placeholder="如：账号/地址" className="h-9 text-xs" /></Field>
            <Field label="生效日期"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" /></Field>
            <Field label="保全期限（天）"><Input type="number" value={duration || String(PRESERVATION_DURATION_DAYS[propertyType])} onChange={(e) => setDuration(e.target.value)} className="h-9 text-xs font-mono" /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">{isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Renew Property ──

export function RenewPropertyDialog({ open, onOpenChange, property }: { open: boolean; onOpenChange: (o: boolean) => void; property: { id: string; expiryDate: Date } }) {
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState("365");
  const [note, setNote] = useState("");

  function handleSubmit() {
    const d = parseInt(days) || 365;
    const newExpiry = new Date(property.expiryDate.getTime() + d * 86400000);
    startTransition(async () => {
      try {
        await renewProperty({ propertyId: property.id, newExpiryDate: newExpiry, renewalDuration: d, note });
        toast.success("续保成功");
        onOpenChange(false);
      } catch (err) {
        toast.error("续保失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>续保</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">当前到期日：{property.expiryDate.toLocaleDateString("zh-CN")}</p>
          <Field label="续保天数"><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="h-9 text-xs font-mono" /></Field>
          <Field label="备注"><Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-xs" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">{isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}确认续保</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}
