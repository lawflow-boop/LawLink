"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  nextOrder
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
  category: MatterCategory;
  nextOrder: number;
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
      acceptedAt: undefined
    }
  });

  const procedureType = watch("type");
  const engagement = watch("engagement");

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle>添加程序（第 {nextOrder} 个）</SheetTitle>
          <SheetDescription className="text-xs">
            一审/二审/再审都可串接；如果是别人代理的前序程序，选 <span className="text-foreground">前序参考</span>
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* 参与方式 */}
            <div className="space-y-2">
              <Label className="text-xs">参与方式</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["ENGAGED", "INFORMATIONAL"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setValue("engagement", e)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      engagement === e
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-input"
                    )}
                  >
                    <div className="font-medium">
                      {e === "ENGAGED" ? "我方代理" : "前序参考"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {e === "ENGAGED"
                        ? "完整工作流：阶段、期限、开庭"
                        : "仅录元数据，不进日程聚合"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-3">
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
              添加程序
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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

  const {
    register,
    handleSubmit,
    reset,
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
