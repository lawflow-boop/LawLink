"use client";

import { useEffect, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, X, Loader2, Trash2, Star } from "lucide-react";
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
  phone: "",
  email: "",
  source: "",
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
        phone: editingClient.phone ?? "",
        email: editingClient.email ?? "",
        source: editingClient.source ?? "",
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
                <Input
                  className="font-mono"
                  placeholder={
                    watchedType === "INDIVIDUAL" ? "18 位身份证号" : "18 位信用代码"
                  }
                  {...register("idNumber")}
                />
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

              <Field label="案源">
                <Input placeholder="介绍人 / 公开来源 / 老客户复购" {...register("source")} />
              </Field>

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

                    <div className="grid grid-cols-2 gap-3">
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
