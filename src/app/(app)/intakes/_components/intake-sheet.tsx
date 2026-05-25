"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Paperclip,
  FileText,
  X,
  CalendarDays,
  ScanLine
} from "lucide-react";
import type {
  MatterCategory,
  ProcedureType,
  LitigationStanding,
  FeeType,
  ClientType,
  UserRole
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioChips } from "@/components/ui/radio-chips";
import {
  matterCategoryLabel,
  matterCategoryColor,
  procedureTypeLabel,
  litigationStandingLabel,
  feeTypeLabel,
  clientTypeLabel,
  procedureToStandingOptions,
  userRoleLabel
} from "@/lib/enums";
import {
  proceduresByCategory,
  suggestHandlingAgency
} from "@/lib/procedures-by-category";
import { intakeCreateSchema, type IntakeCreateInput } from "@/server/intakes/schemas";
import { createIntake } from "@/server/intakes/actions";
import { uploadDocument } from "@/server/documents/actions";
import { parsePleading } from "@/server/ai/parse-pleading";
import { cn } from "@/lib/utils";
import { CauseCombobox } from "@/app/(app)/matters/_components/cause-combobox";
import type { ClientOption } from "@/app/(app)/matters/_components/matters-view";
import { ClientCombobox } from "./client-combobox";

const CATEGORIES: MatterCategory[] = [
  "CIVIL_COMMERCIAL",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
];

const CLIENT_TYPES: ClientType[] = ["INDIVIDUAL", "COMPANY", "ORGANIZATION"];

const FEE_TYPES: FeeType[] = ["FIXED", "CONTINGENCY"];

// 我方为被动方时，可上传起诉状/申请书 OCR 识别对方
const RECEIVING_STANDINGS = new Set<LitigationStanding>([
  "DEFENDANT",
  "THIRD_PARTY",
  "COUNTERCLAIM_DEFENDANT",
  "APPELLEE",
  "RETRIAL_RESPONDENT",
  "EXECUTED_PERSON",
  "ARBITRATION_RESPONDENT",
  "ADMIN_DEFENDANT",
  "ADMIN_RECONSIDERATION_RESPONDENT",
  "CRIMINAL_DEFENDANT"
]);

const defaults: IntakeCreateInput = {
  title: "",
  category: "CIVIL_COMMERCIAL",
  causeId: "",
  causeFreeText: "",
  description: "",
  receivedAt: new Date(),
  firstProcedureType: undefined,
  firstAgency: "",
  ourStanding: undefined,
  claimAmount: undefined,
  claimDescription: "",
  clientId: "",
  clientName: "",
  clientType: "INDIVIDUAL",
  contactName: "",
  contactPhone: "",
  feeType: undefined,
  feeAmount: undefined,
  contingencyTerms: "",
  feeSchedule: "",
  feeNote: "",
  ownerUserId: "",
  coUserIds: [],
  parties: []
};

type Colleague = { id: string; name: string; role: UserRole };

export function IntakeSheet({
  open,
  onOpenChange,
  clientOptions,
  colleagues
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientOptions: ClientOption[];
  colleagues: Colleague[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [contracts, setContracts] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pleadingRef = useRef<HTMLInputElement>(null);
  const [ocrPending, setOcrPending] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<IntakeCreateInput>({
    resolver: zodResolver(intakeCreateSchema),
    defaultValues: { ...defaults, ownerUserId: session?.user?.id ?? "" }
  });

  const { fields: parties, append: appendParty, remove: removeParty } = useFieldArray({
    control,
    name: "parties"
  });

  const category = watch("category");
  const firstProcedureType = watch("firstProcedureType");
  const clientId = watch("clientId") ?? "";
  const clientName = watch("clientName") ?? "";
  const clientType = watch("clientType");
  const feeType = watch("feeType");
  const ownerUserId = watch("ownerUserId");
  const coUserIds = watch("coUserIds");
  const receivedAt = watch("receivedAt");

  // 当前类别下可选程序
  const procedureOptions: ProcedureType[] = useMemo(
    () => proceduresByCategory[category] ?? [],
    [category]
  );

  // 当前程序下可选诉讼地位
  const ourStandingOptions: LitigationStanding[] = useMemo(
    () => procedureToStandingOptions(firstProcedureType, "ours"),
    [firstProcedureType]
  );
  const oppositeStandingOptions: LitigationStanding[] = useMemo(
    () => procedureToStandingOptions(firstProcedureType, "opposite"),
    [firstProcedureType]
  );

  // 切类别时如果当前程序不在新类别列表里，清掉
  useEffect(() => {
    if (firstProcedureType && !procedureOptions.includes(firstProcedureType)) {
      setValue("firstProcedureType", undefined);
      setValue("ourStanding", undefined);
    }
  }, [category, firstProcedureType, procedureOptions, setValue]);

  // 设默认 owner
  useEffect(() => {
    if (!ownerUserId && session?.user?.id) {
      setValue("ownerUserId", session.user.id);
    }
  }, [ownerUserId, session, setValue]);

  // 切程序时自动填充建议机构（仅在为空时）
  function handleProcedureChange(p: ProcedureType) {
    setValue("firstProcedureType", p, { shouldDirty: true });
    setValue("ourStanding", undefined);
    const currentAgency = watch("firstAgency");
    if (!currentAgency || currentAgency.length === 0) {
      setValue("firstAgency", suggestHandlingAgency(p));
    }
  }

  async function performSubmit(values: IntakeCreateInput) {
    try {
      const res = await createIntake(values);
      if (contracts.length > 0 && res.id) {
        for (const file of contracts) {
          const fd = new FormData();
          fd.set("intakeId", res.id);
          fd.set("name", file.name);
          fd.set("category", "CONTRACT");
          fd.set("encrypted", "true");
          fd.set("file", file);
          await uploadDocument(fd);
        }
      }
      toast.success(
        contracts.length > 0
          ? `收案已提交审批，上传 ${contracts.length} 份合同`
          : "收案已提交审批"
      );
      reset({ ...defaults, ownerUserId: session?.user?.id ?? "" });
      setContracts([]);
      onOpenChange(false);
      if (res.id) router.push(`/intakes/${res.id}`);
    } catch (err) {
      toast.error("创建失败", {
        description: err instanceof Error ? err.message : ""
      });
    }
  }

  function onSubmit(values: IntakeCreateInput) {
    startTransition(() => performSubmit(values));
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.size <= 20 * 1024 * 1024);
    if (arr.length < list.length) toast.warning("跳过了超过 20MB 的文件");
    setContracts((prev) => [...prev, ...arr]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handlePleadingFile(file: File) {
    setOcrPending(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await parsePleading(fd);
      let added = 0;
      for (const p of res.plaintiffs) {
        appendParty({
          role: "OPPOSING_PARTY",
          standing: undefined,
          ordinal: parties.filter((x) => x.role === "OPPOSING_PARTY").length + 1 + added,
          name: p.name ?? "",
          idNumber: p.idNumber ?? "",
          phone: p.phone ?? "",
          address: p.address ?? "",
          legalRep: p.legalRep ?? "",
          notes: ""
        });
        added++;
      }
      let thirdAdded = 0;
      for (const tp of res.thirdParties) {
        appendParty({
          role: "THIRD_PARTY",
          standing: undefined,
          ordinal: parties.filter((x) => x.role === "THIRD_PARTY").length + 1 + thirdAdded,
          name: tp.name ?? "",
          idNumber: tp.idNumber ?? "",
          phone: tp.phone ?? "",
          address: tp.address ?? "",
          legalRep: tp.legalRep ?? "",
          notes: ""
        });
        thirdAdded++;
      }
      if (res.cause && !watch("causeFreeText")) {
        setValue("causeFreeText", res.cause, { shouldDirty: true });
      }
      if (typeof res.claimAmount === "number" && !watch("claimAmount")) {
        setValue("claimAmount", res.claimAmount, { shouldDirty: true });
      }
      if (res.claimDescription && !watch("claimDescription")) {
        setValue("claimDescription", res.claimDescription, { shouldDirty: true });
      }
      if (res.court && !watch("firstAgency")) {
        setValue("firstAgency", res.court, { shouldDirty: true });
      }
      toast.success(
        `已识别 ${res.plaintiffs.length} 个起诉方 / ${res.thirdParties.length} 个第三人`,
        { description: "请人工核对字段是否准确" }
      );
    } catch (err) {
      toast.error("识别失败", {
        description: err instanceof Error ? err.message : ""
      });
    } finally {
      setOcrPending(false);
      if (pleadingRef.current) pleadingRef.current.value = "";
    }
  }

  function toggleCo(uid: string) {
    const next = coUserIds.includes(uid)
      ? coUserIds.filter((id) => id !== uid)
      : [...coUserIds, uid];
    setValue("coUserIds", next, { shouldDirty: true });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle>新建收案</DialogTitle>
          <DialogDescription className="text-xs">
            提交后进入&ldquo;待审批&rdquo;，由管理员/主任律师确认后转为正式案件
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {/* 1. 案件类别 */}
            <Section title="① 案件类别" required>
              <RadioChips
                items={CATEGORIES.map((c) => ({
                  value: c,
                  label: matterCategoryLabel[c],
                  accent: matterCategoryColor[c]
                }))}
                value={category}
                onChange={(c) => setValue("category", c)}
              />
            </Section>

            {/* 2. 程序 + 我方诉讼地位 + 机构 */}
            <Section title="② 程序与诉讼地位" required>
              <div className="grid grid-cols-2 gap-3">
                <Field label="代理程序" required error={errors.firstProcedureType?.message}>
                  <Select
                    value={firstProcedureType ?? ""}
                    onValueChange={(v) => handleProcedureChange(v as ProcedureType)}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="选择代理程序" />
                    </SelectTrigger>
                    <SelectContent>
                      {procedureOptions.map((p) => (
                        <SelectItem key={p} value={p}>
                          {procedureTypeLabel[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="我方诉讼地位" required error={errors.ourStanding?.message}>
                  <Select
                    value={watch("ourStanding") ?? ""}
                    onValueChange={(v) =>
                      setValue("ourStanding", v as LitigationStanding, { shouldDirty: true })
                    }
                    disabled={!firstProcedureType}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue
                        placeholder={firstProcedureType ? "选择我方地位" : "请先选程序"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ourStandingOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {litigationStandingLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="争议解决机构 / 办理机关">
                <Input
                  placeholder="如：上海市浦东新区人民法院 / 上海仲裁委员会"
                  {...register("firstAgency")}
                />
              </Field>
            </Section>

            {/* 3. 委托方 + 联系人 */}
            <Section title="③ 委托方与联系人" required>
              <div className="grid grid-cols-3 gap-3">
                <Field label="性质" required>
                  <Select
                    value={clientType ?? "INDIVIDUAL"}
                    onValueChange={(v) =>
                      setValue("clientType", v as ClientType, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {clientTypeLabel[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="委托方" required className="col-span-2">
                  <ClientCombobox
                    clientId={clientId}
                    clientName={clientName}
                    options={clientOptions}
                    onPickExisting={(id, name) => {
                      setValue("clientId", id, { shouldDirty: true });
                      setValue("clientName", name, { shouldDirty: true });
                    }}
                    onTypeNew={(name) => {
                      setValue("clientId", "", { shouldDirty: true });
                      setValue("clientName", name, { shouldDirty: true });
                    }}
                    onClear={() => {
                      setValue("clientId", "", { shouldDirty: true });
                      setValue("clientName", "", { shouldDirty: true });
                    }}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="联系人姓名">
                  <Input placeholder="如：王经理" {...register("contactName")} />
                </Field>
                <Field label="联系电话">
                  <Input placeholder="如：13800138000" {...register("contactPhone")} />
                </Field>
              </div>
            </Section>

            {/* 4. 案由 + 标的 + 收案时间 */}
            <Section title="④ 案由与标的">
              <Field label="案由">
                <CauseCombobox
                  category={category}
                  value={watch("causeId") || ""}
                  onChange={(id) => setValue("causeId", id, { shouldDirty: true })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="标的额（元）">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    className="font-mono"
                    {...register("claimAmount", { valueAsNumber: true })}
                  />
                </Field>
                <Field label="收案时间">
                  <div className="relative">
                    <Input
                      type="date"
                      value={
                        receivedAt
                          ? new Date(receivedAt).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setValue("receivedAt", new Date(e.target.value), {
                          shouldDirty: true
                        })
                      }
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </Field>
              </div>

              <Field label="标的描述（非金钱标的或其他诉求）">
                <Input
                  placeholder="如：请求确认合同有效 / 请求停止侵害"
                  {...register("claimDescription")}
                />
              </Field>
            </Section>

            {/* 5. 律师费 */}
            <Section title="⑤ 律师费">
              <div className="grid grid-cols-2 gap-2">
                {FEE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue("feeType", t, { shouldDirty: true })}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm transition-colors",
                      feeType === t
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-input"
                    )}
                  >
                    {feeTypeLabel[t]}
                  </button>
                ))}
              </div>

              {feeType === "FIXED" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="总金额（元）" required>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0.00"
                      className="font-mono"
                      {...register("feeAmount", { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="付款节点 / 分期约定">
                    <Input
                      placeholder="如：签约付 50%，开庭前付 30%，结案付 20%"
                      {...register("feeSchedule")}
                    />
                  </Field>
                </div>
              )}

              {feeType === "CONTINGENCY" && (
                <>
                  <Field label="基础办案费（元）" required>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0.00"
                      className="font-mono"
                      {...register("feeAmount", { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="风险代理收费方式" required hint="例：判决/调解执行到位后按到账金额 15% 收取；或：以胜诉金额阶梯计提：≤100 万部分 10%，>100 万部分 8%">
                    <Textarea
                      rows={3}
                      placeholder="详细描述风险代理收费方式 / 触发条件 / 计提比例"
                      {...register("contingencyTerms")}
                    />
                  </Field>
                  <Field label="付款节点">
                    <Input
                      placeholder="如：基础办案费签约付清；风险费执行到账后 7 日内支付"
                      {...register("feeSchedule")}
                    />
                  </Field>
                </>
              )}

              {feeType && (
                <Field label="费用备注（可选）">
                  <Input placeholder="如：含差旅 / 含诉讼费垫付" {...register("feeNote")} />
                </Field>
              )}
            </Section>

            {/* 6. 团队 */}
            <Section title="⑥ 经办律师 + 共同律师" required>
              <Field label="主办律师" required>
                <Select
                  value={ownerUserId ?? ""}
                  onValueChange={(v) =>
                    setValue("ownerUserId", v, { shouldDirty: true })
                  }
                >
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="选择主办律师" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} · {userRoleLabel[u.role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="共同参与律师（可多选，事后可改）">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3">
                  {colleagues
                    .filter((u) => u.id !== ownerUserId)
                    .map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-popover"
                      >
                        <Checkbox
                          checked={coUserIds.includes(u.id)}
                          onCheckedChange={() => toggleCo(u.id)}
                        />
                        <span>{u.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {userRoleLabel[u.role]}
                        </span>
                      </label>
                    ))}
                </div>
              </Field>
            </Section>

            {/* 7. 其他案件当事人 */}
            <Section title="⑦ 其他案件当事人">
              {watch("ourStanding") && RECEIVING_STANDINGS.has(watch("ourStanding")!) && (
                <div className="mb-2 rounded-md border border-dashed border-primary/40 bg-primary/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">
                        <ScanLine className="mr-1 inline h-3 w-3 text-primary" />
                        识别起诉状 / 申请书
                      </div>
                      <p className="mt-0.5">
                        我方为被动方，可上传对方起诉状 / 申请书（JPG / PNG / WebP / PDF，≤ 20MB），AI 自动抽取对方主体与诉求
                      </p>
                    </div>
                    <input
                      ref={pleadingRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePleadingFile(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => pleadingRef.current?.click()}
                      disabled={ocrPending}
                      className="h-7 shrink-0 gap-1"
                    >
                      {ocrPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ScanLine className="h-3 w-3" />
                      )}
                      上传识别
                    </Button>
                  </div>
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                {/* 一键添加：先选诉讼地位 → 自动决定 role 并新建一行 */}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    if (v === "THIRD_PARTY") {
                      appendParty({
                        role: "THIRD_PARTY",
                        standing: undefined,
                        ordinal: parties.filter((p) => p.role === "THIRD_PARTY").length + 1,
                        name: "",
                        idNumber: "",
                        phone: "",
                        address: "",
                        legalRep: "",
                        notes: ""
                      });
                    } else {
                      appendParty({
                        role: "OPPOSING_PARTY",
                        standing: v as LitigationStanding,
                        ordinal: parties.filter((p) => p.role === "OPPOSING_PARTY").length + 1,
                        name: "",
                        idNumber: "",
                        phone: "",
                        address: "",
                        legalRep: "",
                        notes: ""
                      });
                    }
                  }}
                  disabled={!firstProcedureType}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue
                      placeholder={firstProcedureType ? "+ 添加当事人（选诉讼地位）" : "请先选代理程序"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {oppositeStandingOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        对方 · {litigationStandingLabel[s]}
                      </SelectItem>
                    ))}
                    <SelectItem value="THIRD_PARTY">第三人</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {parties.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background py-3 text-center text-xs text-muted-foreground">
                  暂无其他当事人，添加后可触发利益冲突检索
                </p>
              ) : (
                <div className="space-y-2">
                  {parties.map((p, idx) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {p.role === "OPPOSING_PARTY" ? "对方" : "第三人"} {p.ordinal}
                          </span>
                          <Select
                            value={watch(`parties.${idx}.standing`) ?? ""}
                            onValueChange={(v) =>
                              setValue(
                                `parties.${idx}.standing`,
                                v as LitigationStanding,
                                { shouldDirty: true }
                              )
                            }
                            disabled={!firstProcedureType}
                          >
                            <SelectTrigger className="h-7 w-32 bg-background text-xs">
                              <SelectValue placeholder="诉讼地位" />
                            </SelectTrigger>
                            <SelectContent>
                              {oppositeStandingOptions.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {litigationStandingLabel[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeParty(idx)}
                          className="h-6 w-6 p-0 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="姓名 / 名称"
                          {...register(`parties.${idx}.name`)}
                        />
                        <Input
                          placeholder="身份证 / 信用代码"
                          className="font-mono"
                          {...register(`parties.${idx}.idNumber`)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 8. 描述 + 标题 */}
            <Section title="⑧ 标题与描述">
              <Field
                label="案件标题"
                hint="留空则按「{委托方} 与 {对方} {案由}」自动生成"
                error={errors.title?.message}
              >
                <Input
                  placeholder="可留空 · 例：某建设工程合同纠纷"
                  {...register("title")}
                />
              </Field>

              <Field label="描述">
                <Textarea
                  rows={3}
                  placeholder="简述案情、客户诉求、争议焦点等"
                  {...register("description")}
                />
              </Field>
            </Section>

            {/* 9. 合同 */}
            <Section title="⑨ 委托合同 / 相关附件">
              <div className="mb-2 flex items-center justify-end">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="h-7 gap-1"
                >
                  <Paperclip className="h-3 w-3" />
                  添加文件
                </Button>
              </div>
              {contracts.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-background py-3 text-center text-xs text-muted-foreground">
                  上传委托代理合同、授权委托书等（加密存储，单文件 ≤ 20MB）
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {contracts.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setContracts((c) => c.filter((_, j) => j !== i))}
                        className="h-5 w-5 p-0 text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              提交审批
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  required,
  children
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // 把"① 案件类别"形式拆成 罗马数字 + 标题
  const match = title.match(/^([①-⑨])\s+(.+)$/);
  const map: Record<string, string> = {
    "①": "I",
    "②": "II",
    "③": "III",
    "④": "IV",
    "⑤": "V",
    "⑥": "VI",
    "⑦": "VII",
    "⑧": "VIII",
    "⑨": "IX"
  };
  const roman = match ? map[match[1]] : null;
  const text = match ? match[2] : title;

  return (
    <section
      className="space-y-2.5 rounded-lg border bg-card p-3.5"
    >
      <h3 className="flex items-baseline gap-2.5">
        {roman && (
          <span className="text-[0.7rem] text-primary">{roman}</span>
        )}
        <span className="text-[0.9rem] font-medium tracking-tight">
          {text}
          {required && <span className="ml-1 text-destructive">*</span>}
        </span>
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  className,
  children
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-center gap-1 text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
