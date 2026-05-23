"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Prisma } from "@prisma/client";
import {
  Info,
  FolderArchive,
  FolderTree,
  Clock,
  Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { procedureTypeLabel } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { InfoPanel } from "./info-panel";
import { ResourcesPanel } from "./resources-panel";
import { ProcedureContent } from "./procedure-content";
import { TimelinePanel } from "./timeline-panel";
import { AddProcedureSheet } from "./procedure-forms";
import { FoldersPanel } from "./folders-panel";
import type { DocumentPayload } from "./documents-panel";
import type { FolderPayload, FolderDocument, TemplateSummary } from "./folder-types";

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

type TabKey = "info" | "resources" | "folders" | "timeline" | `proc:${string}`;

export function MatterDetailTabs({
  matter,
  finance,
  userOptions,
  notes,
  documents,
  intakeContracts,
  folders,
  folderDocuments,
  templates
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
}) {
  const [tab, setTab] = useState<TabKey>("info");
  const [addProcOpen, setAddProcOpen] = useState(false);

  // ENGAGED 程序按 order 排序 → 每个一个 tab
  const engagedProcedures = matter.procedures
    .filter((p) => p.engagement === "ENGAGED")
    .sort((a, b) => a.order - b.order);

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      {/* 一级 tab —— 极简下划线 */}
      <div
        className="flex items-end gap-5 overflow-x-auto border-b scrollbar-none"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <TabButton active={tab === "info"} onClick={() => setTab("info")}>
          <Info className="h-3.5 w-3.5" strokeWidth={1.8} />
          基本信息
        </TabButton>

        <TabButton active={tab === "resources"} onClick={() => setTab("resources")}>
          <FolderArchive className="h-3.5 w-3.5" strokeWidth={1.8} />
          案件资料
          {matter.tasks.filter((x) => !x.completed).length > 0 && (
            <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
              {matter.tasks.filter((x) => !x.completed).length}
            </span>
          )}
        </TabButton>

        <TabButton active={tab === "folders"} onClick={() => setTab("folders")}>
          <FolderTree className="h-3.5 w-3.5" strokeWidth={1.8} />
          卷宗
          {folderDocuments.length > 0 && (
            <span className="ml-1 font-mono text-[10px] tabular text-muted-foreground">
              {folderDocuments.length}
            </span>
          )}
        </TabButton>

        <span className="mb-3.5 h-3 w-px bg-hairline" style={{ background: "hsl(var(--hairline))" }} />

        {engagedProcedures.map((p, idx) => {
          const key: TabKey = `proc:${p.id}`;
          return (
            <TabButton key={p.id} active={tab === key} onClick={() => setTab(key)}>
              <span className="ll-roman text-xs">{ROMAN[idx] ?? idx + 1}</span>
              <span className="font-display text-[0.95rem] italic">
                {p.customLabel ?? procedureTypeLabel[p.type]}
              </span>
              {p.status === "CONCLUDED" && (
                <Badge
                  variant="outline"
                  className="ml-0.5 border-hairline bg-muted/30 px-1 text-[9px] font-normal"
                  style={{ borderColor: "hsl(var(--hairline))" }}
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
        {tab === "resources" && (
          <ResourcesPanel
            matter={matter}
            notes={notes}
            documents={documents}
            finance={finance}
            userOptions={userOptions}
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
        {tab === "timeline" && <TimelinePanel events={matter.timelineEvents} />}

        {engagedProcedures.map((p) => {
          if (tab !== `proc:${p.id}`) return null;
          return <ProcedureContent key={p.id} procedure={p} />;
        })}
      </div>

      <AddProcedureSheet
        open={addProcOpen}
        onOpenChange={setAddProcOpen}
        matterId={matter.id}
        category={matter.category}
        nextOrder={matter.procedures.length + 1}
      />
    </motion.div>
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
