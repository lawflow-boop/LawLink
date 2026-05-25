"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Inbox,
  Plus,
  Gavel,
  Clock,
  CheckCircle2,
  Trash2,
  Link as LinkIcon,
  Briefcase,
  ExternalLink,
  Phone,
  Loader2,
  Sparkles,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { matchSmsToMatter, markSmsProcessed, deleteSms } from "@/server/sms/actions";
import {
  SMS_TYPE_CN,
  SMS_TYPE_ACCENT,
  type SmsRow,
  type MatterOption,
  type ParsedJson
} from "./sms-types";
import { SmsPasteDialog } from "./sms-paste-dialog";
import { GenerateHearingDialog, GenerateDeadlineDialog } from "./sms-actions-dialogs";

type Tab = "unprocessed" | "processed";

export function InboxView({
  unprocessed,
  processed,
  matters
}: {
  unprocessed: SmsRow[];
  processed: SmsRow[];
  matters: MatterOption[];
}) {
  const [tab, setTab] = useState<Tab>(unprocessed.length > 0 ? "unprocessed" : "processed");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [hearingTarget, setHearingTarget] = useState<{
    sms: SmsRow;
    matter: NonNullable<SmsRow["matchedMatter"]>;
  } | null>(null);
  const [deadlineTarget, setDeadlineTarget] = useState<{
    sms: SmsRow;
    matter: NonNullable<SmsRow["matchedMatter"]>;
  } | null>(null);

  const rows = tab === "unprocessed" ? unprocessed : processed;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl italic">收件箱</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            粘贴 12368 / 法院短信 → 自动解析 → 一键生成开庭 / 期限
          </p>
        </div>
        <Button onClick={() => setPasteOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          粘贴短信
        </Button>
      </div>

      {/* Tab */}
      <div className="border-b border-border">
        <div className="flex gap-5">
          <TabBtn active={tab === "unprocessed"} onClick={() => setTab("unprocessed")}>
            待处理
            <Count n={unprocessed.length} hot={unprocessed.length > 0} />
          </TabBtn>
          <TabBtn active={tab === "processed"} onClick={() => setTab("processed")}>
            已处理
            <Count n={processed.length} />
          </TabBtn>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-2"
      >
        {rows.length === 0 ? (
          <div className="ll-surface rounded-lg border border-border p-12 text-center text-sm text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
            {tab === "unprocessed" ? "无待处理短信" : "暂无已处理记录"}
          </div>
        ) : (
          rows.map((sms) => (
            <SmsCard
              key={sms.id}
              sms={sms}
              matters={matters}
              onGenerateHearing={() => {
                if (sms.matchedMatter) setHearingTarget({ sms, matter: sms.matchedMatter });
              }}
              onGenerateDeadline={() => {
                if (sms.matchedMatter) setDeadlineTarget({ sms, matter: sms.matchedMatter });
              }}
            />
          ))
        )}
      </motion.div>

      <SmsPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />

      {hearingTarget && (
        <GenerateHearingDialog
          open
          onOpenChange={(o) => !o && setHearingTarget(null)}
          sms={hearingTarget.sms}
          matter={hearingTarget.matter}
        />
      )}
      {deadlineTarget && (
        <GenerateDeadlineDialog
          open
          onOpenChange={(o) => !o && setDeadlineTarget(null)}
          sms={deadlineTarget.sms}
          matter={deadlineTarget.matter}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 pb-2.5 pt-1 text-[13px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {active && <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-primary" />}
    </button>
  );
}

function Count({ n, hot }: { n: number; hot?: boolean }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center justify-center rounded-full px-1.5 font-mono text-[10px]",
        hot ? "bg-amber-500/15 text-amber-700" : "bg-muted/60 text-muted-foreground"
      )}
    >
      {n}
    </span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SmsCard({
  sms,
  matters,
  onGenerateHearing,
  onGenerateDeadline
}: {
  sms: SmsRow;
  matters: MatterOption[];
  onGenerateHearing: () => void;
  onGenerateDeadline: () => void;
}) {
  const parsed = sms.parsedJson as unknown as ParsedJson;
  const accent = SMS_TYPE_ACCENT[sms.smsType];
  const [pending, startTransition] = useTransition();
  const [showRaw, setShowRaw] = useState(false);

  const onMarkProcessed = () =>
    startTransition(async () => {
      try {
        await markSmsProcessed({ id: sms.id });
        toast.success("已标记处理");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });

  const onDelete = () => {
    if (!confirm("确认删除这条短信记录？")) return;
    startTransition(async () => {
      try {
        await deleteSms({ id: sms.id });
        toast.success("已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <div className="ll-surface rounded-lg border border-border p-4">
      {/* 头：类型徽 + 法院 + 案号 + 时间 + 来源标 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${accent}1A`, color: accent }}
        >
          {SMS_TYPE_CN[sms.smsType]}
        </span>
        {parsed.court && <span className="text-foreground/80">{parsed.court}</span>}
        {parsed.caseNumbers.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {parsed.caseNumbers.join("、")}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {new Date(sms.receivedAt).toLocaleString("zh-CN")}
        </span>
      </div>

      {/* 摘要 + AI 增强字段 */}
      <div className="mt-2 space-y-1">
        <div className="flex items-start gap-2">
          {parsed.aiEnriched && (
            <span
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              title="AI 增强解析"
            >
              <Sparkles className="h-3 w-3" />
              AI
            </span>
          )}
          <p className="line-clamp-2 text-[13px] text-foreground/85">{parsed.summary}</p>
        </div>
        {parsed.action && (
          <div className="flex items-baseline gap-1.5 text-[12px]">
            <ArrowRight className="h-3 w-3 shrink-0 text-primary/70" />
            <span className="text-muted-foreground">应对：</span>
            <span className="text-foreground/90">{parsed.action}</span>
            {parsed.urgency && <UrgencyBadge level={parsed.urgency} />}
          </div>
        )}
      </div>

      {/* 字段栏 */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {parsed.hearingDate && (
          <Field icon={<Gavel className="h-3 w-3" />}>开庭：{parsed.hearingDate}</Field>
        )}
        {parsed.courtRoom && <Field>{parsed.courtRoom}</Field>}
        {parsed.judge && <Field>法官：{parsed.judge}</Field>}
        {parsed.clerk && <Field>书记员：{parsed.clerk}</Field>}
        {parsed.phones.map((p) => (
          <Field key={p} icon={<Phone className="h-3 w-3" />}>
            <a href={`tel:${p}`} className="hover:text-foreground">
              {p}
            </a>
          </Field>
        ))}
        {parsed.appealDeadline && <Field>上诉期：{parsed.appealDeadline}</Field>}
        {parsed.judgmentDate && <Field>判决日：{parsed.judgmentDate}</Field>}
        {parsed.urls.length > 0 &&
          parsed.urls.map((u, i) => (
            <Field key={u} icon={<ExternalLink className="h-3 w-3" />}>
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {parsed.platforms[i] ?? `链接 ${i + 1}`}
              </a>
            </Field>
          ))}
      </div>

      {/* 关联案件 + 操作行 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {sms.matchedMatter ? (
          <Link
            href={`/matters/${sms.matchedMatter.id}`}
            className="group inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] hover:bg-primary/10"
          >
            <Briefcase className="h-3 w-3 text-primary" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {sms.matchedMatter.internalCode}
            </span>
            <span className="truncate font-medium">{sms.matchedMatter.title}</span>
            {sms.matchedBy === "AUTO_CASE_NUMBER" && (
              <span className="ml-0.5 rounded bg-muted/60 px-1 text-[9px] text-muted-foreground">
                自动
              </span>
            )}
          </Link>
        ) : (
          <MatterPicker sms={sms} matters={matters} />
        )}

        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showRaw ? "收起原文" : "查看原文"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {!sms.processed && sms.matchedMatter && (
            <>
              {sms.smsType === "HEARING_NOTICE" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onGenerateHearing}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Gavel className="h-3 w-3" />
                  生成开庭
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerateDeadline}
                className="h-7 gap-1 text-[11px]"
              >
                <Clock className="h-3 w-3" />
                生成期限
              </Button>
            </>
          )}
          {!sms.processed && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onMarkProcessed}
              disabled={pending}
              className="h-7 gap-1 text-[11px]"
            >
              <CheckCircle2 className="h-3 w-3" />
              标为已处理
            </Button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="text-muted-foreground hover:text-destructive"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showRaw && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-3 font-sans text-[11px] leading-relaxed text-foreground/80">
          {sms.rawText}
        </pre>
      )}
    </div>
  );
}

function Field({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon && <span className="text-muted-foreground/70">{icon}</span>}
      {children}
    </span>
  );
}

function UrgencyBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const meta = {
    HIGH: { label: "紧急", color: "#DC2626", bg: "rgb(248 113 113 / 0.12)" },
    MEDIUM: { label: "本周", color: "#D97706", bg: "rgb(252 211 77 / 0.15)" },
    LOW: { label: "知悉", color: "#737373", bg: "rgb(229 229 229 / 0.5)" }
  }[level];
  return (
    <span
      className="ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]"
      style={{ background: meta.bg, color: meta.color }}
    >
      <AlertCircle className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

// 行内小 Combobox：手动指派 Matter
function MatterPicker({ sms, matters }: { sms: SmsRow; matters: MatterOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onPick = (matterId: string) => {
    startTransition(async () => {
      try {
        await matchSmsToMatter({ smsId: sms.id, matterId });
        toast.success("已关联案件");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
          指派案件
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索编号或案件名..." />
          <CommandList>
            <CommandEmpty>未找到</CommandEmpty>
            <CommandGroup>
              {matters.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.internalCode} ${m.title}`}
                  onSelect={() => onPick(m.id)}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {m.internalCode}
                  </span>
                  <span className="ml-2 truncate text-[12px]">{m.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
