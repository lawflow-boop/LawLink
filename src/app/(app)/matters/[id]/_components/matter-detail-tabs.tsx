"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { ClientType, DocumentCategory, Prisma } from "@prisma/client";
import {
  CheckCircle2,
  CircleDashed,
  Info,
  Plus,
  Pencil,
  ShieldAlert,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { matterStatusLabel, procedureTypeLabel, matterCategoryKind } from "@/lib/enums";
import { buildPggCaseworkGate, type PggCaseworkGateStatus } from "@/lib/pgg-casework-gate";
import { cn } from "@/lib/utils";
import { InfoPanel } from "./info-panel";
import { FinancePanel } from "./finance-panel";
import { ProcedureRemindersAndMemos } from "./procedure-content";
import { ProcedureDocumentsSection } from "./procedure-documents-section";
import { ProcedureInfoPanel } from "./procedure-info-panel";

import { ApprovalsPanel } from "./approvals-panel";
import type { SealContractItem, ExpressItem } from "./info-extras";
import { AddProcedureSheet } from "./procedure-forms";
import { deleteProcedure } from "@/server/procedures/actions";
import { useRouter } from "next/navigation";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { LifecycleActions } from "./lifecycle-actions";
import { ArchiveStatusBanner } from "./archive-status-banner";
import { ArchiveWizardDialog } from "./archive-wizard";
import type { FolderPayload, FolderDocument, TemplateSummary } from "./folder-types";
import type { PreservationCaseRow, UserOption as PresUserOption } from "@/app/(app)/preservation/_components/preservation-types";

type MatterPayload = Prisma.MatterGetPayload<{
  include: {
    primaryClient: { include: { contacts: { where: { isPrimary: true }; take: 1 } } };
    clientLinks: { include: { client: { select: { id: true; name: true; type: true; idNumber: true } } } };
    owner: { select: { id: true; name: true; role: true } };
    members: { include: { user: { select: { id: true; name: true; role: true } } } };
    cause: true;
    parties: true;
    relatedEntities: true;
    intake: { select: { counterclaim: true; claimDescription: true } };
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
        procedureParties: { include: { party: true } };
        memos: true;
      };
    };
    timelineEvents: true;
    _count: { select: { tasks: true; notes: true } };
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

/** 案件详情页文档类型（附带 uploader 和 procedure 信息） */
export type MatterDocument = {
  id: string;
  name: string;
  category: DocumentCategory;
  procedureId: string | null;
  mimeType: string | null;
  size: number | null;
  path: string;
  tags: string[];
  createdAt: Date;
  sourceParty: string | null;
  uploadedBy: { id: string; name: string } | null;
  procedure: { id: string; type: string; customLabel: string | null } | null;
  folderId: string | null;
  templateId: string | null;
};

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

export function MatterDetailTabs({
  matter,
  finance,
  userOptions,
  documents,
  intakeContracts,
  folders,
  folderDocuments,
  templates,
  preservations,
  colleagues,
  currentUserRole,
  canAssociateThisMatter,
  canLeadThisMatter,
  canOwnThisMatter,
  sealContracts,
  expresses,
  latestArchive,
  customFieldDefs
}: {
  matter: MatterPayload;
  finance: FinancePayload;
  userOptions: UserOption[];
  documents: MatterDocument[];
  intakeContracts: MatterDocument[];
  folders: FolderPayload[];
  folderDocuments: FolderDocument[];
  templates: TemplateSummary[];
  preservations: PreservationCaseRow[];
  colleagues: PresUserOption[];
  currentUserRole: string | null;
  canAssociateThisMatter: boolean;
  canLeadThisMatter: boolean;
  canOwnThisMatter: boolean;
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
  const [selectedProcId, setSelectedProcId] = useState<string | null>(null);
  const [addProcOpen, setAddProcOpen] = useState(false);
  const [procEditOpen, setProcEditOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDeleteProcedure(id: string) {
    startTransition(async () => {
      try {
        await deleteProcedure(id);
        toast.success("程序已删除");
        router.refresh();
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }
  const [archiveOpen, setArchiveOpen] = useState(false);

  const engagedProcedures = matter.procedures
    .filter((p) => p.engagement === "ENGAGED")
    .sort((a, b) => a.order - b.order);

  // 默认选中第一个在办程序（若有）
  const currentProcedure = selectedProcId
    ? engagedProcedures.find((p) => p.id === selectedProcId)
    : engagedProcedures[0] ?? null;

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  // 当前选中程序的文档
  const procDocs = currentProcedure
    ? documents
        .filter((d) => d.procedureId === currentProcedure.id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          mimeType: d.mimeType,
          size: d.size,
          createdAt: d.createdAt,
          sourceParty: d.sourceParty,
          path: d.path
        }))
    : [];
  const procedureParties = buildProcedurePartyOptions(matter);
  const customValues =
    matter.customValues &&
    typeof matter.customValues === "object" &&
    !Array.isArray(matter.customValues)
      ? (matter.customValues as Record<string, unknown>)
      : {};
  const hasCustomFields = customFieldDefs.length > 0;
  const hasPggIntegration = Boolean(customValues.pgg_source_path || customValues.pgg_deep_import);
  const customStringValues = Object.fromEntries(
    Object.entries(customValues).map(([key, value]) => [
      key,
      typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)
    ])
  ) as Record<string, string>;

  return (
    <div className="space-y-4">
      {/* H1 头部 */}
      <motion.header
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2"
      >
        <h1 className="min-w-0 flex-1 truncate text-[0.95rem] font-medium leading-tight" title={matter.title}>
          {matter.title}
          {matterCategoryKind(matter.category) !== "project" && "案"}
        </h1>
        <MatterStatusPill status={matter.status} />
        {currentUserRole && canLeadThisMatter && (
          <LifecycleActions
            matterId={matter.id}
            status={matter.status}
            canArchive={canLeadThisMatter}
          />
        )}
      </motion.header>

      {/* 归档状态 banner */}
      {latestArchive && (
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <ArchiveStatusBanner
            record={latestArchive}
            onReArchive={
              latestArchive.status === "REJECTED" &&
              canLeadThisMatter
                ? () => setArchiveOpen(true)
                : undefined
            }
          />
        </motion.div>
      )}

      {/* 单页竖向布局 */}
      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="grid grid-cols-1 gap-4 xl:grid-cols-5"
      >
        <div className="h-full xl:col-span-3">
          <InfoPanel
            matter={matter}
            userOptions={userOptions}
            finance={finance}
            contracts={intakeContracts.map((d) => ({ id: d.id, name: d.name }))}
            canEditMatter={canOwnThisMatter}
            canManageRelatedMatters={canAssociateThisMatter}
          />
        </div>

        <div className="h-full xl:col-span-2">
          <ProcedureRemindersAndMemos
            matterId={matter.id}
            procedures={engagedProcedures}
            currentProcedureId={currentProcedure?.id ?? ""}
            expresses={expresses}
            canManage={canAssociateThisMatter}
          />
        </div>

        <section className="h-full rounded-lg border border-border bg-card xl:col-span-3">
          {/* 程序切换标签 */}
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-[13px] font-medium">案件程序</span>
            {engagedProcedures.length === 0 ? (
              <span className="text-xs text-muted-foreground">暂无在办程序</span>
            ) : (
              engagedProcedures.map((p, idx) => {
                const isActive = currentProcedure?.id === p.id;
                return (
                  <span
                    key={p.id}
                    className={cn(
                      "group/proc inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    <button
                      type="button"
                      onPointerDown={() => setSelectedProcId(p.id)}
                      onClick={() => setSelectedProcId(p.id)}
                      className="flex items-center gap-1.5"
                    >
                      <span className="font-medium text-primary">{ROMAN[idx] ?? idx + 1}</span>
                      <span>{p.customLabel ?? procedureTypeLabel[p.type]}</span>
                      {p.status === "CONCLUDED" && (
                        <Badge
                          variant="outline"
                          className="ml-0.5 border-border bg-muted/30 px-1 text-[9px] font-normal"
                        >
                          已结
                        </Badge>
                      )}
                    </button>
                    {canLeadThisMatter && (
                      <button
                        type="button"
                        onClick={() => {
                          const label = p.customLabel ?? procedureTypeLabel[p.type];
                          if (confirm(`确定删除程序「${label}」？该程序下的所有开庭、期限、备忘和材料记录将被一并删除，此操作不可撤销。`)) {
                            handleDeleteProcedure(p.id);
                          }
                        }}
                        className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/proc:opacity-100"
                        title="删除此程序"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })
            )}
            {canAssociateThisMatter && (
              <button
                type="button"
                onPointerDown={() => setAddProcOpen(true)}
                onClick={() => setAddProcOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
                添加程序
              </button>
            )}
            {currentProcedure && canAssociateThisMatter && (
              <Button
                variant="ghost"
                size="sm"
                onPointerDown={() => setProcEditOpen(true)}
                onClick={() => setProcEditOpen(true)}
                className="ml-auto h-6 gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.8} />
                编辑
              </Button>
            )}
          </header>

          {/* 当前程序内容：基本信息 + 案件材料 */}
          {currentProcedure ? (
            <div className="space-y-4 p-4">
              <ProcedureInfoPanel
                procedure={currentProcedure}
                parties={procedureParties}
                requestContent={matter.intake?.claimDescription ?? null}
                editOpen={procEditOpen}
                onEditOpenChange={setProcEditOpen}
              />
              <ProcedureDocumentsSection
                matterId={matter.id}
                procedureId={currentProcedure.id}
                documents={procDocs}
                procedureParties={currentProcedure.procedureParties}
                canManage={canAssociateThisMatter}
              />
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              请先添加程序以管理开庭、期限和案件材料
            </p>
          )}
        </section>

        <div className="flex h-full flex-col gap-4 xl:col-span-2 [&>section]:min-h-0 [&>section]:flex-1">
          <ApprovalsPanel
            matterId={matter.id}
            matterTitle={matter.title}
            sealContracts={sealContracts}
            canRequest={canAssociateThisMatter}
          />
          <FinancePanel
            matterId={matter.id}
            finance={finance}
            userOptions={userOptions}
            canRequestInvoice={canAssociateThisMatter}
          />
        </div>

        {hasPggIntegration && (
          <div className="xl:col-span-5">
            <PggIntegrationPanel
              values={customValues}
              documents={documents}
              procedureCount={matter.procedures.length}
              partyCount={matter.parties.length + matter.clientLinks.length + (matter.primaryClient ? 1 : 0)}
              taskCount={matter._count.tasks}
              noteCount={matter._count.notes}
              timelineCount={matter.timelineEvents.length}
            />
          </div>
        )}

        {hasCustomFields && (
          <div className="xl:col-span-3">
            <CustomFieldsPanel
              matterId={matter.id}
              defs={customFieldDefs}
              values={customStringValues}
              canEdit={canLeadThisMatter}
            />
          </div>
        )}

      </motion.div>

      {canAssociateThisMatter && (
        <AddProcedureSheet
          open={addProcOpen}
          onOpenChange={setAddProcOpen}
          matterId={matter.id}
          category={matter.category}
          nextOrder={matter.procedures.length + 1}
          colleagues={colleagues}
          existingTypes={matter.procedures.map(p => p.type)}
        />
      )}
      {canLeadThisMatter && (
        <ArchiveWizardDialog
          matterId={matter.id}
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
        />
      )}
    </div>
  );
}

function PggIntegrationPanel({
  values,
  documents,
  procedureCount,
  partyCount,
  taskCount,
  noteCount,
  timelineCount
}: {
  values: Record<string, unknown>;
  documents: MatterDocument[];
  procedureCount: number;
  partyCount: number;
  taskCount: number;
  noteCount: number;
  timelineCount: number;
}) {
  const sourcePath = typeof values.pgg_source_path === "string" ? values.pgg_source_path : "";
  const summary = typeof values.pgg_extraction_summary === "string" ? values.pgg_extraction_summary : "";
  const stageName = typeof values.pgg_stage_name === "string" ? values.pgg_stage_name : "";
  const amountFragments = typeof values.pgg_amount_fragments === "string" ? values.pgg_amount_fragments : "";
  const dateFragments = typeof values.pgg_date_fragments === "string" ? values.pgg_date_fragments : "";
  const deepImport =
    values.pgg_deep_import && typeof values.pgg_deep_import === "object" && !Array.isArray(values.pgg_deep_import)
      ? (values.pgg_deep_import as { taskHints?: string[]; factSnippets?: string[]; counts?: Record<string, number> })
      : null;
  const pggDocs = documents.filter((doc) => doc.tags?.includes("PGG深度导入") || doc.tags?.includes("PGG历史导入"));
  const evidenceCount = pggDocs.filter((doc) => doc.category === "EVIDENCE").length;
  const pleadingCount = pggDocs.filter((doc) => doc.category === "PLEADING" || doc.category === "CONTRACT").length;
  const receiptCount = pggDocs.filter((doc) => doc.tags?.includes("receipt/审计")).length;
  const fileHref = sourcePath ? `file://${sourcePath}` : undefined;
  const gate = buildPggCaseworkGate({
    values,
    documents,
    procedureCount,
    partyCount,
    taskCount: Math.max(taskCount, deepImport?.taskHints?.length ?? 0),
    noteCount,
    timelineCount
  });

  return (
    <section className="rounded-lg border border-primary/20 bg-primary/5">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-4 py-2">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-primary" />
          <span className="text-[13px] font-medium">PGG 办案系统嵌入</span>
          <Badge variant="outline" className="border-primary/25 bg-background/60 text-[10px] text-primary">
            深度同步
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", gate.deliveryStatus === "trusted_ready" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-amber-500/30 bg-amber-500/10 text-amber-700")}>
            {gate.summary.satisfied}/{gate.summary.total} 六角色
          </Badge>
        </div>
        {fileHref && (
          <a
            href={fileHref}
            className="rounded-md border border-primary/20 bg-background/70 px-2 py-1 text-[11px] text-primary hover:bg-background"
            title={sourcePath}
          >
            打开本机案卷
          </a>
        )}
      </header>
      <div className="grid gap-3 p-4 text-[12px] text-foreground/85 lg:grid-cols-4">
        <div className="rounded-md border border-border/70 bg-background/60 p-3">
          <div className="text-muted-foreground">来源案卷</div>
          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed">{sourcePath || "—"}</div>
          {stageName && <div className="mt-2 text-muted-foreground">阶段：{stageName}</div>}
        </div>
        <div className="rounded-md border border-border/70 bg-background/60 p-3">
          <div className="text-muted-foreground">同步材料</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><div className="text-lg font-semibold">{pggDocs.length}</div><div className="text-[10px] text-muted-foreground">全部</div></div>
            <div><div className="text-lg font-semibold">{evidenceCount}</div><div className="text-[10px] text-muted-foreground">证据</div></div>
            <div><div className="text-lg font-semibold">{receiptCount}</div><div className="text-[10px] text-muted-foreground">回执</div></div>
          </div>
          <div className="mt-2 text-muted-foreground">文书/合同：{pleadingCount} 份</div>
        </div>
        <div className="rounded-md border border-border/70 bg-background/60 p-3">
          <div className="text-muted-foreground">金额 / 日期片段</div>
          <p className="mt-1 line-clamp-3 leading-relaxed">{amountFragments || "未稳定识别金额"}</p>
          <p className="mt-2 line-clamp-2 text-muted-foreground">{dateFragments || "未稳定识别日期"}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/60 p-3">
          <div className="text-muted-foreground">复核任务</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed">
            {(deepImport?.taskHints ?? []).slice(0, 4).map((task) => <li key={task}>{task}</li>)}
            {(deepImport?.taskHints?.length ?? 0) === 0 && <li>暂无自动生成任务</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-primary/15 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-medium text-foreground/80">六角色可信办案门禁</div>
          <div className="text-[11px] text-muted-foreground">
            已满足 {gate.summary.satisfied} · 部分 {gate.summary.partial} · 阻断 {gate.summary.blocked}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {gate.roles.map((role) => (
            <div key={role.key} className="rounded-md border border-border/70 bg-background/70 p-3 text-[11px]">
              <div className="flex items-center gap-2">
                <CaseworkGateIcon status={role.status} />
                <span className="font-medium text-foreground/85">{role.label}</span>
                <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[10px]", caseworkStatusClass(role.status))}>
                  {caseworkStatusLabel(role.status)}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {(role.evidence.length ? role.evidence : role.missing).slice(0, 2).map((item) => (
                  <div key={item} className="line-clamp-1">{item}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={cn("mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed", gate.deliveryStatus === "trusted_ready" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-amber-500/20 bg-amber-500/10 text-amber-700")}>
          {gate.boundary}
        </div>
      </div>
      {summary && (
        <div className="border-t border-primary/15 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
          <div className="mb-1 font-medium text-foreground/80">同步摘要</div>
          <pre className="whitespace-pre-wrap font-sans">{summary}</pre>
        </div>
      )}
    </section>
  );
}

function CaseworkGateIcon({ status }: { status: PggCaseworkGateStatus }) {
  if (status === "satisfied") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "partial") return <CircleDashed className="h-3.5 w-3.5 text-amber-600" />;
  return <ShieldAlert className="h-3.5 w-3.5 text-destructive" />;
}

function caseworkStatusLabel(status: PggCaseworkGateStatus) {
  if (status === "satisfied") return "已满足";
  if (status === "partial") return "部分";
  return "阻断";
}

function caseworkStatusClass(status: PggCaseworkGateStatus) {
  if (status === "satisfied") return "bg-emerald-500/10 text-emerald-700";
  if (status === "partial") return "bg-amber-500/10 text-amber-700";
  return "bg-destructive/10 text-destructive";
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

function clientTypeToPartyType(type: ClientType) {
  if (type === "INDIVIDUAL") return "NATURAL_PERSON";
  if (type === "COMPANY") return "COMPANY";
  return "OTHER_ORG";
}

function buildProcedurePartyOptions(matter: MatterPayload) {
  const parties = [...matter.parties];
  const seenClientNames = new Set(
    parties.filter((party) => party.role === "CLIENT_PARTY").map((party) => party.name.trim())
  );
  const clients = [
    ...(matter.primaryClient ? [matter.primaryClient] : []),
    ...matter.clientLinks.map((link) => link.client)
  ];
  const seenClientIds = new Set<string>();

  for (const client of clients) {
    if (seenClientIds.has(client.id) || seenClientNames.has(client.name.trim())) continue;
    seenClientIds.add(client.id);
    parties.push({
      id: `client:${client.id}`,
      matterId: matter.id,
      intakeId: null,
      role: "CLIENT_PARTY",
      standing: null,
      ordinal: 0,
      name: client.name,
      partyType: clientTypeToPartyType(client.type),
      idNumber: client.type === "INDIVIDUAL" ? client.idNumber : null,
      phone: null,
      address: null,
      legalRep: null,
      contactName: null,
      enterpriseId: null,
      enterpriseSocialCode: client.type === "INDIVIDUAL" ? null : client.idNumber,
      enterpriseName: client.type === "INDIVIDUAL" ? null : client.name,
      enterpriseBoundAt: null,
      notes: "案件关联客户",
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  return parties;
}

export type { MatterPayload, UserOption };
