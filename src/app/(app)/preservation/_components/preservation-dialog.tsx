"use client";

import { useState, useEffect, useTransition } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import type { PreservationType, PropertyType, GuaranteeType } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioChips } from "@/components/ui/radio-chips";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { MatterCombobox } from "@/app/(app)/approvals/seals/_components/matter-combobox";
import { createPreservation, updatePreservation } from "@/server/preservations/actions";
import { defaultExpiryDate, PRESERVATION_DURATION_DAYS } from "@/lib/preservation-defaults";
import {
  PRES_TYPE_CN,
  PROPERTY_TYPE_CN,
  GUARANTEE_TYPE_CN,
  type PreservationRow,
  type MatterOption,
  type UserOption
} from "./preservation-types";

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PreservationDialog({
  open,
  onOpenChange,
  matters,
  users,
  initial
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matters: MatterOption[];
  users: UserOption[];
  initial?: PreservationRow | null;
}) {
  const editing = !!initial;

  const [matterId, setMatterId] = useState(initial?.matterId ?? "");
  const [type, setType] = useState<PreservationType>(initial?.type ?? "LITIGATION");
  const [propertyType, setPropertyType] = useState<PropertyType>(initial?.propertyType ?? "BANK_DEPOSIT");
  const [amount, setAmount] = useState(initial?.amount ? Number(initial.amount).toString() : "");
  const [respondent, setRespondent] = useState(initial?.respondent ?? "");
  const [guaranteeType, setGuaranteeType] = useState<GuaranteeType | "">(initial?.guaranteeType ?? "");
  const [appliedAt, setAppliedAt] = useState(initial?.appliedAt ? fmtDate(initial.appliedAt) : "");
  const [startDate, setStartDate] = useState(initial?.startDate ? fmtDate(initial.startDate) : fmtDate(new Date()));
  const [duration, setDuration] = useState<number>(initial?.duration ?? PRESERVATION_DURATION_DAYS.BANK_DEPOSIT);
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ? fmtDate(initial.expiryDate) : "");
  const [court, setCourt] = useState(initial?.court ?? "");
  const [rulingNumber, setRulingNumber] = useState(initial?.rulingNumber ?? "");
  const [propertyDetail, setPropertyDetail] = useState(initial?.propertyDetail ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? "");
  const [pending, startTransition] = useTransition();

  // 切换财产类型时如未手动改 duration，按默认值更新
  useEffect(() => {
    if (editing) return;
    const def = PRESERVATION_DURATION_DAYS[propertyType];
    setDuration(def);
  }, [propertyType, editing]);

  // 由 startDate + duration 自动算 expiryDate（新建时；编辑时尊重用户值）
  useEffect(() => {
    if (!startDate || !duration) return;
    if (editing && initial?.expiryDate && fmtDate(initial.expiryDate) === expiryDate) return;
    const sd = new Date(startDate);
    if (isNaN(sd.getTime())) return;
    setExpiryDate(fmtDate(defaultExpiryDate(sd, propertyType)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, duration, propertyType]);

  const submit = () => {
    if (!respondent.trim()) {
      toast.error("被保全人必填");
      return;
    }
    const sd = startDate ? new Date(startDate) : null;
    const ed = expiryDate ? new Date(expiryDate) : null;
    if (!sd || !ed || isNaN(sd.getTime()) || isNaN(ed.getTime())) {
      toast.error("请填写有效的生效日期与到期日期");
      return;
    }
    if (ed <= sd) {
      toast.error("到期日期必须晚于生效日期");
      return;
    }

    const payload = {
      matterId: matterId || null,
      type,
      propertyType,
      amount: amount ? Number(amount) : null,
      respondent: respondent.trim(),
      guaranteeType: guaranteeType || null,
      appliedAt: appliedAt ? new Date(appliedAt) : null,
      startDate: sd,
      duration,
      expiryDate: ed,
      court: court.trim(),
      rulingNumber: rulingNumber.trim(),
      propertyDetail: propertyDetail.trim(),
      note: note.trim(),
      ownerId: ownerId || null,
      remindDays: initial?.remindDays ?? [30, 15, 7, 3, 1]
    };

    startTransition(async () => {
      try {
        if (editing && initial) {
          await updatePreservation({ id: initial.id, ...payload });
          toast.success("已更新");
        } else {
          await createPreservation(payload);
          toast.success("保全记录已创建");
        }
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {editing ? "编辑保全" : "新建保全"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            保全期限默认按财产类型自动推荐（存款 1 年 / 动产 2 年 / 不动产·股权·知识产权 3 年），可手动覆盖
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* 关联案件 */}
          <div>
            <Label className="text-[11px]">关联案件（诉前可不填）</Label>
            <div className="mt-1">
              <MatterCombobox
                matters={matters}
                value={matterId}
                onChange={setMatterId}
                placeholder="搜索案件编号 / 名称（可选）"
              />
            </div>
          </div>

          {/* 类型 */}
          <div>
            <Label className="text-[11px]">保全类型 *</Label>
            <RadioChips
              className="mt-2"
              items={(["PRE_LITIGATION", "LITIGATION", "ENFORCEMENT"] as const).map((t) => ({
                value: t,
                label: PRES_TYPE_CN[t]
              }))}
              value={type}
              onChange={(v) => setType(v as PreservationType)}
            />
          </div>

          {/* 财产类型 + 默认期限提示 */}
          <div>
            <Label className="text-[11px]">财产类型 *</Label>
            <RadioChips
              className="mt-2"
              items={(["BANK_DEPOSIT", "REAL_ESTATE", "VEHICLE", "EQUITY", "IP", "OTHER"] as const).map((t) => ({
                value: t,
                label: PROPERTY_TYPE_CN[t]
              }))}
              value={propertyType}
              onChange={(v) => setPropertyType(v as PropertyType)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">保全金额（元）</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px]">担保方式</Label>
              <Select value={guaranteeType || "none"} onValueChange={(v) => setGuaranteeType(v === "none" ? "" : (v as GuaranteeType))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择担保方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {(["CASH_DEPOSIT", "GUARANTEE_LETTER", "PROPERTY", "NONE"] as const).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GUARANTEE_TYPE_CN[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px]">被保全人 *</Label>
            <Input
              value={respondent}
              onChange={(e) => setRespondent(e.target.value)}
              placeholder="自然人姓名 / 公司名称"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">申请日</Label>
              <Input
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px]">生效日 *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">保全期限（天）</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1 font-mono"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                默认按财产类型推荐，可手动调整
              </p>
            </div>
            <div>
              <Label className="text-[11px]">到期日 *</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">保全法院</Label>
              <Input value={court} onChange={(e) => setCourt(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px]">裁定书编号</Label>
              <Input
                value={rulingNumber}
                onChange={(e) => setRulingNumber(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">跟进负责人</Label>
            <Select value={ownerId || "none"} onValueChange={(v) => setOwnerId(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="选择负责人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不指派</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px]">财产细节</Label>
            <Textarea
              value={propertyDetail}
              onChange={(e) => setPropertyDetail(e.target.value)}
              rows={2}
              placeholder="如：建设银行某支行账户 6228XXXX / 房产具体地址 / 车牌号"
              className="mt-1 text-[12px]"
            />
          </div>

          <div>
            <Label className="text-[11px]">备注</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 text-[12px]"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {editing ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 续保 Dialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { renewPreservation, liftPreservation } from "@/server/preservations/actions";

export function RenewPreservationDialog({
  open,
  onOpenChange,
  pres
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pres: PreservationRow;
}) {
  const [renewDays, setRenewDays] = useState<number>(PRESERVATION_DURATION_DAYS[pres.propertyType]);
  const calcExpiry = () => {
    const d = new Date(pres.expiryDate);
    d.setDate(d.getDate() + renewDays);
    return fmtDate(d);
  };
  const [newExpiryDate, setNewExpiryDate] = useState(calcExpiry());
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = new Date(pres.expiryDate);
    d.setDate(d.getDate() + renewDays);
    setNewExpiryDate(fmtDate(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewDays]);

  const submit = () => {
    const nd = new Date(newExpiryDate);
    if (isNaN(nd.getTime())) {
      toast.error("请填写有效的新到期日");
      return;
    }
    startTransition(async () => {
      try {
        await renewPreservation({
          id: pres.id,
          newExpiryDate: nd,
          renewalDuration: renewDays,
          note: note.trim()
        });
        toast.success("续保成功");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>续保 · {pres.respondent}</DialogTitle>
          <DialogDescription className="text-xs">
            原到期日：{fmtDate(pres.expiryDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">续保天数</Label>
              <RadioChips
                size="sm"
                className="mt-2"
                items={[
                  { value: "365", label: "1 年" },
                  { value: "730", label: "2 年" },
                  { value: "1095", label: "3 年" }
                ]}
                value={String(renewDays)}
                onChange={(v) => setRenewDays(parseInt(v))}
              />
            </div>
            <div>
              <Label className="text-[11px]">新到期日</Label>
              <Input
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">备注</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 text-[12px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            确认续保
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 解除 Dialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function LiftPreservationDialog({
  open,
  onOpenChange,
  pres
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pres: PreservationRow;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        await liftPreservation({ id: pres.id, note: note.trim() });
        toast.success("已解除保全");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>解除保全 · {pres.respondent}</DialogTitle>
          <DialogDescription className="text-xs">
            状态将变更为「已解除」，记录保留作审计
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label className="text-[11px]">解除说明</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="如：双方调解结案，主动解除冻结"
            className="mt-1 text-[12px]"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            确认解除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
