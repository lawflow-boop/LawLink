"use client";

import { useTransition, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Upload, ScanText } from "lucide-react";
import type { MatterCategory, ProcedureType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  procedureCreateSchema,
  deadlineCreateSchema,
  hearingCreateSchema,
  type ProcedureCreateInput,
  type DeadlineCreateInput,
  type HearingCreateInput
} from "@/server/procedures/schemas";
import {
  addProcedure,
  addDeadline,
  addHearing
} from "@/server/procedures/actions";
import { parseSummons } from "@/server/ai/parse-summons";
import { procedureTypeLabel } from "@/lib/enums";
import {
  proceduresByCategory,
  suggestHandlingAgency
} from "@/lib/procedures-by-category";
import { cn } from "@/lib/utils";

// ============ AddProcedureSheet ============

export function AddProcedureSheet({
  open,
  onOpenChange,
  matterId,
  category,
  nextOrder,
  colleagues
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
  category: MatterCategory;
  nextOrder: number;
  /** v0.44: 所内律师列表（主办律师下拉） */
  colleagues?: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const procedureOptions = proceduresByCategory[category];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<ProcedureCreateInput>({
    resolver: zodResolver(procedureCreateSchema),
    defaultValues: {
      matterId,
      type: procedureOptions[0],
      customLabel: "",
      engagement: "ENGAGED",
      caseNumber: "",
      handlingAgency: "",
      panel: "",
      handler: "",
      acceptedAt: undefined,
      leadLawyerId: null,
      isExternalLead: false
    }
  });

  const procedureType = watch("type");
  const leadLawyerId = watch("leadLawyerId");
  const isExternalLead = watch("isExternalLead");

  function onSubmit(values: ProcedureCreateInput) {
    startTransition(async () => {
      try {
        await addProcedure(values);
        toast.success(`程序已添加（${procedureTypeLabel[values.type]}）`);
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>添加程序（第 {nextOrder} 个）</DialogTitle>
          <DialogDescription className="text-xs">
            填写程序基本信息和主办律师
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* 程序类型 */}
            <div className="space-y-2">
              <Label className="text-xs">程序类型 *</Label>
              <div className="flex flex-wrap gap-1.5">
                {procedureOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValue("type", p as ProcedureType)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      procedureType === p
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-input"
                    )}
                  >
                    {procedureTypeLabel[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* 主办律师 */}
            {colleagues && colleagues.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">主办律师</Label>
                <div className="flex items-center gap-3">
                  <Select
                    value={isExternalLead ? "__external__" : (leadLawyerId ?? "__none__")}
                    onValueChange={(v) => {
                      if (v === "__external__") {
                        setValue("isExternalLead", true);
                        setValue("leadLawyerId", null);
                      } else if (v === "__none__") {
                        setValue("isExternalLead", false);
                        setValue("leadLawyerId", null);
                      } else {
                        setValue("isExternalLead", false);
                        setValue("leadLawyerId", v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="选择主办律师" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">未指定</SelectItem>
                      {colleagues.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__external__">非本所代理</SelectItem>
                    </SelectContent>
                  </Select>
                  {isExternalLead && (
                    <span className="text-xs text-muted-foreground">此程序由外部律师代理</span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="案号">
                <Input
                  className="font-mono"
                  placeholder="如 (2026)沪0105民初1288号"
                  {...register("caseNumber")}
                />
              </Field>
              <Field label="办理机关">
                <Input
                  placeholder={suggestHandlingAgency(procedureType)}
                  {...register("handlingAgency")}
                />
              </Field>
              <Field label="主审 / 仲裁员">
                <Input {...register("handler")} />
              </Field>
              <Field label="庭别 / 合议庭">
                <Input {...register("panel")} />
              </Field>
              <Field
                label="立案 / 受理日期"
                error={errors.acceptedAt?.message as string | undefined}
              >
                <Input
                  type="date"
                  {...register("acceptedAt", { valueAsDate: true })}
                />
              </Field>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
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
              添加程序
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ AddDeadlineSheet ============

const deadlineCategoryLabel: Record<
  DeadlineCreateInput["category"],
  string
> = {
  LIMITATION: "诉讼时效",
  EVIDENCE: "举证期限",
  APPEAL: "上诉期",
  PERFORMANCE: "履行期",
  RESPONSE: "答辩期",
  ENFORCEMENT: "执行申请",
  ARBITRATION_SET_ASIDE: "撤销仲裁期",
  PRESERVATION: "保全期限",
  CUSTOM: "其他"
};

export function AddDeadlineSheet({
  open,
  onOpenChange,
  procedureId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  procedureId: string;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<DeadlineCreateInput>({
    resolver: zodResolver(deadlineCreateSchema),
    defaultValues: {
      procedureId,
      title: "",
      category: "CUSTOM",
      dueAt: new Date(),
      basis: "",
      remindDays: 3
    }
  });

  function onSubmit(values: DeadlineCreateInput) {
    startTransition(async () => {
      try {
        await addDeadline(values);
        toast.success("期限已添加");
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle>添加期限</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            <Field label="期限名称" required error={errors.title?.message}>
              <Input
                placeholder="如：举证截止 / 上诉到期日"
                {...register("title")}
              />
            </Field>

            <Field label="期限类型">
              <Select
                value={watch("category")}
                onValueChange={(v) =>
                  setValue("category", v as DeadlineCreateInput["category"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(deadlineCategoryLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="到期日" required>
              <Input type="date" {...register("dueAt", { valueAsDate: true })} />
            </Field>

            <Field label="计算依据">
              <Input
                placeholder="如：判决书送达日 2026-05-01 + 15 日"
                {...register("basis")}
              />
            </Field>

            <Field label="提前提醒（天）">
              <Input
                type="number"
                min={0}
                max={60}
                className="font-mono tabular"
                {...register("remindDays", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <SheetFooter className="border-t border-border bg-background px-6 py-4">
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
              添加期限
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ============ AddHearingSheet ============

export function AddHearingSheet({
  open,
  onOpenChange,
  procedureId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  procedureId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors }
  } = useForm<HearingCreateInput>({
    resolver: zodResolver(hearingCreateSchema),
    defaultValues: {
      procedureId,
      title: "",
      startsAt: new Date(),
      endsAt: undefined,
      room: "",
      judge: "",
      notes: ""
    }
  });

  function handleSummonsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const result = await parseSummons(fd);
        if (result.hearingDate && result.hearingTime) {
          const dt = `${result.hearingDate}T${result.hearingTime}`;
          setValue("startsAt", new Date(dt));
        } else if (result.hearingDate) {
          setValue("startsAt", new Date(`${result.hearingDate}T09:00`));
        }
        if (result.courtRoom) setValue("room", result.courtRoom);
        if (result.judge) setValue("judge", result.judge);
        if (result.caseNumber || result.parties) {
          const parts: string[] = [];
          if (result.caseNumber) parts.push(`案号：${result.caseNumber}`);
          if (result.parties?.length) parts.push(`当事人：${result.parties.join("、")}`);
          setValue("notes", parts.join("\n"));
        }
        toast.success("传票识别完成，请核对信息");
      } catch (err) {
        toast.error("传票识别失败", {
          description: err instanceof Error ? err.message : "请手动填写"
        });
      } finally {
        setOcrLoading(false);
        // reset file input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function onSubmit(values: HearingCreateInput) {
    startTransition(async () => {
      try {
        await addHearing(values);
        toast.success("开庭已添加");
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("添加失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle>添加开庭</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {/* 上传传票 */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={handleSummonsUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={ocrLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                {ocrLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanText className="h-3.5 w-3.5" />
                )}
                {ocrLoading ? "识别中…" : "上传传票识别"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                上传传票照片，AI 自动填充开庭信息
              </span>
            </div>

            <Field label="主题" required error={errors.title?.message}>
              <Input placeholder="如：第一次开庭" {...register("title")} />
            </Field>

            <Field label="开庭时间" required>
              <Input
                type="datetime-local"
                {...register("startsAt", { valueAsDate: true })}
              />
            </Field>

            <Field label="预计结束">
              <Input
                type="datetime-local"
                {...register("endsAt", { valueAsDate: true })}
              />
            </Field>

            <Field label="法庭 / 仲裁庭">
              <Input placeholder="如 第三法庭" {...register("room")} />
            </Field>

            <Field label="主审 / 仲裁员">
              <Input {...register("judge")} />
            </Field>

            <Field label="备注 / 庭审笔记">
              <Textarea rows={4} {...register("notes")} />
            </Field>
          </div>

          <SheetFooter className="border-t border-border bg-background px-6 py-4">
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
              添加开庭
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ============ Shared Field ============

function Field({
  label,
  required,
  error,
  children
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
