"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Prisma } from "@prisma/client";
import {
  Info,
  Wallet,
  FolderArchive,
  FolderTree,
  MessageSquare,
  Shield,
  Clock,
  Plus,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { matterCategoryColor, matterCategoryLabel, matterStatusLabel, procedureTypeLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { buildIcs, downloadIcs, type IcsEvent } from "@/lib/ics";
import { InfoPanel } from "./info-panel";
import { DocumentsPanel, type DocumentPayload } from "./documents-panel";
import { FinancePanel } from "./finance-panel";
import { InvoiceSection } from "./invoice-section";
import { NotesPanel } from "./notes-panel";
import { ProcedureContent } from "./procedure-content";
import { TimelinePanel } from "./timeline-panel";
import { AddProcedureSheet } from "./procedure-forms";
import { FoldersPanel } from "./folders-panel";
import { LifecycleActions } from "./lifecycle-actions";
import { MatterPreservationPanel } from "./matter-preservation-panel";
import type { FolderPayload, FolderDocument, TemplateSummary } from "./folder-types";
import type { PreservationRow, UserOption as PresUserOption } from "@/app/(app)/preservation/_components/preservation-types";

type MatterPayload = Prisma.MatterGetPayload<{
  include: {
    primaryClient: { include: { contacts: { where: { isPrimary: true }; take: 1 } } };
    clientLinks: { include: { client: { select: { id: true; name: true; type: true } } } };
    owner: { select: { id: true; name: true; role: true } };
    members: { include: { user: { select: { id: true; name: true; role: true } } } };
    cause: true;
    parties: true;
    relatedEntities: true;
    procedures: {
      include: {
        deadlines: true;
        hearings: true;
        stages: true;
      };
    };
    tasks: true;
    timelineEvents: true;
  };
}>;

export type FinancePayload = {
  billings: {
    id: string;
    title: string;
    contractAmount: Prisma.Decimal;
    schedule: string | null;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    signedAt: Date | null;
    createdAt: Date;
  }[];
  entries: {
    id: string;
    type: "RECEIVABLE" | "RECEIVED" | "REFUND" | "COST" | "COMMISSION";
    amount: Prisma.Decimal;
    occurredAt: Date;
    billingId: string | null;
    invoiceNo: string | null;
    payerOrPayee: string | null;
    method: string | null;
    note: string | null;
    parentFeeEntryId: string | null;
    beneficiaryUserId: string | null;
    beneficiaryUser: { id: string; name: string } | null;
    parentFeeEntry: { id: string; type: string } | null;
  }[];
  plans: {
    id: string;
    userId: string;
    percent: Prisma.Decimal;
    label: string | null;
    active: boolean;
    user: { id: string; name: string; role: string };
  }[];
  stats: {
    contractAmount: number;
    receivable: number;
    received: number;
    refund: number;
    cost: number;
    commission: number;
  };
};

type UserOption = { id: string; name: string; role: string };

export type NotePayload = {
  id: string;
  channel: "PHONE" | "WECHAT" | "EMAIL" | "MEETING" | "COURT" | "OTHER";
  withWhom: string | null;
  occurredAt: Date;
  content: string;
  tags: string[];
  author: { id: string; name: string };
  authorId: string;
  createdAt: Date;
};

type TabKey = "info" | "finance" | "documents" | "folders" | "preservation" | "notes" | "timeline" | `proc:${string}`;

export function MatterDetailTabs({
  matter,
  finance,
  userOptions,
  notes,
  documents,
  intakeContracts,
  folders,
  folderDocuments,
  templates,
  preservations,
  colleagues,
  currentUserRole
}: {
  matter: MatterPayload;
  finance: FinancePayload;
  userOptions: UserOption[];
  notes: NotePayload[];
  documents: DocumentPayload[];
  intakeContracts: DocumentPayload[];
  folders: FolderPayload[];
  folderDocuments: FolderDocument[];
  templates: TemplateSummary[];
  preservations: PreservationRow[];
  colleagues: PresUserOption[];
  currentUserRole: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("info");
  const [addProcOpen, setAddProcOpen] = useState(false);

  const engagedProcedures = matter.procedures
    .filter((p) => p.engagement === "ENGAGED")
    .sort((a, b) => a.order - b.order);

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  const categoryColor = matterCategoryColor[matter.category];
  const primaryClientName = matter.primaryClient?.name
    ?? matter.clientLinks.find((cl) => cl.isPrimary)?.client.name
    ?? matter.clientLinks[0]?.client.name
    ?? "—";
  const causeText = matter.cause?.name ?? matter.causeFreeText ?? "—";

  // 导出本案件所有时间相关条目（开庭 + 期限 + 保全到期）
  const exportMatterIcs = () => {
    const events: IcsEvent[] = [];
    for (const proc of matter.procedures) {
      const procLabel = proc.customLabel ?? procedureTypeLabel[proc.type];
      for (const h of proc.hearings) {
        events.push({
          uid: `hearing-${h.id}`,
          title: `【开庭】${matter.title} · ${procLabel} · ${h.title}`,
          start: new Date(h.startsAt),
          end: h.endsAt ? new Date(h.endsAt) : undefined,
          location: h.room ?? undefined,
          description: [
            `案件：${matter.internalCode} ${matter.title}`,
            `程序：${procLabel}`,
            h.judge ? `承办法官：${h.judge}` : null,
            h.notes ?? null
          ].filter(Boolean).join("\n"),
          reminderMinutes: [60 * 24, 60 * 2] // 提前 1 天 + 2 小时
        });
      }
      for (const d of proc.deadlines) {
        if (d.completed) continue;
        events.push({
          uid: `deadline-${d.id}`,
          title: `【期限】${matter.title} · ${d.title}`,
          start: new Date(d.dueAt),
          allDay: true,
          description: [
            `案件：${matter.internalCode} ${matter.title}`,
            `程序：${procLabel}`,
            d.basis ?? null
          ].filter(Boolean).join("\n"),
          reminderMinutes: [(d.remindDays ?? 3) * 24 * 60, 24 * 60]
        });
      }
    }
    for (const p of preservations) {
      if (p.status === "LIFTED") continue;
      events.push({
        uid: `preservation-${p.id}`,
        title: `【保全到期】${matter.title} · ${p.respondent}`,
        start: new Date(p.expiryDate),
        allDay: true,
        description: [
          `案件：${matter.internalCode} ${matter.title}`,
          `被保全人：${p.respondent}`,
          p.amount ? `金额：${Number(p.amount).toLocaleString()} 元` : null,
          p.court ? `法院：${p.court}` : null
        ].filter(Boolean).join("\n"),
        reminderMinutes: (p.remindDays ?? [30, 15, 7, 3, 1]).map((d) => d * 24 * 60)
      });
    }
    if (events.length === 0) {
      toast.warning("本案件暂无可导出的开庭 / 期限 / 保全到期");
      return;
    }
    const ics = buildIcs({ calendarName: `LawLink ${matter.title}`, events });
    downloadIcs(`${matter.internalCode}_日历.ics`, ics);
    toast.success(`已导出 ${events.length} 个事件`);
  };

  return (
    <div className="space-y-4">
      {/* H1 头部 */}
      <motion.header
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-card rounded-lg border border-border p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{matter.internalCode}</span>
              <span
                className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5"
                style={{ background: `${categoryColor}14`, color: categoryColor }}
              >
                <span className="h-1 w-1 rounded-full" />
                {matterCategoryLabel[matter.category]}
              </span>
              <Badge
                variant="outline"
                className="border-border px-1.5 text-[10px] font-normal"
              >
                {matterStatusLabel[matter.status]}
              </Badge>
            </div>
            <h1 className="mt-1.5 text-2xl italic leading-tight">
              {matter.title}
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {primaryClientName} · {causeText}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportMatterIcs}
            className="shrink-0 gap-1.5"
            title="导出本案件全部开庭 / 期限 / 保全到期为 .ics，拖入系统日历可看提醒"
          >
            <Calendar className="h-3.5 w-3.5" />
            导出日历
          </Button>
        </div>
      </motion.header>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <div
          className="flex items-end gap-5 overflow-x-auto border-b border-border scrollbar-none"
        >
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            <Info className="h-3.5 w-3.5" strokeWidth={1.8} />
            基本信息
          </TabButton>

          <TabButton active={tab === "finance"} onClick={() => setTab("finance")}>
            <Wallet className="h-3.5 w-3.5" strokeWidth={1.8} />
            财务
          </TabButton>

          <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
            <FolderArchive className="h-3.5 w-3.5" strokeWidth={1.8} />
            案件资料
            {documents.length > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
                {documents.length}
              </span>
            )}
          </TabButton>

          {/* 更多：低频 tab 收入下拉 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "mb-3.5 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-[0.82rem] text-muted-foreground transition-colors hover:text-foreground",
                  (tab === "folders" || tab === "preservation" || tab === "notes") && "text-primary font-medium"
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                更多
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setTab("folders")}>
                <FolderTree className="mr-2 h-4 w-4" />
                卷宗 {folderDocuments.length > 0 ? `(${folderDocuments.length})` : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTab("preservation")}>
                <Shield className="mr-2 h-4 w-4" />
                保全 {preservations.length > 0 ? `(${preservations.length})` : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTab("notes")}>
                <MessageSquare className="mr-2 h-4 w-4" />
                大事记 {notes.length > 0 ? `(${notes.length})` : ""}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mb-3.5 h-3 w-px bg-border" />

          {engagedProcedures.map((p, idx) => {
            const key: TabKey = `proc:${p.id}`;
            return (
              <TabButton key={p.id} active={tab === key} onClick={() => setTab(key)}>
                <span className="text-primary font-medium text-xs">{ROMAN[idx] ?? idx + 1}</span>
                <span className="text-[0.95rem] italic">
                  {p.customLabel ?? procedureTypeLabel[p.type]}
                </span>
                {p.status === "CONCLUDED" && (
                  <Badge
                    variant="outline"
                    className="ml-0.5 border-border bg-muted/30 px-1 text-[9px] font-normal"
                  >
                    已结
                  </Badge>
                )}
              </TabButton>
            );
          })}

          <button
            type="button"
            onClick={() => setAddProcOpen(true)}
            className="mb-3 inline-flex items-center gap-1 px-1 text-xs text-primary hover:text-primary/80"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
            添加程序
          </button>

          <div className="flex-1" />

          <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
            <Clock className="h-3.5 w-3.5" strokeWidth={1.8} />
            时间线
          </TabButton>
        </div>

        <div className="mt-4">
          {tab === "info" && (
            <InfoPanel matter={matter} intakeContracts={intakeContracts} userOptions={userOptions} />
          )}
          {tab === "finance" && (
            <div className="space-y-4">
              <FinancePanel matterId={matter.id} finance={finance} userOptions={userOptions} />
              <InvoiceSection matterId={matter.id} />
            </div>
          )}
          {tab === "documents" && (
            <DocumentsPanel
              matterId={matter.id}
              matterStatus={matter.status}
              documents={documents}
              procedures={matter.procedures.map((p) => ({
                id: p.id,
                label: p.customLabel ?? p.type
              }))}
              folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            />
          )}
          {tab === "folders" && (
            <FoldersPanel
              matterId={matter.id}
              matterCategory={matter.category}
              folders={folders}
              documents={folderDocuments}
              templates={templates}
            />
          )}
          {tab === "preservation" && (
            <MatterPreservationPanel
              matterId={matter.id}
              matterCode={matter.internalCode}
              matterTitle={matter.title}
              preservations={preservations}
              users={colleagues}
            />
          )}
          {tab === "notes" && <NotesPanel matterId={matter.id} notes={notes} />}
          {tab === "timeline" && <TimelinePanel events={matter.timelineEvents} />}

          {engagedProcedures.map((p) => {
            if (tab !== `proc:${p.id}`) return null;
            return <ProcedureContent key={p.id} procedure={p} />;
          })}
        </div>
      </motion.div>

      {/* 底部状态操作 */}
      {currentUserRole && (
        <footer className="mt-6 flex items-center justify-end border-t border-border pt-4">
          <LifecycleActions
            matterId={matter.id}
            status={matter.status}
            userRole={currentUserRole}
          />
        </footer>
      )}

      <AddProcedureSheet
        open={addProcOpen}
        onOpenChange={setAddProcOpen}
        matterId={matter.id}
        category={matter.category}
        nextOrder={matter.procedures.length + 1}
      />
    </div>
  );
}

function TabButton({
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
        "group relative inline-flex shrink-0 items-center gap-1.5 pb-2.5 pt-0.5 text-[13px] transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-px left-0 right-0 h-[2px] bg-primary"
        />
      )}
    </button>
  );
}

export type { MatterPayload, UserOption };
