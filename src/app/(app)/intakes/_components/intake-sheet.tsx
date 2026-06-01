"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
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
  ScanLine,
  ChevronDown
} from "lucide-react";
import type {
  MatterCategory,
  ProcedureType,
  LitigationStanding,
  FeeType,
  PartyRole,
  UserRole,
  BarFilingType
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  matterCategoryLabel,
  procedureTypeLabel,
  litigationStandingLabel,
  feeTypeLabel,
  procedureToStandingOptions,
  userRoleLabel,
  barFilingLabel,
  BAR_FILING_OPTIONS,
  matterCategoryKind,
  PROJECT_BUSINESS_TYPES,
  COUNSEL_TYPES,
  type CategoryKind
} from "@/lib/enums";
import { agencyOptions } from "@/lib/china-regions";
import {
  proceduresByCategory,
  suggestHandlingAgency
} from "@/lib/procedures-by-category";
import { intakeCreateSchema, type IntakeCreateInput } from "@/server/intakes/schemas";
import { createIntake } from "@/server/intakes/actions";
import { uploadDocument } from "@/server/documents/actions";
import { parsePleading } from "@/server/ai/parse-pleading";
import {
  PartyCard,
  PARTY_GRID,
  PARTY_GRID_NO_STANDING
} from "@/app/(app)/matters/_components/party-card";
import {
  recommendCause,
  type CauseRecommendation
} from "@/server/ai/recommend-cause";
import { getEnterpriseDetail, type EnterpriseSearchItem } from "@/server/yuandian/enterprise";
import { cn } from "@/lib/utils";
import { CauseCombobox } from "@/app/(app)/matters/_components/cause-combobox";
import { CauseAiManualDialog } from "@/app/(app)/matters/_components/cause-ai-manual-dialog";
import type { ClientOption } from "@/app/(app)/matters/_components/matters-view";
import { ClientCombobox } from "./client-combobox";
import { CauseRecommendationDialog } from "./cause-recommendation-dialog";
import { JurisdictionSelect } from "./jurisdiction-select";

const CATEGORIES: MatterCategory[] = [
  "CIVIL_COMMERCIAL",
  "LABOR_ARBITRATION",
  "COMMERCIAL_ARBITRATION",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
];

const FEE_TYPES: FeeType[] = ["FIXED", "CONTINGENCY", "TIMED"];

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
  jurisdiction: "",
  ourStanding: undefined,
  claimAmount: undefined,
  claimDescription: "",
  barFiling: undefined,
  counterclaim: false,
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
  parties: [
    {
      role: "CLIENT_PARTY",
      standing: undefined,
      ordinal: 1,
      partyType: "NATURAL_PERSON",
      name: "",
      idNumber: "",
      enterpriseSocialCode: "",
      enterpriseName: "",
      phone: "",
      address: "",
      legalRep: "",
      contactName: "",
      notes: ""
    },
    {
      role: "OPPOSING_PARTY",
      standing: undefined,
      ordinal: 1,
      partyType: "NATURAL_PERSON",
      name: "",
      idNumber: "",
      enterpriseSocialCode: "",
      enterpriseName: "",
      phone: "",
      address: "",
      legalRep: "",
      contactName: "",
      notes: ""
    }
  ]
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
  const [aiRecOpen, setAiRecOpen] = useState(false);
  const [aiRecLoading, setAiRecLoading] = useState(false);
  const [aiRecCandidates, setAiRecCandidates] = useState<CauseRecommendation[]>([]);
  const [aiRecError, setAiRecError] = useState<string | null>(null);
  const [aiRecSituation, setAiRecSituation] = useState<{
    category: MatterCategory;
    text: string;
  } | null>(null);
  const [aiManualOpen, setAiManualOpen] = useState(false);

  const methods = useForm<IntakeCreateInput>({
    resolver: zodResolver(intakeCreateSchema),
    defaultValues: { ...defaults, ownerUserId: session?.user?.id ?? "" }
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = methods;

  const { fields: parties, append: appendParty, remove: removeParty } = useFieldArray({
    control,
    name: "parties"
  });

  const category = watch("category");
  const firstProcedureType = watch("firstProcedureType");
  const clientId = watch("clientId") ?? "";
  const feeType = watch("feeType");
  const ownerUserId = watch("ownerUserId");
  const coUserIds = watch("coUserIds");
  const receivedAt = watch("receivedAt");
  const jurisdiction = watch("jurisdiction") ?? "";
  // 争议解决机构按管辖地匹配
  const agencyOpts = useMemo(() => agencyOptions(jurisdiction), [jurisdiction]);

  // v0.31: 案件类别决定表单结构（诉讼/仲裁 vs 非诉/专项 vs 顾问）
  const kind: CategoryKind = matterCategoryKind(category);
  const nameLabel =
    kind === "counsel" ? "顾问事项名称" : kind === "project" ? "项目名称" : "案件名称";

  // 标题自动生成：填完当事人 + 案由后按「委托方 与 对方 案由」生成，用户手改后不再覆盖
  const [titleTouched, setTitleTouched] = useState(false);
  const [causeName, setCauseName] = useState("");
  const watchedParties = watch("parties");
  const watchedTitle = watch("title");
  const watchedCauseFree = watch("causeFreeText");
  useEffect(() => {
    if (titleTouched) return;
    const list = (watchedParties ?? []) as { role?: string; name?: string }[];
    const clientNm = list.find((p) => p.role === "CLIENT_PARTY")?.name?.trim();
    const oppNm = list.find((p) => p.role === "OPPOSING_PARTY")?.name?.trim();
    const causeNm = (causeName || watchedCauseFree || "").trim();
    if (!clientNm && !oppNm) return;
    // 案件名称不含空格（产品要求）
    const suggested = `${clientNm ?? ""}${oppNm ? `与${oppNm}` : ""}${causeNm}`.replace(/\s+/g, "");
    if (suggested && suggested !== (watchedTitle ?? "")) {
      setValue("title", suggested, { shouldDirty: true });
    }
  }, [watchedParties, causeName, watchedCauseFree, titleTouched, watchedTitle, setValue]);

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
  // 相对方 / 第三人 诉讼地位也随当前程序联动
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

  // v0.31: 切类别时同步当事人行
  // 顾问 / 非诉 / 专项：默认只留委托方一行（相对方按需添加）
  // 诉讼/仲裁：确保至少有一个相对方行
  useEffect(() => {
    const cur = (watch("parties") ?? []) as { role?: string }[];
    if (kind === "counsel" || kind === "project") {
      for (let i = cur.length - 1; i >= 1; i--) removeParty(i);
    } else if (!cur.some((x) => x.role === "OPPOSING_PARTY")) {
      appendParty({
        role: "OPPOSING_PARTY",
        standing: undefined,
        ordinal: cur.length + 1,
        partyType: "NATURAL_PERSON",
        name: "",
        idNumber: "",
        enterpriseSocialCode: "",
        enterpriseName: "",
        phone: "",
        address: "",
        legalRep: "",
        contactName: "",
        notes: ""
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

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
      setTitleTouched(false);
      setCauseName("");
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
    // 委托方恒为 parties[0]（role=CLIENT_PARTY）：拆回顶层 client* 字段，其余进 parties。
    // 名称 + 证件号必填由 zodResolver(partyInputSchema) 对每行统一校验。
    const all = values.parties ?? [];
    const client = all.find((p) => p.role === "CLIENT_PARTY");
    if (!client || !client.name?.trim()) {
      toast.warning("请填写客户", { description: "客户名称为必填" });
      return;
    }
    const isOrg = client.partyType === "ORGANIZATION";
    const payload: IntakeCreateInput = {
      ...values,
      clientName: client.name.trim(),
      clientType: isOrg ? "COMPANY" : "INDIVIDUAL",
      clientIdNumber: (isOrg ? client.enterpriseSocialCode : client.idNumber) ?? "",
      clientAddress: client.address ?? "",
      clientLegalRep: client.legalRep ?? "",
      contactName: client.contactName ?? "",
      contactPhone: client.phone ?? "",
      parties: all.filter((p) => p.role !== "CLIENT_PARTY")
    };
    startTransition(() => performSubmit(payload));
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
        // OCR 时按 idNumber 长度/legalRep 是否存在猜主体类型：18 位含字母通常是社会信用代码 → 公司
        const guessed: "NATURAL_PERSON" | "ORGANIZATION" =
          (p.legalRep && p.legalRep.trim()) || (p.idNumber && p.idNumber.length === 18 && /[A-Z]/.test(p.idNumber))
            ? "ORGANIZATION"
            : "NATURAL_PERSON";
        appendParty({
          role: "OPPOSING_PARTY",
          standing: undefined,
          ordinal: parties.filter((x) => x.role === "OPPOSING_PARTY").length + 1 + added,
          partyType: guessed,
          name: p.name ?? "",
          idNumber: guessed === "NATURAL_PERSON" ? p.idNumber ?? "" : "",
          enterpriseSocialCode: guessed === "ORGANIZATION" ? p.idNumber ?? "" : "",
          enterpriseName: guessed === "ORGANIZATION" ? p.name ?? "" : "",
          phone: p.phone ?? "",
          address: p.address ?? "",
          legalRep: p.legalRep ?? "",
          contactName: "",
          notes: ""
        });
        added++;
      }
      let thirdAdded = 0;
      for (const tp of res.thirdParties) {
        const guessed: "NATURAL_PERSON" | "ORGANIZATION" =
          (tp.legalRep && tp.legalRep.trim()) || (tp.idNumber && tp.idNumber.length === 18 && /[A-Z]/.test(tp.idNumber))
            ? "ORGANIZATION"
            : "NATURAL_PERSON";
        appendParty({
          role: "THIRD_PARTY",
          standing: undefined,
          ordinal: parties.filter((x) => x.role === "THIRD_PARTY").length + 1 + thirdAdded,
          partyType: guessed,
          name: tp.name ?? "",
          idNumber: guessed === "NATURAL_PERSON" ? tp.idNumber ?? "" : "",
          enterpriseSocialCode: guessed === "ORGANIZATION" ? tp.idNumber ?? "" : "",
          enterpriseName: guessed === "ORGANIZATION" ? tp.name ?? "" : "",
          phone: tp.phone ?? "",
          address: tp.address ?? "",
          legalRep: tp.legalRep ?? "",
          contactName: "",
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

      // OCR 后联动 AI 案由推荐（仅当 OCR 抽到 cause / claimDescription 时触发）
      const situationParts: string[] = [];
      if (res.cause) situationParts.push(`OCR 识别案由：${res.cause}`);
      if (res.claimDescription) situationParts.push(`诉讼请求：${res.claimDescription}`);
      const oppPartyNames = res.plaintiffs.map((p) => p.name).filter(Boolean).join("、");
      if (oppPartyNames) situationParts.push(`对方当事人：${oppPartyNames}`);
      if (res.court) situationParts.push(`管辖：${res.court}`);
      const situationText = situationParts.join("\n");
      if (situationText && !watch("causeId")) {
        triggerCauseRecommendation(category, situationText);
      }
    } catch (err) {
      toast.error("识别失败", {
        description: err instanceof Error ? err.message : ""
      });
    } finally {
      setOcrPending(false);
      if (pleadingRef.current) pleadingRef.current.value = "";
    }
  }

  async function triggerCauseRecommendation(
    cat: MatterCategory,
    situation: string
  ) {
    setAiRecSituation({ category: cat, text: situation });
    setAiRecOpen(true);
    setAiRecLoading(true);
    setAiRecError(null);
    setAiRecCandidates([]);
    try {
      const list = await recommendCause({ category: cat, situation });
      setAiRecCandidates(list);
    } catch (err) {
      setAiRecError(err instanceof Error ? err.message : "AI 推荐失败");
    } finally {
      setAiRecLoading(false);
    }
  }

  function handleAiRecSelect(causeId: string, causeNm: string) {
    setValue("causeId", causeId, { shouldDirty: true });
    setCauseName(causeNm);
    setAiRecOpen(false);
    toast.success("已选用 AI 推荐案由", { description: causeNm });
  }

  function handleAiRecRetry() {
    if (aiRecSituation) {
      triggerCauseRecommendation(aiRecSituation.category, aiRecSituation.text);
    }
  }

  function toggleCo(uid: string) {
    const next = coUserIds.includes(uid)
      ? coUserIds.filter((id) => id !== uid)
      : [...coUserIds, uid];
    setValue("coUserIds", next, { shouldDirty: true });
  }

  async function handlePickYuandian(candidate: EnterpriseSearchItem) {
    // 委托方行恒为 parties[0]
    setValue("clientId", "", { shouldDirty: true });
    setValue("parties.0.partyType", "ORGANIZATION", { shouldDirty: true });
    setValue("parties.0.name", candidate.name, { shouldDirty: true });
    setValue("parties.0.enterpriseName", candidate.name, { shouldDirty: true });
    setValue("parties.0.enterpriseSocialCode", candidate.creditCode, {
      shouldDirty: true,
      shouldValidate: true
    });

    const tid = toast.loading("正在获取企业详细信息…", { duration: 10_000 });
    try {
      const res = await getEnterpriseDetail(candidate.id);
      if (res.info) {
        setValue("parties.0.address", res.info.address, { shouldDirty: true });
        setValue("parties.0.legalRep", res.info.legalRep, { shouldDirty: true });
        if (res.info.legalRep && !watch("parties.0.contactName")) {
          setValue("parties.0.contactName", res.info.legalRep, { shouldDirty: true });
        }
        toast.success(
          res.info.legalRep
            ? `已填充：法定代表人 ${res.info.legalRep}`
            : "已填充企业信息",
          { id: tid }
        );
      } else {
        toast.info("未查到详细信息，已填充基础信息", { id: tid });
      }
    } catch {
      toast.error("获取企业详情失败，请手动补充", { id: tid });
    }
  }

  // 主办 / 协办 / 律协备案 / 反诉 字段（多处复用）
  function leadField() {
    return (
      <Field label="主办律师" required>
        <Select
          value={ownerUserId ?? ""}
          onValueChange={(v) => setValue("ownerUserId", v, { shouldDirty: true })}
        >
          <SelectTrigger className="h-10 bg-background">
            <SelectValue placeholder="选择主办律师" />
          </SelectTrigger>
          <SelectContent>
            {colleagues.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  function coLeadField() {
    return (
      <Field label="协办人员（可多选）">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between rounded-sm bg-background font-normal"
            >
              <span className="truncate">
                {coUserIds.length === 0 ? (
                  <span className="text-muted-foreground">选择协办人员</span>
                ) : (
                  colleagues
                    .filter((u) => coUserIds.includes(u.id))
                    .map((u) => u.name)
                    .join("、")
                )}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5">
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {colleagues.filter((u) => u.id !== ownerUserId).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">暂无可选协办</p>
              ) : (
                colleagues
                  .filter((u) => u.id !== ownerUserId)
                  .map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
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
                  ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </Field>
    );
  }

  function barFilingField() {
    return (
      <Field label="是否需向律协备案">
        <Select
          value={watch("barFiling") ?? ""}
          onValueChange={(v) => setValue("barFiling", v as BarFilingType, { shouldDirty: true })}
        >
          <SelectTrigger className="h-10 bg-background">
            <SelectValue placeholder="选择" />
          </SelectTrigger>
          <SelectContent>
            {BAR_FILING_OPTIONS.map((b) => (
              <SelectItem key={b} value={b}>
                {barFilingLabel[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  function counterclaimField() {
    return (
      <Field label="是否反诉">
        <Select
          value={watch("counterclaim") ? "yes" : "no"}
          onValueChange={(v) => setValue("counterclaim", v === "yes", { shouldDirty: true })}
        >
          <SelectTrigger className="h-10 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">否</SelectItem>
            <SelectItem value="yes">是</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  // 当事人/相关方录入表格（按类别复用，诉讼/仲裁含诉讼地位列）
  function renderParties(mode: CategoryKind) {
    const showStanding = mode === "litigation";
    const grid = showStanding ? PARTY_GRID : PARTY_GRID_NO_STANDING;
    const clientLabel =
      mode === "counsel" ? "顾问单位" : mode === "project" ? "委托方" : "客户";
    const oppLabel = mode === "project" ? "交易相对方" : "相对方";
    return (
      <div className="overflow-x-auto rounded-lg border border-border bg-muted/25 p-2">
        <div className={cn("space-y-2", showStanding ? "min-w-[1040px]" : "min-w-[900px]")}>
          {/* 表头 */}
          <div
            className={cn(
              grid,
              "rounded-md bg-muted/70 px-2.5 py-2 text-[11px] font-medium text-muted-foreground"
            )}
          >
            <span>角色</span>
            <span>主体类型</span>
            <span>姓名 / 名称</span>
            <span>证件号 / 信用代码</span>
            <span>联系人</span>
            <span>联系电话</span>
            {showStanding && <span>诉讼地位</span>}
            <span className="text-right">操作</span>
          </div>

          {parties.map((p, idx) => {
            const all = (watch("parties") ?? []) as { role?: string }[];
            const role = (all[idx]?.role as PartyRole) ?? "OPPOSING_PARTY";
            const isClient = role === "CLIENT_PARTY";
            // 顾问类只显示委托方
            if (mode === "counsel" && !isClient) return null;
            const ourStanding = watch("ourStanding");
            return (
              <PartyCard
                key={p.id}
                index={idx}
                fieldPrefix="parties"
                showStanding={showStanding}
                removable={!isClient}
                onRemove={() => removeParty(idx)}
                errors={errors as never}
                roleSlot={
                  isClient ? (
                    <div className="flex h-9 w-full items-center justify-center rounded-sm border border-primary/30 bg-primary/10 text-xs font-medium text-primary">
                      {clientLabel}
                    </div>
                  ) : (
                    <Select
                      value={role}
                      onValueChange={(v) =>
                        setValue(`parties.${idx}.role`, v as PartyRole, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger className="h-9 w-full bg-background px-2.5 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPPOSING_PARTY" className="text-xs">
                          {oppLabel}
                        </SelectItem>
                        <SelectItem value="THIRD_PARTY" className="text-xs">
                          {mode === "project" ? "其他相关方" : "第三人"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )
                }
                standingSlot={
                  !showStanding ? undefined : isClient ? (
                    <Select
                      value={ourStanding ?? ""}
                      onValueChange={(v) =>
                        setValue("ourStanding", v as LitigationStanding, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger className="h-9 w-full bg-background px-2.5 text-xs">
                        <SelectValue placeholder="诉讼地位（可选）" />
                      </SelectTrigger>
                      <SelectContent>
                        {(ourStandingOptions.length
                          ? ourStandingOptions
                          : (Object.keys(litigationStandingLabel) as LitigationStanding[])
                        ).map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {litigationStandingLabel[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={watch(`parties.${idx}.standing`) ?? ""}
                      onValueChange={(v) =>
                        setValue(`parties.${idx}.standing`, v as LitigationStanding, {
                          shouldDirty: true
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full bg-background px-2.5 text-xs">
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
                  )
                }
                nameSlot={
                  isClient ? (
                    <ClientCombobox
                      triggerClassName="h-9 text-sm"
                      clientId={clientId}
                      clientName={watch("parties.0.name") ?? ""}
                      clientType={
                        watch("parties.0.partyType") === "ORGANIZATION"
                          ? "COMPANY"
                          : "INDIVIDUAL"
                      }
                      options={clientOptions}
                      onPickExisting={(id, name) => {
                        setValue("clientId", id, { shouldDirty: true });
                        setValue("parties.0.name", name, {
                          shouldDirty: true,
                          shouldValidate: true
                        });
                      }}
                      onTypeNew={(name) => {
                        setValue("clientId", "", { shouldDirty: true });
                        setValue("parties.0.name", name, {
                          shouldDirty: true,
                          shouldValidate: true
                        });
                      }}
                      onPickYuandian={handlePickYuandian}
                      onClear={() => {
                        setValue("clientId", "", { shouldDirty: true });
                        setValue("parties.0.name", "", { shouldDirty: true });
                        setValue("parties.0.idNumber", "", { shouldDirty: true });
                        setValue("parties.0.enterpriseSocialCode", "", { shouldDirty: true });
                        setValue("parties.0.enterpriseName", "", { shouldDirty: true });
                        setValue("parties.0.address", "", { shouldDirty: true });
                        setValue("parties.0.legalRep", "", { shouldDirty: true });
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  const addPartyBtn = (label: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={() =>
        appendParty({
          role: "OPPOSING_PARTY",
          standing: undefined,
          ordinal: parties.length + 1,
          partyType: "NATURAL_PERSON",
          name: "",
          idNumber: "",
          enterpriseSocialCode: "",
          enterpriseName: "",
          phone: "",
          address: "",
          legalRep: "",
          contactName: "",
          notes: ""
        })
      }
    >
      <Plus className="h-3 w-3" />
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[92vw] max-w-[780px] flex-col gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border bg-card px-6 py-4">
          <div className="pr-8">
            {/* 标题与「待审批」同行齐平 */}
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-xl">新建收案</DialogTitle>
              <span className="rounded-sm border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                待审批
              </span>
            </div>
            <DialogDescription className="mt-1 text-sm">
              提交后进入&ldquo;待审批&rdquo;，由管理员/主任律师确认后转为正式案件
            </DialogDescription>
          </div>
        </DialogHeader>

        <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/35 px-6 py-5">
            {/* ① 基本信息（共用：类别 / 名称 / 收案 / 经办）*/}
            <Section title="① 基本信息" required>
              {/* 案件类别 | 收案时间（与类别等宽）| 案件名称（剩余）*/}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_160px_minmax(0,1fr)]">
                <Field label="案件类别" required>
                  <Select
                    value={category}
                    onValueChange={(v) => setValue("category", v as MatterCategory)}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {matterCategoryLabel[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="收案时间">
                  <div className="relative">
                    <Input
                      type="date"
                      className="h-10"
                      value={
                        receivedAt ? new Date(receivedAt).toISOString().split("T")[0] : ""
                      }
                      onChange={(e) =>
                        setValue("receivedAt", new Date(e.target.value), { shouldDirty: true })
                      }
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </Field>
                <Field label={nameLabel} error={errors.title?.message}>
                  {(() => {
                    const titleReg = register("title");
                    return (
                      <Input
                        placeholder="留空时自动生成"
                        className="h-10"
                        {...titleReg}
                        onChange={(e) => {
                          titleReg.onChange(e);
                          setTitleTouched(true);
                        }}
                      />
                    );
                  })()}
                </Field>
              </div>

              {/* 诉讼/仲裁：案情信息（并入基本信息）*/}
              {kind === "litigation" && (
                <>
                {/* 案由 | 当前程序 | 管辖地 | 争议解决机构 */}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <Field label="案由">
                    <CauseCombobox
                      category={category}
                      value={watch("causeId") || ""}
                      onChange={(id, name) => {
                        setValue("causeId", id, { shouldDirty: true });
                        setCauseName(name);
                      }}
                    />
                  </Field>
                  <Field label="当前程序" required error={errors.firstProcedureType?.message}>
                    <Select
                      value={firstProcedureType ?? ""}
                      onValueChange={(v) => handleProcedureChange(v as ProcedureType)}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="选择当前程序" />
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
                  <Field label="管辖地">
                    <JurisdictionSelect
                      value={jurisdiction}
                      onChange={(v) => {
                        setValue("jurisdiction", v, { shouldDirty: true });
                        const cur = watch("firstAgency");
                        if (cur && !agencyOptions(v).includes(cur)) {
                          setValue("firstAgency", "", { shouldDirty: true });
                        }
                      }}
                    />
                  </Field>
                  <Field label="争议解决机构">
                    <Select
                      value={watch("firstAgency") || ""}
                      onValueChange={(v) => setValue("firstAgency", v, { shouldDirty: true })}
                      disabled={agencyOpts.length === 0}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder={jurisdiction ? "选择机构" : "请先选管辖地"} />
                      </SelectTrigger>
                      <SelectContent>
                        {agencyOpts.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* 标的额（1/4）| 标的描述（3/4）*/}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
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
                  <Field label="标的描述（非金钱标的或其他诉求）" className="sm:col-span-3">
                    <Input
                      placeholder="如：请求确认合同有效 / 请求停止侵害"
                      {...register("claimDescription")}
                    />
                  </Field>
                </div>

                {/* 主办 | 协办 | 是否需向律协备案 | 是否反诉（各 1/4）*/}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  {leadField()}
                  {coLeadField()}
                  {barFilingField()}
                  {counterclaimField()}
                </div>
              </>
            )}

            {/* 非诉/专项：项目信息（并入基本信息）*/}
            {kind === "project" && (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <Field label="业务类型">
                    <Select
                      value={watch("businessType") || ""}
                      onValueChange={(v) => setValue("businessType", v, { shouldDirty: true })}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="选择业务类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_BUSINESS_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="项目金额（元）">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0.00"
                      className="font-mono"
                      {...register("claimAmount", { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="起始时间">
                    <Input
                      type="date"
                      value={
                        watch("serviceStart")
                          ? new Date(watch("serviceStart")!).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setValue(
                          "serviceStart",
                          e.target.value ? new Date(e.target.value) : undefined,
                          { shouldDirty: true }
                        )
                      }
                    />
                  </Field>
                  <Field label="结束时间">
                    <Input
                      type="date"
                      value={
                        watch("serviceEnd")
                          ? new Date(watch("serviceEnd")!).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setValue(
                          "serviceEnd",
                          e.target.value ? new Date(e.target.value) : undefined,
                          { shouldDirty: true }
                        )
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <Field label="服务范围 / 内容" className="sm:col-span-3">
                    <Input
                      placeholder="如：尽职调查范围、合同审查清单、交易结构设计…"
                      {...register("serviceScope")}
                    />
                  </Field>
                  <Field label="交付成果">
                    <Input placeholder="如：法律意见书 / 尽调报告" {...register("deliverables")} />
                  </Field>
                </div>
                {/* 主办 | 协办（各 1/2）*/}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {leadField()}
                  {coLeadField()}
                </div>
              </>
            )}

            {/* 顾问：顾问信息（并入基本信息）*/}
            {kind === "counsel" && (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <Field label="顾问类型">
                    <Select
                      value={watch("counselType") || ""}
                      onValueChange={(v) => setValue("counselType", v, { shouldDirty: true })}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="选择顾问类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNSEL_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="顾问期限 · 起">
                    <Input
                      type="date"
                      value={
                        watch("serviceStart")
                          ? new Date(watch("serviceStart")!).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setValue(
                          "serviceStart",
                          e.target.value ? new Date(e.target.value) : undefined,
                          { shouldDirty: true }
                        )
                      }
                    />
                  </Field>
                  <Field label="顾问期限 · 止">
                    <Input
                      type="date"
                      value={
                        watch("serviceEnd")
                          ? new Date(watch("serviceEnd")!).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setValue(
                          "serviceEnd",
                          e.target.value ? new Date(e.target.value) : undefined,
                          { shouldDirty: true }
                        )
                      }
                    />
                  </Field>
                  <Field label="对接电话">
                    <Input className="font-mono" placeholder="对接人电话" {...register("contactPhone")} />
                  </Field>
                </div>
                <Field label="服务范围 / 内容">
                  <Input
                    placeholder="如：日常法律咨询、合同审查、专项法律意见…"
                    {...register("serviceScope")}
                  />
                </Field>
                {/* 主办 | 协办（各 1/2）*/}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {leadField()}
                  {coLeadField()}
                </div>
              </>
            )}
            </Section>

            {/* ③ 当事人 / 相关方（按类别）*/}
            {kind === "litigation" && (
            <Section
              title="② 案件当事人"
              required
              headerAction={addPartyBtn("添加当事人")}
            >
              {watch("ourStanding") && RECEIVING_STANDINGS.has(watch("ourStanding")!) && (
                <div className="rounded-md border border-dashed border-primary/40 bg-primary/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">
                        <ScanLine className="mr-1 inline h-3 w-3 text-primary" />
                        识别起诉状 / 申请书
                      </div>
                      <p className="mt-0.5">
                        我方为被动方，可上传相对方起诉状 / 申请书（JPG / PNG / WebP / PDF，≤ 20MB），AI 自动抽取相对方主体与诉求
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

              {renderParties("litigation")}
            </Section>
            )}

            {/* ③ 非诉/专项：委托方与相对方（无诉讼地位）*/}
            {kind === "project" && (
              <Section title="② 委托方与相对方" headerAction={addPartyBtn("添加相对方")}>
                {renderParties("project")}
              </Section>
            )}

            {/* ③ 顾问：顾问单位 */}
            {kind === "counsel" && (
              <Section title="② 顾问单位" required>
                {renderParties("counsel")}
              </Section>
            )}

            {/* 3. 律师费 */}
            <Section title={kind === "counsel" ? "③ 顾问费" : "③ 律师费"}>
              <div
                className={cn(
                  "grid grid-cols-1 gap-2",
                  kind === "counsel" ? "sm:grid-cols-2" : "sm:grid-cols-3"
                )}
              >
                {/* 顾问费不含风险代理 */}
                {FEE_TYPES.filter((t) => kind !== "counsel" || t !== "CONTINGENCY").map((t) => (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              {feeType === "TIMED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="小时费率（元 / 小时）" required>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0.00"
                      className="font-mono"
                      {...register("feeAmount", { valueAsNumber: true })}
                    />
                  </Field>
                  <Field label="计费说明 / 结算周期">
                    <Input
                      placeholder="如：合伙人 2000 元/时、授薪律师 1000 元/时；按月结算"
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

            {/* 4. 合同 */}
            <Section
              title="④ 委托合同 / 相关附件"
              headerAction={
                <>
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
                    添加
                  </Button>
                </>
              }
            >
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

          <DialogFooter className="border-t border-border bg-card px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5 px-5">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              提交审批
            </Button>
          </DialogFooter>
        </form>
        </FormProvider>
      </DialogContent>
      <CauseRecommendationDialog
        open={aiRecOpen}
        loading={aiRecLoading}
        candidates={aiRecCandidates}
        errorMessage={aiRecError}
        onSelect={handleAiRecSelect}
        onOpenChange={setAiRecOpen}
        onRetry={handleAiRecRetry}
      />
      <CauseAiManualDialog
        open={aiManualOpen}
        onOpenChange={setAiManualOpen}
        category={category}
        contextHints={(() => {
          const lines: string[] = [];
          const cf = watch("causeFreeText");
          if (cf) lines.push(`OCR 识别案由：${cf}`);
          const cd = watch("claimDescription");
          if (cd) lines.push(`诉讼请求：${cd}`);
          const opp = parties
            .filter((p) => p.role === "OPPOSING_PARTY")
            .map((p) => p.name)
            .filter(Boolean);
          if (opp.length) lines.push(`对方当事人：${opp.join("、")}`);
          return lines.join("\n");
        })()}
        onSelect={handleAiRecSelect}
      />
    </Dialog>
  );
}

function Section({
  title,
  required,
  headerAction,
  children
}: {
  title: string;
  required?: boolean;
  headerAction?: React.ReactNode;
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
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-ll-low">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5">
          {roman && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-primary/10 px-1.5 text-[0.68rem] font-semibold text-primary">
              {roman}
            </span>
          )}
          <span className="text-base font-semibold tracking-tight">
            {text}
            {required && <span className="ml-1 text-destructive">*</span>}
          </span>
        </h3>
        {headerAction}
      </div>
      <div className="space-y-3.5">{children}</div>
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
      <Label className="flex items-center gap-1 text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
