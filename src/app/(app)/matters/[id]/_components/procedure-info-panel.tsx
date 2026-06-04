"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import type { ProcedureType, LitigationStanding } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { litigationStandingLabel, procedureToStandingOptions, procedureTypeLabel } from "@/lib/enums";
import { formatDate } from "@/lib/utils";
import { updateProcedureInfo } from "@/server/matters/actions";
import { InfoRow, Pair } from "./info-panel";
import { JurisdictionSelect } from "@/app/(app)/intakes/_components/jurisdiction-select";
import { agencyOptions } from "@/lib/china-regions";

// v0.45: 程序类型到「XX信息」的映射（覆盖所有程序类型）
const PROC_INFO_LABEL: Record<string, string> = {
  FIRST_INSTANCE: "一审信息",
  SECOND_INSTANCE: "二审信息",
  RETRIAL_REVIEW: "再审审查信息",
  RETRIAL: "再审信息",
  REMAND_FIRST: "重审一审信息",
  REMAND_SECOND: "重审二审信息",
  PROSECUTORIAL_SUPERVISION: "检察监督信息",
  COMMERCIAL_ARBITRATION: "商事仲裁信息",
  LABOR_ARBITRATION: "劳动仲裁信息",
  ARBITRATION_SET_ASIDE: "撤销仲裁裁决信息",
  ARBITRATION_ENFORCEMENT_REVIEW: "不予执行仲裁审查信息",
  ENFORCEMENT: "强制执行信息",
  ENFORCEMENT_OBJECTION: "执行异议信息",
  INVESTIGATION: "侦查信息",
  PROSECUTION_REVIEW: "审查起诉信息",
  DEATH_PENALTY_REVIEW: "死刑复核信息",
  CRIMINAL_ENFORCEMENT: "刑罚执行信息",
  COMMUTATION_PAROLE_REVIEW: "减刑假释审查信息",
  ADMIN_RECONSIDERATION: "行政复议信息",
  ADMIN_NON_LITIGATION_ENFORCEMENT: "非诉行政执行信息",
  NON_LITIGATION_PHASE: "非诉阶段信息",
  CUSTOM: "程序信息"
};

type Proc = {
  id: string;
  type: ProcedureType;
  caseNumber: string | null;
  handlingAgency: string | null;
  jurisdiction: string | null;
  presidingJudge: string | null;
  presidingJudgeContact: string | null;
  judgeAssistant: string | null;
  judgeAssistantContact: string | null;
  ourStanding: LitigationStanding | null;
  acceptedAt: Date | null;
  concludedAt: Date | null;
};

// 按程序类型确定「主审法官 / 法官助理」的称谓
const ARBITRATION: ProcedureType[] = [
  "COMMERCIAL_ARBITRATION",
  "LABOR_ARBITRATION",
  "ARBITRATION_SET_ASIDE",
  "ARBITRATION_ENFORCEMENT_REVIEW"
];
const EXECUTION: ProcedureType[] = [
  "ENFORCEMENT",
  "ENFORCEMENT_OBJECTION",
  "ADMIN_NON_LITIGATION_ENFORCEMENT",
  "CRIMINAL_ENFORCEMENT"
];

function roleLabels(type: ProcedureType): { judge: string; assistant: string } {
  if (ARBITRATION.includes(type)) return { judge: "首席仲裁员", assistant: "仲裁庭助理" };
  if (EXECUTION.includes(type)) return { judge: "执行法官", assistant: "执行法官助理" };
  return { judge: "主审法官", assistant: "法官助理" };
}

const dash = (v: string | null | undefined) => v?.trim() || "—";
const toInput = (d: Date | null) => (d ? new Date(d).toISOString().split("T")[0] : "");

export function ProcedureInfoPanel({ procedure: p, editOpen, onEditOpenChange }: { procedure: Proc; editOpen?: boolean; onEditOpenChange?: (o: boolean) => void }) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = editOpen ?? internalOpen;
  const setOpen = onEditOpenChange ?? setInternalOpen;
  const { judge, assistant } = roleLabels(p.type);
  const standingOptions = procedureToStandingOptions(p.type, "ours");
  // v0.45: 动态标题，如"一审信息"、"二审信息"
  const infoTitle = PROC_INFO_LABEL[p.type] ?? "程序信息";

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="overflow-hidden rounded-lg">
        <InfoRow>
          <Pair label="管辖地">{dash(p.jurisdiction)}</Pair>
          <Pair label="管辖机构">{dash(p.handlingAgency)}</Pair>
          <Pair label="案号">
            <span className="font-mono tabular">{dash(p.caseNumber)}</span>
          </Pair>
          <Pair label="我方地位">
            {p.ourStanding ? litigationStandingLabel[p.ourStanding] : "—"}
          </Pair>
        </InfoRow>
        <InfoRow>
          <Pair label={judge}>{dash(p.presidingJudge)}</Pair>
          <Pair label="联系方式">
            <span className="font-mono tabular">{dash(p.presidingJudgeContact)}</span>
          </Pair>
          <Pair label={assistant}>{dash(p.judgeAssistant)}</Pair>
          <Pair label="联系方式">
            <span className="font-mono tabular">{dash(p.judgeAssistantContact)}</span>
          </Pair>
        </InfoRow>
        <InfoRow>
          <Pair label="立案时间">{p.acceptedAt ? formatDate(p.acceptedAt) : "—"}</Pair>
          <Pair label="裁决时间">{p.concludedAt ? formatDate(p.concludedAt) : "—"}</Pair>
          {/* 占位：补满后两列，与上方各行 4 列对齐 */}
          <div className="hidden bg-card md:block md:flex-[2]" />
        </InfoRow>
      </div>

      <EditDialog
        open={open}
        onOpenChange={setOpen}
        proc={p}
        judge={judge}
        assistant={assistant}
        standingOptions={standingOptions}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </section>
  );
}

function EditDialog({
  open,
  onOpenChange,
  proc,
  judge,
  assistant,
  standingOptions,
  onSaved
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proc: Proc;
  judge: string;
  assistant: string;
  standingOptions: LitigationStanding[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    jurisdiction: proc.jurisdiction ?? "",
    handlingAgency: proc.handlingAgency ?? "",
    caseNumber: proc.caseNumber ?? "",
    presidingJudge: proc.presidingJudge ?? "",
    presidingJudgeContact: proc.presidingJudgeContact ?? "",
    judgeAssistant: proc.judgeAssistant ?? "",
    judgeAssistantContact: proc.judgeAssistantContact ?? "",
    ourStanding: (proc.ourStanding ?? "") as string,
    acceptedAt: toInput(proc.acceptedAt),
    concludedAt: toInput(proc.concludedAt)
  }));
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    startTransition(async () => {
      try {
        await updateProcedureInfo({
          procedureId: proc.id,
          ...form,
          ourStanding: form.ourStanding || null,
          acceptedAt: form.acceptedAt || null,
          concludedAt: form.concludedAt || null
        });
        toast.success("已保存");
        onSaved();
      } catch (err) {
        toast.error("保存失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑{PROC_INFO_LABEL[proc.type] ?? "程序"}信息</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldRow label="管辖地（省/市/区县）">
            <JurisdictionSelect
              value={form.jurisdiction}
              onChange={(v) => set("jurisdiction", v)}
            />
          </FieldRow>
          <FieldRow label="管辖机构">
            <Input
              list={`proc-agency-${proc.id}`}
              value={form.handlingAgency}
              onChange={(e) => set("handlingAgency", e.target.value)}
              placeholder="如：广州市天河区人民法院"
            />
            <datalist id={`proc-agency-${proc.id}`}>
              {agencyOptions(form.jurisdiction).map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </FieldRow>
          <FieldRow label="案号">
            <Input value={form.caseNumber} onChange={(e) => set("caseNumber", e.target.value)} className="font-mono" />
          </FieldRow>
          <FieldRow label="我方地位">
            <Select value={form.ourStanding} onValueChange={(v) => set("ourStanding", v)}>
              <SelectTrigger className="h-9 bg-background">
                <SelectValue placeholder="选择我方地位" />
              </SelectTrigger>
              <SelectContent>
                {standingOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {litigationStandingLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label={judge}>
            <Input value={form.presidingJudge} onChange={(e) => set("presidingJudge", e.target.value)} />
          </FieldRow>
          <FieldRow label={`${judge}联系方式`}>
            <Input value={form.presidingJudgeContact} onChange={(e) => set("presidingJudgeContact", e.target.value)} className="font-mono" />
          </FieldRow>
          <FieldRow label={assistant}>
            <Input value={form.judgeAssistant} onChange={(e) => set("judgeAssistant", e.target.value)} />
          </FieldRow>
          <FieldRow label={`${assistant}联系方式`}>
            <Input value={form.judgeAssistantContact} onChange={(e) => set("judgeAssistantContact", e.target.value)} className="font-mono" />
          </FieldRow>
          <FieldRow label="立案时间">
            <Input type="date" value={form.acceptedAt} onChange={(e) => set("acceptedAt", e.target.value)} />
          </FieldRow>
          <FieldRow label="裁决 / 结案时间">
            <Input type="date" value={form.concludedAt} onChange={(e) => set("concludedAt", e.target.value)} />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
