"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, X, Loader2, Trash2, Star, Sparkles, Search } from "lucide-react";
import type { Client, Contact } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { clientCreateSchema, type ClientCreateInput } from "@/server/clients/schemas";
import { createClient, updateClient } from "@/server/clients/actions";
import {
  cooperationStatusLabel,
  COOPERATION_STATUS_OPTIONS,
  genderLabel,
  GENDER_OPTIONS
} from "@/lib/enums";
import {
  searchEnterpriseCandidates,
  getEnterpriseDetail,
  type EnterpriseSearchItem
} from "@/server/yuandian/enterprise";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClient: (Client & { contacts?: Contact[] }) | null;
};

const emptyDefaults: ClientCreateInput = {
  name: "",
  type: "INDIVIDUAL",
  idNumber: "",
  address: "",
  legalRep: "",
  phone: "",
  email: "",
  source: "",
  cooperationStatus: "SIGNED",
  industry: "",
  gender: "",
  ethnicity: "",
  tags: [],
  notes: "",
  contacts: [{ name: "", title: "", phone: "", email: "", wechat: "", isPrimary: true, notes: "" }]
};

export function ClientSheet({ open, onOpenChange, editingClient }: Props) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!editingClient;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: emptyDefaults
  });

  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });
  const watchedType = watch("type");
  const watchedTags = watch("tags");

  // 当 editing 切换时重置表单
  useEffect(() => {
    if (!open) return;
    if (editingClient) {
      reset({
        name: editingClient.name,
        type: editingClient.type,
        idNumber: editingClient.idNumber ?? "",
        address: editingClient.address ?? "",
        legalRep: (editingClient as any).legalRep ?? "",
        phone: editingClient.phone ?? "",
        email: editingClient.email ?? "",
        source: editingClient.source ?? "",
        cooperationStatus: (editingClient as any).cooperationStatus ?? "SIGNED",
        industry: (editingClient as any).industry ?? "",
        gender: (editingClient as any).gender ?? "",
        ethnicity: (editingClient as any).ethnicity ?? "",
        tags: editingClient.tags,
        notes: editingClient.notes ?? "",
        contacts:
          editingClient.contacts && editingClient.contacts.length > 0
            ? editingClient.contacts.map((c) => ({
                name: c.name,
                title: c.title ?? "",
                phone: c.phone ?? "",
                email: c.email ?? "",
                wechat: c.wechat ?? "",
                isPrimary: c.isPrimary,
                notes: c.notes ?? ""
              }))
            : emptyDefaults.contacts
      });
    } else {
      reset(emptyDefaults);
    }
  }, [editingClient, open, reset]);

  function onSubmit(values: ClientCreateInput) {
    startTransition(async () => {
      try {
        if (isEdit && editingClient) {
          await updateClient({ id: editingClient.id, ...values });
          toast.success("客户已更新");
        } else {
          await createClient(values);
          toast.success("客户已创建");
        }
        onOpenChange(false);
      } catch (err) {
        toast.error("保存失败", {
          description: err instanceof Error ? err.message : "请稍后重试"
        });
      }
    });
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t) return;
    const current = watchedTags || [];
    if (current.includes(t)) return;
    setValue("tags", [...current, t], { shouldDirty: true });
  }

  function removeTag(tag: string) {
    setValue("tags", (watchedTags || []).filter((t) => t !== tag), { shouldDirty: true });
  }

  // v0.27: AI 自动填信用代码（公司 / 组织路径）
  const [candidates, setCandidates] = useState<EnterpriseSearchItem[] | null>(null);
  const [aiSearching, startAiSearch] = useTransition();
  const [aiFilling, startAiFill] = useTransition();

  function handleAILookup() {
    const name = (watch("name") || "").trim();
    if (!name) {
      toast.warning("请先填写客户名称再点击 AI 查找");
      return;
    }
    startAiSearch(async () => {
      try {
        const r = await searchEnterpriseCandidates(name);
        if (!r.configured) {
          toast.error("元典 API 未配置", {
            description: "请在 设置 → AI 与元典 中配置 API Key"
          });
          return;
        }
        if (r.items.length === 0) {
          toast.info("未找到候选企业", { description: "试试更完整的名称或简称" });
          return;
        }
        setCandidates(r.items);
      } catch (err) {
        toast.error("查找失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handlePickCandidate(item: EnterpriseSearchItem) {
    startAiFill(async () => {
      setValue("idNumber", item.creditCode, { shouldDirty: true, shouldValidate: true });
      setValue("name", item.name, { shouldDirty: true });
      setCandidates(null);
      try {
        const r = await getEnterpriseDetail(item.id);
        if (r.configured && r.info) {
          if (r.info.legalRep) setValue("legalRep", r.info.legalRep, { shouldDirty: true });
          if (r.info.address) setValue("address", r.info.address, { shouldDirty: true });
          toast.success(`已回填：${item.name}`);
        }
      } catch (err) {
        toast.warning("法代 / 地址自动填充失败，可手动补充", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle className="text-lg">
            {isEdit ? "编辑客户" : "新建客户"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            客户主体信息 + 联系人，联系方式细节走联系人单独维护
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* 基本信息 */}
            <Section title="基本信息">
              <Field label="客户名称" required error={errors.name?.message}>
                <Input
                  placeholder={
                    watchedType === "INDIVIDUAL" ? "张三" : "上海某某有限公司"
                  }
                  {...register("name")}
                />
              </Field>

              <Field label="类型" required>
                <Select
                  value={watchedType}
                  onValueChange={(v) =>
                    setValue("type", v as ClientCreateInput["type"], { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">自然人</SelectItem>
                    <SelectItem value="COMPANY">公司</SelectItem>
                    <SelectItem value="ORGANIZATION">其他组织</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label={watchedType === "INDIVIDUAL" ? "身份证号" : "统一社会信用代码"}
              >
                {watchedType === "INDIVIDUAL" ? (
                  <Input
                    className="font-mono"
                    placeholder="18 位身份证号"
                    {...register("idNumber")}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <Input
                        className="flex-1 font-mono"
                        placeholder="18 位信用代码"
                        {...register("idNumber")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAILookup}
                        disabled={aiSearching || aiFilling}
                        className="h-9 shrink-0 gap-1"
                        title="按客户名称在元典搜索，自动回填信用代码 / 法代 / 注册地址"
                      >
                        {aiSearching ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        AI 查找
                      </Button>
                    </div>
                    {candidates && candidates.length > 0 && (
                      <div className="rounded-md border border-border bg-muted/30 p-1.5">
                        <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Search className="h-3 w-3" />共 {candidates.length} 条候选，点击回填
                        </div>
                        <ul className="space-y-1">
                          {candidates.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => handlePickCandidate(c)}
                                disabled={aiFilling}
                                className="w-full rounded border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-primary disabled:opacity-50"
                              >
                                <div className="font-medium">{c.name}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {c.creditCode}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => setCandidates(null)}
                          className="mt-1 w-full text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          关闭
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Field>

              <Field label="主要联系电话">
                <Input className="font-mono" placeholder="11 位手机号" {...register("phone")} />
              </Field>

              <Field label="邮箱" error={errors.email?.message}>
                <Input type="email" placeholder="contact@example.com" {...register("email")} />
              </Field>

              <Field label="地址">
                <Input placeholder="详细地址" {...register("address")} />
              </Field>

              {watchedType !== "INDIVIDUAL" && (
                <Field label="法定代表人">
                  <Input placeholder="法定代表人姓名" {...register("legalRep")} />
                </Field>
              )}

              <Field label="案源">
                <Input placeholder="介绍人 / 公开来源 / 老客户复购" {...register("source")} />
              </Field>

              <Field label="合作状态">
                <Select
                  value={watch("cooperationStatus")}
                  onValueChange={(v) =>
                    setValue("cooperationStatus", v as ClientCreateInput["cooperationStatus"], {
                      shouldDirty: true
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COOPERATION_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {cooperationStatusLabel[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="所属行业">
                <Input placeholder="如 制造业 / 互联网 / 房地产" {...register("industry")} />
              </Field>

              {watchedType === "INDIVIDUAL" && (
                <>
                  <Field label="性别">
                    <Select
                      value={watch("gender") || "UNSET"}
                      onValueChange={(v) =>
                        setValue(
                          "gender",
                          v === "UNSET" ? "" : (v as "MALE" | "FEMALE"),
                          { shouldDirty: true }
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="未填" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNSET">未填</SelectItem>
                        {GENDER_OPTIONS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {genderLabel[g]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="民族">
                    <Input placeholder="如 汉族" {...register("ethnicity")} />
                  </Field>
                </>
              )}

              <Field label="标签">
                <TagInput
                  tags={watchedTags || []}
                  onAdd={addTag}
                  onRemove={removeTag}
                />
              </Field>

              <Field label="备注" full>
                <Textarea rows={3} placeholder="可选" {...register("notes")} />
              </Field>
            </Section>

            {/* 联系人 */}
            <Section
              title="联系人"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      name: "",
                      title: "",
                      phone: "",
                      email: "",
                      wechat: "",
                      isPrimary: false,
                      notes: ""
                    })
                  }
                  className="h-7 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加联系人
                </Button>
              }
            >
              <div className="col-span-2 space-y-3">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        联系人 {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                          <Checkbox
                            checked={watch(`contacts.${idx}.isPrimary`)}
                            onCheckedChange={(c) => {
                              if (c) {
                                // 单选：取消其他主联系人
                                fields.forEach((_, i) => {
                                  setValue(`contacts.${i}.isPrimary`, i === idx);
                                });
                              } else {
                                setValue(`contacts.${idx}.isPrimary`, false);
                              }
                            }}
                          />
                          <Star className="h-3 w-3" /> 主要联系人
                        </label>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(idx)}
                            className="h-7 w-7 p-0 text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field
                        label="姓名"
                        required
                        error={errors.contacts?.[idx]?.name?.message}
                      >
                        <Input
                          placeholder="姓名"
                          {...register(`contacts.${idx}.name`)}
                        />
                      </Field>
                      <Field label="职务">
                        <Input
                          placeholder="法定代表人 / 总经理 / 法务"
                          {...register(`contacts.${idx}.title`)}
                        />
                      </Field>
                      <Field label="电话">
                        <Input
                          className="font-mono"
                          {...register(`contacts.${idx}.phone`)}
                        />
                      </Field>
                      <Field
                        label="邮箱"
                        error={errors.contacts?.[idx]?.email?.message}
                      >
                        <Input
                          type="email"
                          {...register(`contacts.${idx}.email`)}
                        />
                      </Field>
                      <Field label="微信">
                        <Input {...register(`contacts.${idx}.wechat`)} />
                      </Field>
                      <Field label="备注">
                        <Input {...register(`contacts.${idx}.notes`)} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* 底栏 */}
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
              {isEdit ? "保存" : "创建客户"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-0.5 rounded-full bg-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
        {action}
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
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

function TagInput({
  tags,
  onAdd,
  onRemove
}: {
  tags: string[];
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-primary">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary"
        >
          {t}
          <button
            type="button"
            onClick={() => onRemove(t)}
            className="hover:text-foreground"
            aria-label={`移除 ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={tags.length === 0 ? "输入后回车添加标签" : ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        className="flex-1 min-w-24 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
