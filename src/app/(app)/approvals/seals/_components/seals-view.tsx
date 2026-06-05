"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Stamp, Plus, FileText, AlertOctagon, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SealRequestSheet
} from "./seal-request-sheet";
import { SealActionsDialogs } from "./seal-actions-dialogs";
import {
  type SealRequestRow,
  type SealTypeConfigRow,
  type MatterOption,
  SEAL_TYPE_CN,
  SEAL_STATUS_CN,
  SEAL_STATUS_COLOR
} from "./seal-types";

type Tab = "allMine" | "pending" | "processed" | "toApprove" | "firm";

export function SealsView({
  mine,
  toApprove,
  all,
  configs,
  stats,
  matters,
  currentUser,
  capabilities,
  presetFromQuery
}: {
  mine: SealRequestRow[];
  toApprove: SealRequestRow[];
  all: SealRequestRow[];
  configs: SealTypeConfigRow[];
  stats: { monthStamped: number; pendingApprovalCount: number; waitingStampCount: number };
  matters: MatterOption[];
  currentUser: { id: string; role: string };
  capabilities: { canApprove: boolean; canViewFirmQueue: boolean };
  presetFromQuery: {
    draftDocId?: string;
    matterId?: string;
    documentTitle?: string;
  } | null;
}) {
  const [tab, setTab] = useState<Tab>(
    capabilities.canApprove && toApprove.length > 0 ? "toApprove" : "allMine"
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    row: SealRequestRow;
    action: "detail" | "approve" | "reject" | "stamp" | "cancel";
  } | null>(null);

  // 卷宗联动：URL 带 ?new=1 自动打开新建 Sheet
  useEffect(() => {
    if (presetFromQuery?.draftDocId) {
      setSheetOpen(true);
    }
  }, [presetFromQuery]);

  const minePending = useMemo(() => mine.filter((r) => r.status === "PENDING"), [mine]);
  const mineProcessed = useMemo(
    () => mine.filter((r) => r.status === "APPROVED" || r.status === "STAMPED" || r.status === "REJECTED"),
    [mine]
  );
  const approvableIds = useMemo(() => new Set(toApprove.map((r) => r.id)), [toApprove]);
  const firmTabLabel = currentUser.role === "FINANCE" ? "财务章审批" : "全所审批";
  const rows =
    tab === "allMine"
      ? mine
      : tab === "pending"
        ? minePending
        : tab === "processed"
          ? mineProcessed
          : tab === "toApprove"
            ? toApprove
            : all;

  return (
    <div className="space-y-5">
      {/* 标题区 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">审批 · 用章</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            未来可扩展文书内审等其他审批类型
          </p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          新建用章申请
        </Button>
      </div>

      {/* KPI 顶部 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="本月已盖章"
          value={stats.monthStamped}
          accent="rgb(22 163 74)"
        />
        <KpiCard
          icon={<AlertOctagon className="h-3.5 w-3.5" />}
          label="待审批"
          value={stats.pendingApprovalCount}
          accent="rgb(180 130 0)"
        />
        <KpiCard
          icon={<Stamp className="h-3.5 w-3.5" />}
          label="待盖章"
          value={stats.waitingStampCount}
          accent="rgb(37 99 235)"
        />
      </div>

      {/* Tab */}
      <div className="border-b border-border">
        <div className="flex gap-5">
          <TabBtn active={tab === "allMine"} onClick={() => setTab("allMine")}>
            我的申请
            <Count n={mine.length} />
          </TabBtn>
          <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>
            待审批
            <Count n={minePending.length} hot={minePending.length > 0} />
          </TabBtn>
          <TabBtn active={tab === "processed"} onClick={() => setTab("processed")}>
            已审批
            <Count n={mineProcessed.length} />
          </TabBtn>
          {capabilities.canApprove && (
            <TabBtn active={tab === "toApprove"} onClick={() => setTab("toApprove")}>
              待我审批
              <Count n={toApprove.length} hot={toApprove.length > 0} />
            </TabBtn>
          )}
          {capabilities.canViewFirmQueue && (
            <TabBtn active={tab === "firm"} onClick={() => setTab("firm")}>
              {firmTabLabel}
              <Count n={all.length} />
            </TabBtn>
          )}
        </div>
      </div>

      {/* 表格 */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {rows.length === 0 ? (
          <div className="ll-surface rounded-lg p-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-6 w-6 opacity-40" />
            {emptyText(tab, firmTabLabel)}
          </div>
        ) : (
          <div className="ll-surface overflow-hidden rounded-lg">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">流水号</th>
                  <th className="px-3 py-2 text-left font-normal">章种类</th>
                  <th className="px-3 py-2 text-left font-normal">申请人</th>
                  <th className="px-3 py-2 text-left font-normal">关联案件</th>
                  <th className="px-3 py-2 text-left font-normal">用章事由</th>
                  <th className="px-3 py-2 text-left font-normal">状态</th>
                  <th className="px-3 py-2 text-left font-normal">提交时间</th>
                  <th className="px-3 py-2 text-right font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <SealRow
                    key={r.id}
                    row={r}
                    currentUser={currentUser}
                    canApprove={approvableIds.has(r.id)}
                    onAction={(action) => setActionTarget({ row: r, action })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <SealRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        configs={configs}
        matters={matters}
        preset={presetFromQuery}
      />

      {actionTarget && (
        <SealActionsDialogs
          target={actionTarget}
          onClose={() => setActionTarget(null)}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="ll-surface rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-3xl" style={{ color: accent }}>
        {value}
      </p>
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

function emptyText(tab: Tab, firmTabLabel: string) {
  if (tab === "pending") return "暂无待审批申请";
  if (tab === "processed") return "暂无已审批申请";
  if (tab === "toApprove") return "暂无待你审批的申请";
  if (tab === "firm") return `暂无${firmTabLabel}记录`;
  return "你还没有用章申请";
}

function SealRow({
  row,
  currentUser,
  canApprove,
  onAction
}: {
  row: SealRequestRow;
  currentUser: { id: string; role: string };
  canApprove: boolean;
  onAction: (action: "detail" | "approve" | "reject" | "stamp" | "cancel") => void;
}) {
  const colors = SEAL_STATUS_COLOR[row.status];
  const isOwner = row.requestedById === currentUser.id;
  const isAdmin = currentUser.role === "ADMIN" || currentUser.role === "PRINCIPAL_LAWYER";
  const canStamp =
    isOwner ||
    currentUser.role === "ADMIN" ||
    currentUser.role === "PRINCIPAL_LAWYER" ||
    (currentUser.role === "FINANCE" && row.sealType === "FINANCE_SEAL");

  return (
    <tr className="ll-row border-t border-border">
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onAction("detail")}
          className="font-mono text-[11px] text-primary hover:underline"
          title="查看用章申请详情"
        >
          {row.code}
        </button>
      </td>
      <td className="px-3 py-2">{SEAL_TYPE_CN[row.sealType] ?? row.sealType}</td>
      <td className="px-3 py-2 text-foreground">{row.requestedBy.name}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.matter ? (
          <a
            href={`/matters/${row.matter.id}`}
            className="inline-block max-w-[180px] truncate text-[11px] hover:text-primary"
            title={row.matter.title}
          >
            {row.matter.title}
          </a>
        ) : (
          <span className="text-[10px]">—</span>
        )}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground" title={row.purpose}>
        {row.purpose}
      </td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]"
          style={{
            background: colors.bg,
            color: colors.text,
            borderColor: colors.border
          }}
        >
          {SEAL_STATUS_CN[row.status]}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
        {new Date(row.requestedAt).toLocaleDateString("zh-CN")}
      </td>
      <td className="px-3 py-2 text-right">
        {row.status === "PENDING" && (
          <div className="flex justify-end gap-1.5">
            {canApprove && (
              <button
                type="button"
                onClick={() => onAction("approve")}
                className="text-[11px] text-primary hover:underline"
              >
                审批
              </button>
            )}
            {isOwner && (
              <>
                {canApprove && <span className="text-muted-foreground">|</span>}
                <button
                  type="button"
                  onClick={() => onAction("cancel")}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  撤销
                </button>
              </>
            )}
          </div>
        )}
        {row.status === "APPROVED" && canStamp && (
          <button
            type="button"
            onClick={() => onAction("stamp")}
            className="text-[11px] text-primary hover:underline"
          >
            回填盖章件
          </button>
        )}
        {row.status === "STAMPED" && row.stampedDoc && (
          <a
            href={`/api/documents/${row.stampedDoc.id}/download`}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            下载
          </a>
        )}
        {row.status === "REJECTED" && isAdmin && (
          <span className="text-[10px] text-muted-foreground">已驳回</span>
        )}
      </td>
    </tr>
  );
}
