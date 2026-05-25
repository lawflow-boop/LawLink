"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Phone,
  MessageCircle,
  Mail,
  Users,
  Gavel,
  Loader2,
  Trash2,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  SheetFooter
} from "@/components/ui/sheet";
import { createNote, deleteNote } from "@/server/notes/actions";
import type { NotePayload } from "./matter-detail-tabs";
import { cn } from "@/lib/utils";

const channelMeta = {
  PHONE: { icon: Phone, label: "电话", color: "#4ADE80" },
  WECHAT: { icon: MessageCircle, label: "微信", color: "#4FD1C5" },
  EMAIL: { icon: Mail, label: "邮件", color: "#5B8DEF" },
  MEETING: { icon: Users, label: "面谈", color: "#9B7BF7" },
  COURT: { icon: Gavel, label: "法院", color: "#FBBF24" },
  OTHER: { icon: MessageSquare, label: "其他", color: "#9BA8C7" }
} as const;

const formSchema = z.object({
  matterId: z.string().cuid(),
  channel: z.enum(["PHONE", "WECHAT", "EMAIL", "MEETING", "COURT", "OTHER"]),
  withWhom: z.string().max(80).optional().or(z.literal("")),
  occurredAt: z.coerce.date(),
  content: z.string().min(1, "内容不能为空").max(5000)
});

type FormValues = z.infer<typeof formSchema>;

export function NotesPanel({
  matterId,
  notes
}: {
  matterId: string;
  notes: NotePayload[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("删除这条沟通记录？")) return;
    startTransition(async () => {
      try {
        await deleteNote(id);
        toast.success("已删除");
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          按时间倒序展示。每条记录会进入审计日志。
        </p>
        <Button
          onClick={() => setSheetOpen(true)}
          size="sm"
          className="gap-1.5 "
        >
          <Plus className="h-4 w-4" />
          录入沟通
        </Button>
      </header>

      {notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            还没有沟通记录。点击 <span className="text-foreground">录入沟通</span> 开始
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const meta = channelMeta[n.channel];
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className="group rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                    style={{ borderColor: `${meta.color}40`, color: meta.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{ borderColor: `${meta.color}40`, color: meta.color }}
                      >
                        {meta.label}
                      </Badge>
                      {n.withWhom && (
                        <span className="text-xs text-muted-foreground">
                          与 <span className="text-foreground">{n.withWhom}</span>
                        </span>
                      )}
                      <span className="font-mono text-xs text-muted-foreground tabular">
                        {new Date(n.occurredAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{n.author.name}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {n.content}
                    </p>
                    {n.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {n.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            #{t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    disabled={isPending}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NoteSheet matterId={matterId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function NoteSheet({
  matterId,
  open,
  onOpenChange
}: {
  matterId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      matterId,
      channel: "PHONE",
      withWhom: "",
      occurredAt: new Date(),
      content: ""
    }
  });

  const channel = watch("channel");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        await createNote({ ...values, tags: [] });
        toast.success("沟通记录已保存");
        reset({
          matterId,
          channel: "PHONE",
          withWhom: "",
          occurredAt: new Date(),
          content: ""
        });
        onOpenChange(false);
      } catch (err) {
        toast.error("保存失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle>录入沟通</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label className="text-xs">沟通渠道</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["PHONE", "WECHAT", "EMAIL", "MEETING", "COURT", "OTHER"] as const).map(
                  (c) => {
                    const meta = channelMeta[c];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setValue("channel", c)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors",
                          channel === c
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-input"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {meta.label}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">沟通对象</Label>
              <Input placeholder="如 张三 / 主审法官" {...register("withWhom")} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">时间</Label>
              <Input
                type="datetime-local"
                {...register("occurredAt", { valueAsDate: true })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                内容 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={8}
                placeholder="简要记录沟通内容、对方意见、约定事项等"
                {...register("content")}
              />
              {errors.content && (
                <p className="text-xs text-destructive">{errors.content.message}</p>
              )}
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
              保存
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// 兜底 select component (unused but referenced through interface)
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
