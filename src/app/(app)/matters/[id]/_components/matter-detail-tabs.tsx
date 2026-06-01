"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Prisma } from "@prisma/client";
import {
  Info,
  FolderArchive,
  Shield,
  Clock,
  Plus,
  Scale,
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { matterStatusLabel, procedureTypeLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { InfoPanel } from "./info-panel";
import { DocumentsPanel, type DocumentPayload } from "./documents-panel";
import { FinancePanel } from "./finance-panel";
import { ProcedureContent } from "./procedure-content";
import { ProcedureDocumentsSection } from "./procedure-documents-section";
import { ProcedureInfoPanel } from "./procedure-info-panel";
import { TimelinePanel } from "./timeline-panel";
import { NotesPanel } from "./notes-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { AddProcedureSheet } from "./procedure-forms";
import { FoldersPanel } from "./folders-panel";
import { LifecycleActions } from "./lifecycle-actions";
import { MatterPreservationPanel } from "./matter-preservation-panel";
import { CaseSearchPanel } from "./case-search-panel";
import { ApprovalsPanel } from "./approvals-panel";
import { ExpressMiniCard, type SealContractItem, type ExpressItem } from "./info-extras";
import { ArchiveStatusBanner } from "./archive-status-banner";
import { ArchiveWizardDialog } from "./archive-wizard";
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
    intake: { select: { counterclaim: true } };
    linksFrom: {
      include: { relatedMatter: { select: { id: true; internalCode: true; title: true } } };
    };
    linksTo: {
      include: { matter: { select: { id: true; internalCode: true; title: true } } };
    };
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
    invoiced: number;
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

type TabKey = "info" | "documents" | "preservation" | "cases" | "companies" | "notes" | "timeline" | `proc:${string}`;

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
  currentUserRole,
  sealContracts,
  expresses,
  latestArchive,
  customFieldDefs
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
  sealContracts: SealContractItem[];
  expresses: ExpressItem[];
  latestArchive: {
    id: string;
    archiveNo: string;
    status: "PENDING_REVIEW" | "REJECTED" | "APPROVED";
    reviewedAt: Date | null;
    reviewNote: string | null;
    archivedBy: string;
    missingItems: string[];
  } | null;
  customFieldDefs: {
    id: string;
    key: string;
    label: string;
    fieldType: "TEXT" | "NUMBER" | "DATE" | "SELECT";
    options: string[];
    required: boolean;
  }[];
}) {
  const [tab, setTab] = useState<TabKey>("info");
  const [addProcOpen, setAddProcOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const engagedProcedures = matter.procedures
    .filter((p) => p.engagement === "ENGAGED")
    .sort((a, b) => a.order - b.order);

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  return (
    <div className="space-y-4">
      {/* H1 头部 - 精简：仅标题 + 状态 + 导出 + 状态操作 */}
      <motion.header
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-3"
      >
        <h1 className="min-w-0 flex-1 truncate text-[1.125rem] font-medium leading-snug">
          {matter.title}
        </h1>
        <MatterStatusPill status={matter.status} />
        {currentUserRole && (
          <LifecycleActions
            matterId={matter.id}
            status={matter.status}
            userRole={currentUserRole}
          />
        )}
      </motion.header>

      {/* v0.18: 归档状态 banner（驳回 / 审批中） */}
      {latestArchive && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <ArchiveStatusBanner
            record={latestArchive}
            onReArchive={
              latestArchive.status === "REJECTED" &&
              (currentUserRole === "ADMIN" || currentUserRole === "PRINCIPAL_LAWYER")
                ? () => setArchiveOpen(true)
                : undefined
            }
          />
        </motion.div>
      )}

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <div
          className="flex items-end gap-1 overflow-x-auto border-b border-border scrollbar-none"
        >
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            <Info className="h-3.5 w-3.5" strokeWidth={1.8} />
            基本信息
          </TabButton>

          <span className="mb-3.5 h-3 w-px bg-border" />

          {engagedProcedures.map((p, idx) => {
            const key: TabKey = `proc:${p.id}`;
            return (
              <TabButton key={p.id} active={tab === key} onClick={() => setTab(key)}>
                <span className="text-primary font-medium text-[11px]">{ROMAN[idx] ?? idx + 1}</span>
                <span>{p.customLabel ?? procedureTypeLabel[p.type]}</span>
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

          <span className="mb-3.5 h-3 w-px bg-border" />

          {/*
            v0.27: 案卷材料 tab 取消，材料合并到各程序下的"案件材料"区。
            DocumentsPanel 代码保留（供后续可能的"全部材料"视图用），UI 入口隐藏。
          */}
          {false && (
            <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
              <FolderArchive className="h-3.5 w-3.5" strokeWidth={1.8} />
              案卷材料
              {documents.length > 0 && (
                <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
                  {documents.length}
                </span>
              )}
            </TabButton>
          )}

          <TabButton active={tab === "preservation"} onClick={() => setTab("preservation")}>
            <Shield className="h-3.5 w-3.5" strokeWidth={1.8} />
            保全
            {preservations.length > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
                {preservations.length}
              </span>
            )}
          </TabButton>

          {/*
            v0.27: 类案 tab 暂时隐藏（功能完整保留在 case-search-panel.tsx，PRD §A3 已说明）。
            未来开放时去掉此 false 即可。
          */}
          {false && (
            <TabButton active={tab === "cases"} onClick={() => setTab("cases")}>
              <Scale className="h-3.5 w-3.5" strokeWidth={1.8} />
              类案
            </TabButton>
          )}

          <div className="flex-1" />

          <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.8} />
            沟通
            {notes.length > 0 && (
              <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
                {notes.length}
              </span>
            )}
          </TabButton>

          <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
            <Clock className="h-3.5 w-3.5" strokeWidth={1.8} />
            时间线
          </TabButton>
        </div>

        <div className="mt-4">
          {tab === "info" && (
            <div className="space-y-4">
              <InfoPanel matter={matter} userOptions={userOptions} finance={finance} />
              <ApprovalsPanel
                matterId={matter.id}
                matterTitle={matter.title}
                sealContracts={sealContracts}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <FinancePanel matterId={matter.id} finance={finance} userOptions={userOptions} />
                </div>
                <div className="lg:col-span-4">
                  <ExpressMiniCard expresses={expresses} matterId={matter.id} />
                </div>
              </div>
              <CustomFieldsPanel
                matterId={matter.id}
                defs={customFieldDefs}
                values={
                  (matter.customValues &&
                  typeof matter.customValues === "object" &&
                  !Array.isArray(matter.customValues)
                    ? (matter.customValues as Record<string, string>)
                    : {})
                }
              />
            </div>
          )}
          {/* v0.27: 案卷材料 tab 内容不再渲染（材料挪到各程序下） */}
          {false && tab === "documents" && (
            <div className="space-y-4">
              <FoldersPanel
                matterId={matter.id}
                matterCategory={matter.category}
                folders={folders}
                documents={folderDocuments}
                templates={templates}
              />
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
            </div>
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
          {/* v0.27: 类案 tab 暂时隐藏 */}
          {false && tab === "cases" && (
            <CaseSearchPanel
              matterId={matter.id}
              matterCategory={matter.category}
              defaultCauseName={matter.cause?.name ?? null}
            />
          )}
          {tab === "notes" && <NotesPanel matterId={matter.id} notes={notes} />}
          {tab === "timeline" && <TimelinePanel events={matter.timelineEvents} />}

          {engagedProcedures.map((p) => {
            if (tab !== `proc:${p.id}`) return null;
            const procDocs = documents
              .filter((d) => d.procedureId === p.id)
              .map((d) => ({
                id: d.id,
                name: d.name,
                category: d.category,
                mimeType: d.mimeType,
                size: d.size,
                createdAt: d.createdAt,
                sourceParty: d.sourceParty,
                path: d.path
              }));
            return (
              <div key={p.id} className="space-y-4">
                <ProcedureInfoPanel procedure={p} />
                <ProcedureContent procedure={p} />
                {/* v0.27: 程序下"案件材料"区，替代原全局案卷材料 tab */}
                <ProcedureDocumentsSection
                  matterId={matter.id}
                  procedureId={p.id}
                  documents={procDocs}
                  parties={matter.parties}
                />
              </div>
            );
          })}
        </div>
      </motion.div>

      <AddProcedureSheet
        open={addProcOpen}
        onOpenChange={setAddProcOpen}
        matterId={matter.id}
        category={matter.category}
        nextOrder={matter.procedures.length + 1}
      />
      <ArchiveWizardDialog
        matterId={matter.id}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </div>
  );
}

function MatterStatusPill({ status }: { status: MatterPayload["status"] }) {
  const map: Record<MatterPayload["status"], { label: string; cls: string }> = {
    PENDING_ACCEPTANCE: {
      label: matterStatusLabel.PENDING_ACCEPTANCE,
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30"
    },
    IN_PROGRESS: {
      label: matterStatusLabel.IN_PROGRESS,
      cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    },
    ON_HOLD: {
      label: matterStatusLabel.ON_HOLD,
      cls: "bg-slate-400/15 text-slate-700 border-slate-400/30"
    },
    CLOSED: {
      label: matterStatusLabel.CLOSED,
      cls: "bg-blue-500/15 text-blue-700 border-blue-500/30"
    },
    ARCHIVED: {
      label: matterStatusLabel.ARCHIVED,
      cls: "bg-purple-500/15 text-purple-700 border-purple-500/30"
    }
  };
  const m = map[status];
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[12px] font-medium",
        m.cls
      )}
    >
      {m.label}
    </span>
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
        "group relative inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 pb-2.5 pt-2 text-[13px] transition-colors",
        active
          ? "bg-card text-primary font-medium border border-b-transparent border-border"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
