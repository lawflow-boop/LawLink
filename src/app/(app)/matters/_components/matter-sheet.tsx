"use client";

import { useTransition, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { MatterCategory, LitigationStanding, ProcedureType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  matterCategoryLabel,
  litigationStandingLabel,
  procedureTypeLabel
} from "@/lib/enums";
import {
  proceduresByCategory,
  standingsByCategory,
  suggestHandlingAgency
} from "@/lib/procedures-by-category";
import { matterCreateSchema, type MatterCreateInput } from "@/server/matters/schemas";
import { createMatter } from "@/server/matters/actions";
import { cn } from "@/lib/utils";
import { CauseCombobox } from "./cause-combobox";
import type { ClientOption } from "./matters-view";

const CATEGORIES: MatterCategory[] = [
  "CIVIL_COMMERCIAL",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
];

const defaults: MatterCreateInput = {
  title: "",
  category: "CIVIL_COMMERCIAL",
  causeId: "",
  causeFreeText: "",
  claimAmount: undefined,
  ourStanding: "PLAINTIFF",
  counterclaimAsPlaintiff: false,
  counterclaimAsDefendant: false,
  intakeDate: new Date(),
  clientIds: [],
  parties: [],
  firstProcedure: {
    type: "FIRST_INSTANCE",
    customLabel: "",
    caseNumber: "",
    handlingAgency: "",
    acceptedAt: undefined
  }
};

export function MatterSheet({
  open,
  onOpenChange,
  clientOptions
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientOptions: ClientOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<MatterCreateInput>({
    resolver: zodResolver(matterCreateSchema),
    defaultValues: defaults
  });

  const { fields: parties, append: appendParty, remove: removeParty } = useFieldArray({
    control,
    name: "parties"
  });

  const category = watch("category");
  const ourStanding = watch("ourStanding");
  const procedureType = watch("firstProcedure.type");
  const clientIds = watch("clientIds");

  // 当 category 变化时，重置依赖字段
  useEffect(() => {
    const availableProcedures = proceduresByCategory[category];
    const availableStandings = standingsByCategory[category];

    // 当前 procedureType 不在新 category 可选项中 → 重置
    if (!availableProcedures.includes(procedureType)) {
      setValue("firstProcedure.type", availableProcedures[0]);
    }
    // 当前 ourStanding 不在新 category 可选项中 → 重置
    if (ourStanding && !availableStandings.includes(ourStanding)) {
      setValue("ourStanding", availableStandings[0]);
    }
    // 反诉补充仅民商事
    if (category !== "CIVIL_COMMERCIAL") {
      setValue("counterclaimAsPlaintiff", false);
      setValue("counterclaimAsDefendant", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (!open) {
      reset(defaults);
    }
  }, [open, reset]);

  function toggleClient(id: string) {
    const current = clientIds ?? [];
    if (current.includes(id)) {
      setValue(
        "clientIds",
        current.filter((c) => c !== id),
        { shouldDirty: true, shouldValidate: true }
      );
    } else {
      setValue("clientIds", [...current, id], { shouldDirty: true, shouldValidate: true });
    }
  }

  function onSubmit(values: MatterCreateInput) {
    startTransition(async () => {
      try {
        const res = await createMatter(values);
        toast.success(`案件已创建：${res.internalCode}`);
        onOpenChange(false);
        if (res.id) router.push(`/matters/${res.id}`);
      } catch (err) {
        toast.error("创建失败", {
          description: err instanceof Error ? err.message : "请检查必填项"
        });
      }
    });
  }

  const procedureOptions = proceduresByCategory[category];
  const standingOptions = standingsByCategory[category];
  const isCriminal = category === "CRIMINAL";
  const isCivil = category === "CIVIL_COMMERCIAL";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle className="text-lg">新建案件</SheetTitle>
          <SheetDescription className="text-xs">
            字段按案件类别动态显示；新建后自动生成案件编号，可在详情页继续完善
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* 案件类别 */}
            <Section title="案件类别">
              <div className="col-span-2">
                <ToggleGroup
                  value={category}
                  options={CATEGORIES.slice(0, 3)}
                  onChange={(v) => setValue("category", v as MatterCategory)}
                  labels={matterCategoryLabel}
                />
                <ToggleGroup
                  value={category}
                  options={CATEGORIES.slice(3)}
                  onChange={(v) => setValue("category", v as MatterCategory)}
                  labels={matterCategoryLabel}
                  className="mt-2"
                />
              </div>
            </Section>

            {/* 基本信息 */}
            <Section title="基本信息">
              <Field label="案件名称" required error={errors.title?.message} full>
                <Input
                  placeholder="如：青石建设诉华东置业建设工程合同纠纷"
                  {...register("title")}
                />
              </Field>

              <Field label="案由" required full>
                <CauseCombobox
                  category={category}
                  value={watch("causeId") || ""}
                  onChange={(id) => setValue("causeId", id, { shouldDirty: true })}
                />
              </Field>

              <Field label="标的金额（元）">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="font-mono tabular"
                  {...register("claimAmount", { valueAsNumber: true })}
                />
              </Field>

              <Field label="收案时间">
                <Input
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  {...register("intakeDate", { valueAsDate: true })}
                />
              </Field>
            </Section>

            {/* 委托方 */}
            <Section title="委托方" required>
              <div className="col-span-2 space-y-2">
                {clientOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    还没有客户。请先在{" "}
                    <a href="/clients" className="text-primary underline">
                      客户管理
                    </a>{" "}
                    创建客户。
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {clientOptions.map((c) => {
                        const checked = clientIds?.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleClient(c.id)}
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm transition-colors",
                              checked
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-input"
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    {errors.clientIds && (
                      <p className="text-xs text-destructive">{errors.clientIds.message}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      支持多选（一案多原告）。第一个为主要委托方。
                    </p>
                  </>
                )}
              </div>
            </Section>

            {/* 诉讼地位 */}
            <Section title="诉讼地位">
              <Field label="我方角色">
                <Select
                  value={ourStanding ?? ""}
                  onValueChange={(v) =>
                    setValue("ourStanding", v as LitigationStanding, { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {standingOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {litigationStandingLabel[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {isCivil && (
                <Field label="反诉补充">
                  <div className="flex h-10 items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={watch("counterclaimAsPlaintiff")}
                        onCheckedChange={(c) =>
                          setValue("counterclaimAsPlaintiff", !!c, { shouldDirty: true })
                        }
                      />
                      反诉原告
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={watch("counterclaimAsDefendant")}
                        onCheckedChange={(c) =>
                          setValue("counterclaimAsDefendant", !!c, { shouldDirty: true })
                        }
                      />
                      反诉被告
                    </label>
                  </div>
                </Field>
              )}
            </Section>

            {/* 当事人（对方/第三人） */}
            <Section
              title="对方与第三人"
              action={
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendParty({
                        role: "OPPOSING_PARTY",
                        ordinal: parties.filter((p) => p.role === "OPPOSING_PARTY").length + 1,
                        name: "",
                        idNumber: "",
                        phone: "",
                        address: "",
                        legalRep: "",
                        notes: ""
                      })
                    }
                    className="h-7 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    对方
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendParty({
                        role: "THIRD_PARTY",
                        ordinal: parties.filter((p) => p.role === "THIRD_PARTY").length + 1,
                        name: "",
                        idNumber: "",
                        phone: "",
                        address: "",
                        legalRep: "",
                        notes: ""
                      })
                    }
                    className="h-7 gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    第三人
                  </Button>
                </div>
              }
            >
              <div className="col-span-2 space-y-2">
                {parties.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background py-3 text-center text-xs text-muted-foreground">
                    暂无对方/第三人，点击右上角按钮添加
                  </p>
                ) : (
                  parties.map((p, idx) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {p.role === "OPPOSING_PARTY" ? "对方" : "第三人"} {p.ordinal}
                        </span>
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
                          placeholder="身份证号 / 信用代码"
                          className="font-mono"
                          {...register(`parties.${idx}.idNumber`)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Section>

            {/* 首程序 */}
            <Section title="代理程序">
              <Field label="程序类型" required full>
                <div className="flex flex-wrap gap-1.5">
                  {procedureOptions.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setValue("firstProcedure.type", p as ProcedureType)}
                      className={cn(
                        "rounded-md border px-3 py-1 text-xs transition-colors",
                        procedureType === p
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-input"
                      )}
                    >
                      {procedureTypeLabel[p]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="案号">
                <Input
                  className="font-mono"
                  placeholder="如 (2026)沪0105民初1288号"
                  {...register("firstProcedure.caseNumber")}
                />
              </Field>

              <Field label={isCriminal ? "办理机关" : "法院 / 仲裁机构"}>
                <Input
                  placeholder={suggestHandlingAgency(procedureType)}
                  {...register("firstProcedure.handlingAgency")}
                />
              </Field>

              <Field label="立案 / 受理日期">
                <Input type="date" {...register("firstProcedure.acceptedAt", { valueAsDate: true })} />
              </Field>
            </Section>
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
            <Button
              type="submit"
              disabled={isPending}
              className="gap-1.5 "
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              创建案件
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  required,
  action,
  children
}: {
  title: string;
  required?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-0.5 rounded-full bg-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
            {required && <span className="ml-1 text-destructive">*</span>}
          </h3>
        </div>
        {action}
      </header>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  full,
  error,
  children
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "col-span-2")}>
      <Label className="flex items-center gap-1 text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  labels,
  className
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  labels: Record<T, string>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
            value === o
              ? "border-primary bg-primary/15 text-primary shadow-sm"
              : "border-border bg-background text-muted-foreground hover:border-input"
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
