export type PggCaseworkRoleKey =
  | "cms"
  | "matter_department"
  | "evidence_management"
  | "legal_support"
  | "inspection_audit"
  | "secondary_llm_or_subagent";

export type PggCaseworkGateStatus = "satisfied" | "partial" | "blocked";

export type PggCaseworkDocumentLike = {
  name?: string | null;
  category: string;
  tags?: string[] | null;
};

export type PggCaseworkGateInput = {
  values: Record<string, unknown>;
  documents: PggCaseworkDocumentLike[];
  procedureCount: number;
  partyCount: number;
  taskCount: number;
  noteCount: number;
  timelineCount: number;
};

export type PggCaseworkRoleStatus = {
  key: PggCaseworkRoleKey;
  label: string;
  status: PggCaseworkGateStatus;
  evidence: string[];
  missing: string[];
};

export type PggCaseworkGate = {
  roles: PggCaseworkRoleStatus[];
  summary: {
    total: number;
    satisfied: number;
    partial: number;
    blocked: number;
  };
  deliveryStatus: "trusted_ready" | "needs_review" | "blocked_for_trusted_delivery";
  boundary: string;
};

const ROLE_LABELS: Record<PggCaseworkRoleKey, string> = {
  cms: "CMS 建档/台账",
  matter_department: "业务部门办案",
  evidence_management: "证据管理",
  legal_support: "律法支持",
  inspection_audit: "巡视/审计",
  secondary_llm_or_subagent: "二级复核 receipt"
};

export function buildPggCaseworkGate(input: PggCaseworkGateInput): PggCaseworkGate {
  const { values, documents } = input;
  const pggDocs = documents.filter(hasPggTag);
  const evidenceDocs = pggDocs.filter((doc) => doc.category === "EVIDENCE");
  const legalDocs = pggDocs.filter((doc) => doc.category === "PLEADING" || doc.category === "CONTRACT");
  const procedureDocs = pggDocs.filter((doc) => doc.category === "PROCEDURE");
  const auditReceipts = pggDocs.filter((doc) => hasAnyTag(doc, ["receipt/审计", "inspection_audit", "audit", "巡视", "审计"]));
  const secondaryReceipts = pggDocs.filter((doc) => hasAnyTag(doc, ["secondary_llm_or_subagent", "secondary", "二级复核", "LLM复核"]));

  const sourcePath = stringValue(values.pgg_source_path);
  const syncStatus = stringValue(values.pgg_sync_status);
  const receiptCount = numberValue(values.pgg_receipt_count);
  const pggDocumentCount = numberValue(values.pgg_document_count) || pggDocs.length;
  const pggEvidenceCount = numberValue(values.pgg_evidence_count) || evidenceDocs.length;
  const summary = stringValue(values.pgg_extraction_summary);

  const roles: PggCaseworkRoleStatus[] = [
    role("cms", {
      passed: Boolean(sourcePath && (syncStatus || pggDocumentCount > 0)),
      partial: Boolean(sourcePath || pggDocumentCount > 0),
      evidence: [sourcePath && `PGG来源路径：${sourcePath}`, syncStatus && `同步状态：${syncStatus}`, pggDocumentCount > 0 && `材料索引：${pggDocumentCount}项`],
      missing: [!sourcePath && "缺 PGG 案卷来源路径", !syncStatus && "缺 OA 同步状态字段"]
    }),
    role("matter_department", {
      passed: input.procedureCount > 0 && input.partyCount > 0 && (input.taskCount > 0 || input.timelineCount > 0 || input.noteCount > 0),
      partial: input.procedureCount > 0 || input.partyCount > 0 || input.timelineCount > 0,
      evidence: [
        input.procedureCount > 0 && `程序：${input.procedureCount}项`,
        input.partyCount > 0 && `当事人/关联方：${input.partyCount}项`,
        input.taskCount > 0 && `任务：${input.taskCount}项`,
        input.timelineCount > 0 && `时间线：${input.timelineCount}项`,
        input.noteCount > 0 && `备注：${input.noteCount}项`
      ],
      missing: [input.procedureCount === 0 && "缺案件程序", input.partyCount === 0 && "缺当事人", input.taskCount === 0 && input.timelineCount === 0 && input.noteCount === 0 && "缺办案跟进记录"]
    }),
    role("evidence_management", {
      passed: pggEvidenceCount > 0 && evidenceDocs.length > 0,
      partial: pggEvidenceCount > 0 || evidenceDocs.length > 0,
      evidence: [pggEvidenceCount > 0 && `证据计数：${pggEvidenceCount}`, evidenceDocs.length > 0 && `证据材料：${evidenceDocs.length}份`],
      missing: [pggEvidenceCount === 0 && evidenceDocs.length === 0 && "缺证据材料索引", "仍需人工核验证据三性/证明目的"]
    }),
    role("legal_support", {
      passed: legalDocs.length > 0 && Boolean(summary),
      partial: legalDocs.length > 0 || Boolean(summary) || procedureDocs.length > 0,
      evidence: [legalDocs.length > 0 && `文书/合同：${legalDocs.length}份`, procedureDocs.length > 0 && `程序材料：${procedureDocs.length}份`, summary && "有提取摘要/候选事实"],
      missing: [legalDocs.length === 0 && "缺文书/合同/法律分析材料", !summary && "缺法律支持摘要", "仍需本地法条/类案复核 receipt"]
    }),
    role("inspection_audit", {
      passed: auditReceipts.length > 0 || receiptCount > 0,
      partial: receiptCount > 0,
      evidence: [auditReceipts.length > 0 && `审计/巡视 receipt：${auditReceipts.length}份`, receiptCount > 0 && `receipt 计数：${receiptCount}`],
      missing: [auditReceipts.length === 0 && receiptCount === 0 && "缺巡视/审计 receipt"]
    }),
    role("secondary_llm_or_subagent", {
      passed: secondaryReceipts.length > 0,
      partial: false,
      evidence: [secondaryReceipts.length > 0 && `二级复核 receipt：${secondaryReceipts.length}份`],
      missing: [secondaryReceipts.length === 0 && "缺 secondary LLM/subagent receipt"]
    })
  ];

  const summaryCounts = {
    total: roles.length,
    satisfied: roles.filter((item) => item.status === "satisfied").length,
    partial: roles.filter((item) => item.status === "partial").length,
    blocked: roles.filter((item) => item.status === "blocked").length
  };

  const deliveryStatus = summaryCounts.blocked > 0
    ? "blocked_for_trusted_delivery"
    : summaryCounts.partial > 0
      ? "needs_review"
      : "trusted_ready";

  return {
    roles,
    summary: summaryCounts,
    deliveryStatus,
    boundary: deliveryStatus === "trusted_ready"
      ? "六角色均有 OA 证据记录；正式对外交付前仍需律师最终确认。"
      : "未集齐 CMS、业务、证据、律法、巡视/审计、secondary receipt 六角色证据，不能标记为可信终稿或可对外交付成果。"
  };
}

function role(
  key: PggCaseworkRoleKey,
  options: { passed: boolean; partial: boolean; evidence: Array<string | false | null | undefined>; missing: Array<string | false | null | undefined> }
): PggCaseworkRoleStatus {
  return {
    key,
    label: ROLE_LABELS[key],
    status: options.passed ? "satisfied" : options.partial ? "partial" : "blocked",
    evidence: compact(options.evidence),
    missing: compact(options.missing)
  };
}

function hasPggTag(doc: PggCaseworkDocumentLike) {
  return hasAnyTag(doc, ["PGG深度导入", "PGG历史导入"]);
}

function hasAnyTag(doc: PggCaseworkDocumentLike, needles: string[]) {
  const searchable = [...(doc.tags ?? []), doc.name ?? ""];
  return searchable.some((item) => needles.some((needle) => item.toLowerCase().includes(needle.toLowerCase())));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compact(items: Array<string | false | null | undefined>) {
  return items.filter((item): item is string => Boolean(item));
}
