import ExcelJS from "exceljs";
import {
  MatterCategory,
  Prisma,
  type LitigationStanding,
  type MatterMemberRole,
  type PartyRole,
  type PartyType,
  type ProcedureEngagement,
  type ProcedureOutcome,
  type ProcedureStatus
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { intakeVisibilityFilter, matterVisibilityFilter } from "@/lib/permissions";
import {
  barFilingLabel,
  clientTypeLabel,
  feeTypeLabel,
  intakeStatusLabel,
  litigationStandingLabel,
  matterCategoryLabel,
  matterCategoryKind,
  matterStatusLabel,
  partyTypeLabel,
  procedureTypeLabel
} from "@/lib/enums";

export type MattersExportTab = "intake" | "active" | "archived" | "revision" | "all";
type MatterSortBy = "hearing" | "intakeDate" | "claimAmount";
type MatterSortDir = "asc" | "desc";

export type MattersExportParams = {
  tab: MattersExportTab;
  search?: string;
  category?: MatterCategory;
  status?: string;
  from?: string;
  to?: string;
  sortBy: MatterSortBy;
  sortDir: MatterSortDir;
};

type ExportUser = {
  id: string;
  role: string;
};

const EXPORT_TABS: MattersExportTab[] = [
  "intake",
  "active",
  "archived",
  "revision",
  "all"
];

const TAB_LABEL: Record<MattersExportTab, string> = {
  all: "全部案件",
  intake: "待审批",
  active: "进行中",
  revision: "待补正",
  archived: "已归档"
};

const TAB_FILE_KEY: Record<MattersExportTab, string> = {
  all: "all",
  intake: "intake",
  active: "active",
  revision: "revision",
  archived: "archived"
};

const MATTER_CATEGORIES = Object.values(MatterCategory) as MatterCategory[];
type MatterCategoryKind = ReturnType<typeof matterCategoryKind>;

const intakeInclude = Prisma.validator<Prisma.IntakeInclude>()({
  client: {
    select: {
      id: true,
      name: true,
      type: true,
      idNumber: true,
      address: true,
      phone: true,
      legalRep: true,
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 3,
        select: { name: true, title: true, phone: true, email: true, isPrimary: true }
      }
    }
  },
  cause: { select: { name: true } },
  ownerUser: { select: { id: true, name: true } },
  parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
  matter: { select: { id: true, internalCode: true, firmCaseNo: true, title: true } },
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { name: true, category: true, createdAt: true }
  }
});

const matterInclude = Prisma.validator<Prisma.MatterInclude>()({
  primaryClient: {
    select: {
      id: true,
      name: true,
      type: true,
      idNumber: true,
      address: true,
      phone: true,
      legalRep: true,
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 3,
        select: { name: true, title: true, phone: true, email: true, isPrimary: true }
      }
    }
  },
  clientLinks: {
    orderBy: { addedAt: "asc" },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          type: true,
          idNumber: true,
          address: true,
          phone: true,
          legalRep: true
        }
      }
    }
  },
  owner: { select: { id: true, name: true } },
  members: {
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { id: true, name: true } } }
  },
  cause: { select: { name: true } },
  intake: { include: intakeInclude },
  parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
  procedures: {
    orderBy: { order: "asc" },
    include: {
      leadLawyer: { select: { id: true, name: true } },
      procedureParties: {
        orderBy: [{ standing: "asc" }, { ordinal: "asc" }],
        include: { party: true }
      },
      hearings: {
        orderBy: { startsAt: "desc" },
        take: 1,
        select: { startsAt: true }
      }
    }
  },
  relatedEntities: {
    orderBy: { createdAt: "asc" },
    select: { name: true, relationship: true, notes: true }
  },
  linksFrom: {
    include: { relatedMatter: { select: { internalCode: true, firmCaseNo: true, title: true } } }
  },
  linksTo: {
    include: { matter: { select: { internalCode: true, firmCaseNo: true, title: true } } }
  },
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { name: true, category: true, createdAt: true }
  }
});

type IntakeExportRow = Prisma.IntakeGetPayload<{ include: typeof intakeInclude }>;
type MatterExportRow = Prisma.MatterGetPayload<{ include: typeof matterInclude }>;

const partyRoleLabel: Record<PartyRole, string> = {
  CLIENT_PARTY: "委托方",
  OPPOSING_PARTY: "对方",
  THIRD_PARTY: "第三人",
  CO_LITIGANT: "共同当事人",
  AGENT: "代理人",
  WITNESS: "证人",
  OTHER: "其他"
};

const memberRoleLabel: Record<MatterMemberRole, string> = {
  LEAD: "主办",
  CO_LEAD: "协办",
  ASSISTANT: "助理"
};

const procedureStatusLabel: Record<ProcedureStatus, string> = {
  PENDING: "未开始",
  IN_PROGRESS: "进行中",
  CONCLUDED: "已结束"
};

const procedureEngagementLabel: Record<ProcedureEngagement, string> = {
  ENGAGED: "承办",
  INFORMATIONAL: "仅登记"
};

const procedureOutcomeLabel: Record<ProcedureOutcome, string> = {
  WON: "胜诉",
  PARTIAL_WON: "部分胜诉",
  LOST: "败诉",
  MEDIATED: "调解",
  WITHDRAWN: "撤诉",
  DISMISSED: "驳回",
  COMPLETED: "完成",
  TRANSFERRED: "移送",
  OTHER: "其他"
};

export function resolveMattersExportParams(searchParams: URLSearchParams): MattersExportParams {
  const rawTab = searchParams.get("tab");
  const tab = EXPORT_TABS.includes(rawTab as MattersExportTab)
    ? (rawTab as MattersExportTab)
    : "active";
  const rawSortBy = searchParams.get("sortBy");
  const candidateSortBy =
    rawSortBy === "hearing" || rawSortBy === "intakeDate" || rawSortBy === "claimAmount"
      ? rawSortBy
      : undefined;
  const sortBy = normalizeSortByForTab(tab, candidateSortBy ?? defaultSortByForTab(tab));
  const rawCategory = searchParams.get("category");
  const category = MATTER_CATEGORIES.includes(rawCategory as MatterCategory)
    ? (rawCategory as MatterCategory)
    : undefined;

  return {
    tab,
    search: cleanText(searchParams.get("search")),
    category,
    status: cleanText(searchParams.get("status")),
    from: cleanDateText(searchParams.get("from")),
    to: cleanDateText(searchParams.get("to")),
    sortBy,
    sortDir: searchParams.get("sortDir") === "asc" ? "asc" : "desc"
  };
}

export async function buildMattersExportWorkbook(
  params: MattersExportParams,
  user: ExportUser
): Promise<{ buffer: Buffer; filename: string; total: number; tabLabel: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LawLink";
  wb.created = new Date();

  const total =
    params.tab === "intake" || params.tab === "revision"
      ? await addIntakesSheet(wb, params, user)
      : await addMattersSheet(wb, params, user);

  const raw = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(raw),
    filename: buildFilename(params.tab),
    total,
    tabLabel: TAB_LABEL[params.tab]
  };
}

function defaultSortByForTab(tab: MattersExportTab): MatterSortBy {
  return tab === "active" ? "hearing" : "intakeDate";
}

function normalizeSortByForTab(tab: MattersExportTab, sortBy: MatterSortBy): MatterSortBy {
  if (sortBy === "hearing" && tab !== "active" && tab !== "all") {
    return defaultSortByForTab(tab);
  }
  return sortBy;
}

async function addIntakesSheet(
  wb: ExcelJS.Workbook,
  params: MattersExportParams,
  user: ExportUser
) {
  const where = buildIntakeWhere(params, user);
  const rows = await prisma.intake.findMany({
    where,
    orderBy: intakeOrderBy(params),
    include: intakeInclude
  });
  const coUserNames = await loadUserNameMap(rows.flatMap((row) => row.coUserIds));
  const groups = groupRowsByCategory(rows, params.category);
  if (groups.length === 0) {
    const sheet = wb.addWorksheet("无数据");
    sheet.columns = intakeColumnsForKind("litigation");
    polishSheet(sheet, ["money", "feeAmount"]);
    return 0;
  }
  for (const group of groups) {
    const sheet = wb.addWorksheet(sheetName(`${TAB_LABEL[params.tab]}-${matterCategoryLabel[group.category]}`));
    sheet.columns = intakeColumnsForKind(matterCategoryKind(group.category));
    for (const intake of group.rows) {
      sheet.addRow(buildIntakeRow(intake, coUserNames));
    }
    polishSheet(sheet, ["money", "feeAmount"]);
  }
  return rows.length;
}

async function addMattersSheet(
  wb: ExcelJS.Workbook,
  params: MattersExportParams,
  user: ExportUser
) {
  const where = buildMatterWhere(params, user);
  const rows = sortMatterRows(
    await prisma.matter.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: matterInclude
    }),
    params
  );
  const coUserNames = await loadUserNameMap(
    rows.flatMap((row) => row.intake?.coUserIds ?? [])
  );
  const groups = groupRowsByCategory(rows, params.category);
  if (groups.length === 0) {
    const sheet = wb.addWorksheet("无数据");
    sheet.columns = matterColumnsForKind("litigation", 1);
    polishSheet(sheet, ["claimAmount", "sourceClaimAmount", "sourceFeeAmount"]);
    return 0;
  }
  for (const group of groups) {
    const kind = matterCategoryKind(group.category);
    const maxProcedures =
      kind === "litigation"
        ? Math.max(
            1,
            group.rows.reduce((max, row) => Math.max(max, row.procedures.length), 0)
          )
        : 0;
    const sheet = wb.addWorksheet(sheetName(matterCategoryLabel[group.category]));
    sheet.columns = matterColumnsForKind(kind, maxProcedures);
    for (const matter of group.rows) {
      sheet.addRow(buildMatterRow(matter, maxProcedures, coUserNames));
    }
    polishSheet(sheet, ["claimAmount", "sourceClaimAmount", "sourceFeeAmount"]);
  }
  return rows.length;
}

function groupRowsByCategory<T extends { category: MatterCategory }>(
  rows: T[],
  category?: MatterCategory
) {
  return MATTER_CATEGORIES
    .filter((candidate) => !category || candidate === category)
    .map((candidate) => ({
      category: candidate,
      rows: rows.filter((row) => row.category === candidate)
    }))
    .filter((group) => group.rows.length > 0);
}

function buildIntakeWhere(params: MattersExportParams, user: ExportUser): Prisma.IntakeWhereInput {
  const parts: Prisma.IntakeWhereInput[] = [
    intakeVisibilityFilter(user.id, user.role),
    params.tab === "revision"
      ? { status: { in: ["NEEDS_REVISION"] } }
      : { status: { in: ["INTAKE", "PENDING_CONFIRMATION"] } }
  ];
  if (params.category) parts.push({ category: params.category });
  const from = resolveDateBoundary(params.from, false);
  const to = resolveDateBoundary(params.to, true);
  if (from || to) {
    parts.push({
      receivedAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      }
    });
  }
  if (params.search) {
    parts.push({
      OR: [
        { title: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { client: { name: { contains: params.search, mode: "insensitive" } } },
        { cause: { name: { contains: params.search, mode: "insensitive" } } },
        { parties: { some: { name: { contains: params.search, mode: "insensitive" } } } }
      ]
    });
  }
  return { AND: parts };
}

function buildMatterWhere(params: MattersExportParams, user: ExportUser): Prisma.MatterWhereInput {
  const parts: Prisma.MatterWhereInput[] = [
    matterVisibilityFilter(user.id, user.role),
    { deletedAt: null },
    matterStatusWhere(params)
  ];
  if (params.category) parts.push({ category: params.category });
  const from = resolveDateBoundary(params.from, false);
  const to = resolveDateBoundary(params.to, true);
  if (from || to) {
    parts.push({
      intakeDate: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      }
    });
  }
  if (params.search) {
    parts.push({
      OR: [
        { title: { contains: params.search, mode: "insensitive" } },
        { internalCode: { contains: params.search, mode: "insensitive" } },
        { firmCaseNo: { contains: params.search, mode: "insensitive" } },
        { primaryClient: { name: { contains: params.search, mode: "insensitive" } } },
        { cause: { name: { contains: params.search, mode: "insensitive" } } },
        { parties: { some: { name: { contains: params.search, mode: "insensitive" } } } },
        { procedures: { some: { caseNumber: { contains: params.search, mode: "insensitive" } } } }
      ]
    });
  }
  return { AND: parts };
}

function matterStatusWhere(params: MattersExportParams): Prisma.MatterWhereInput {
  if (params.tab === "archived") return { status: { in: ["ARCHIVED"] } };
  if (params.tab === "active") return { status: { notIn: ["CLOSED", "ARCHIVED"] } };
  if (params.status === "active") return { status: { in: ["IN_PROGRESS", "ON_HOLD"] } };
  if (params.status === "closed") return { status: { in: ["CLOSED"] } };
  if (params.status === "archived") return { status: { in: ["ARCHIVED"] } };
  return { status: { in: ["IN_PROGRESS", "ON_HOLD", "CLOSED", "ARCHIVED"] } };
}

function intakeOrderBy(params: MattersExportParams): Prisma.IntakeOrderByWithRelationInput[] {
  if (params.sortBy === "claimAmount") {
    return [{ claimAmount: params.sortDir }, { receivedAt: "desc" }];
  }
  return [{ receivedAt: params.sortDir }];
}

function sortMatterRows(rows: MatterExportRow[], params: MattersExportParams) {
  return [...rows].sort((a, b) => {
    const aValue = matterSortValue(a, params.sortBy);
    const bValue = matterSortValue(b, params.sortBy);
    const aEmpty = aValue === null || aValue === undefined;
    const bEmpty = bValue === null || bValue === undefined;
    if (aEmpty && bEmpty) return b.updatedAt.getTime() - a.updatedAt.getTime();
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const direction = params.sortDir === "asc" ? 1 : -1;
    const base =
      aValue instanceof Date || bValue instanceof Date
        ? (aValue as Date).getTime() - (bValue as Date).getTime()
        : Number(aValue) - Number(bValue);
    if (base !== 0) return base * direction;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

function matterSortValue(row: MatterExportRow, sortBy: MatterSortBy) {
  if (sortBy === "hearing") {
    return (
      row.procedures
        .map((procedure) => procedure.hearings[0]?.startsAt ?? null)
        .filter((date): date is Date => !!date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    );
  }
  if (sortBy === "claimAmount") {
    return row.claimAmount === null || row.claimAmount === undefined
      ? null
      : Number(row.claimAmount);
  }
  return row.intakeDate;
}

async function loadUserNameMap(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true }
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

function intakeColumnsForKind(kind: MatterCategoryKind): Partial<ExcelJS.Column>[] {
  const commonStart: Partial<ExcelJS.Column>[] = [
    { header: "收案ID", key: "id", width: 24 },
    { header: "标题", key: "title", width: 36 },
    { header: "收案分类", key: "category", width: 12 },
    { header: "收案状态", key: "status", width: 12 },
    { header: "收案时间", key: "receivedAt", width: 12 },
    { header: "案由", key: "cause", width: 18 },
    { header: "自由案由", key: "causeFreeText", width: 18 },
    { header: "案情描述", key: "description", width: 36 },
    { header: "委托方", key: "client", width: 20 },
    { header: "委托方类型", key: "clientType", width: 12 },
    { header: "委托方证件/代码", key: "clientIdNumber", width: 22 },
    { header: "委托方地址", key: "clientAddress", width: 28 },
    { header: "法定代表人", key: "clientLegalRep", width: 14 },
    { header: "联系人", key: "contactName", width: 14 },
    { header: "联系电话", key: "contactPhone", width: 16 },
    { header: "客户档案联系人", key: "clientContacts", width: 28 },
    { header: "主办律师", key: "owner", width: 12 },
    { header: "共同律师", key: "coUsers", width: 24 }
  ];
  const litigationColumns: Partial<ExcelJS.Column>[] = [
    { header: "首次程序", key: "firstProcedureType", width: 14 },
    { header: "争议解决机构", key: "firstAgency", width: 24 },
    { header: "管辖地", key: "jurisdiction", width: 18 },
    { header: "我方地位", key: "ourStanding", width: 14 },
    { header: "标的金额", key: "money", width: 14 },
    { header: "标的描述", key: "claimDescription", width: 24 },
    { header: "律协备案", key: "barFiling", width: 18 },
    { header: "是否反诉", key: "counterclaim", width: 10 },
    { header: "当事人", key: "parties", width: 44 }
  ];
  const projectColumns: Partial<ExcelJS.Column>[] = [
    { header: "业务类型", key: "businessType", width: 16 },
    { header: "服务范围", key: "serviceScope", width: 28 },
    { header: "交付成果", key: "deliverables", width: 24 },
    { header: "服务起", key: "serviceStart", width: 12 },
    { header: "服务止", key: "serviceEnd", width: 12 },
    { header: "相关方", key: "parties", width: 44 }
  ];
  const counselColumns: Partial<ExcelJS.Column>[] = [
    { header: "顾问类型", key: "counselType", width: 16 },
    { header: "服务范围", key: "serviceScope", width: 28 },
    { header: "服务起", key: "serviceStart", width: 12 },
    { header: "服务止", key: "serviceEnd", width: 12 },
    { header: "相关方", key: "parties", width: 44 }
  ];
  const commonEnd: Partial<ExcelJS.Column>[] = [
    { header: "收费方式", key: "feeType", width: 14 },
    { header: "律师费金额", key: "feeAmount", width: 14 },
    { header: "风险代理条款", key: "contingencyTerms", width: 26 },
    { header: "付款节点", key: "feeSchedule", width: 26 },
    { header: "费用备注", key: "feeNote", width: 24 },
    { header: "附件", key: "documents", width: 36 },
    { header: "转化案件", key: "matter", width: 28 },
    { header: "不接案/补正原因", key: "declinedReason", width: 30 },
    { header: "创建时间", key: "createdAt", width: 18 },
    { header: "更新时间", key: "updatedAt", width: 18 }
  ];
  const typedColumns =
    kind === "litigation"
      ? litigationColumns
      : kind === "project"
        ? projectColumns
        : counselColumns;
  return [...commonStart, ...typedColumns, ...commonEnd];
}

function matterColumnsForKind(
  kind: MatterCategoryKind,
  maxProcedures: number
): Partial<ExcelJS.Column>[] {
  const commonStart: Partial<ExcelJS.Column>[] = [
    { header: "系统编号", key: "internalCode", width: 16 },
    { header: "所内案号", key: "firmCaseNo", width: 18 },
    { header: "案件名称", key: "title", width: 38 },
    { header: "案件分类", key: "category", width: 12 },
    { header: "案件状态", key: "status", width: 12 },
    { header: "收案时间", key: "intakeDate", width: 12 },
    { header: "首次立案/受理", key: "firstAcceptedAt", width: 12 },
    { header: "结案时间", key: "closedAt", width: 12 },
    { header: "归档时间", key: "archivedAt", width: 12 },
    { header: "主客户", key: "primaryClient", width: 20 },
    { header: "主客户类型", key: "primaryClientType", width: 12 },
    { header: "主客户证件/代码", key: "primaryClientIdNumber", width: 22 },
    { header: "主客户地址", key: "primaryClientAddress", width: 28 },
    { header: "主客户法定代表人", key: "primaryClientLegalRep", width: 16 },
    { header: "主客户联系人", key: "primaryClientContacts", width: 28 },
    { header: "其他客户", key: "otherClients", width: 30 },
    { header: "主办律师", key: "owner", width: 12 },
    { header: "团队成员", key: "members", width: 30 }
  ];
  const litigationColumns: Partial<ExcelJS.Column>[] = [
    { header: "案由", key: "cause", width: 18 },
    { header: "自由案由", key: "causeFreeText", width: 18 },
    { header: "标的金额", key: "claimAmount", width: 14 },
    { header: "我方地位", key: "ourStanding", width: 14 },
    { header: "反诉原告", key: "counterclaimAsPlaintiff", width: 10 },
    { header: "反诉被告", key: "counterclaimAsDefendant", width: 10 },
    { header: "律协备案", key: "barFiling", width: 18 },
    { header: "案件当事人", key: "parties", width: 48 }
  ];
  const projectColumns: Partial<ExcelJS.Column>[] = [
    { header: "业务类型", key: "businessType", width: 16 },
    { header: "服务范围", key: "serviceScope", width: 28 },
    { header: "交付成果", key: "deliverables", width: 24 },
    { header: "服务起", key: "serviceStart", width: 12 },
    { header: "服务止", key: "serviceEnd", width: 12 },
    { header: "相关方", key: "parties", width: 48 },
    { header: "阶段/程序摘要", key: "procedureSummary", width: 42 }
  ];
  const counselColumns: Partial<ExcelJS.Column>[] = [
    { header: "顾问类型", key: "counselType", width: 16 },
    { header: "服务范围", key: "serviceScope", width: 28 },
    { header: "服务起", key: "serviceStart", width: 12 },
    { header: "服务止", key: "serviceEnd", width: 12 },
    { header: "相关方", key: "parties", width: 48 },
    { header: "阶段/程序摘要", key: "procedureSummary", width: 42 }
  ];
  const commonEnd: Partial<ExcelJS.Column>[] = [
    { header: "关联实体", key: "relatedEntities", width: 36 },
    { header: "关联案件", key: "relatedMatters", width: 36 },
    { header: "案件附件", key: "documents", width: 36 },
    { header: "自定义字段", key: "customValues", width: 30 },
    { header: "来源收案标题", key: "intakeTitle", width: 34 },
    { header: "来源收案状态", key: "intakeStatus", width: 12 },
    { header: "来源收案时间", key: "sourceReceivedAt", width: 12 },
    { header: "来源收案案情", key: "sourceDescription", width: 34 },
    { header: "来源收费方式", key: "sourceFeeType", width: 14 },
    { header: "来源律师费金额", key: "sourceFeeAmount", width: 14 },
    { header: "来源付款节点", key: "sourceFeeSchedule", width: 26 },
    { header: "来源费用备注", key: "sourceFeeNote", width: 24 },
    { header: "来源共同律师", key: "sourceCoUsers", width: 24 },
    { header: "来源附件", key: "sourceDocuments", width: 36 },
    { header: "创建时间", key: "createdAt", width: 18 },
    { header: "更新时间", key: "updatedAt", width: 18 }
  ];
  const litigationSourceColumns: Partial<ExcelJS.Column>[] = [
    { header: "来源收案首次程序", key: "sourceFirstProcedureType", width: 14 },
    { header: "来源争议解决机构", key: "sourceFirstAgency", width: 24 },
    { header: "来源管辖地", key: "sourceJurisdiction", width: 18 },
    { header: "来源我方地位", key: "sourceOurStanding", width: 14 },
    { header: "来源标的金额", key: "sourceClaimAmount", width: 14 },
    { header: "来源标的描述", key: "sourceClaimDescription", width: 24 },
    { header: "来源律协备案", key: "sourceBarFiling", width: 18 },
    { header: "来源是否反诉", key: "sourceCounterclaim", width: 12 }
  ];
  const projectSourceColumns: Partial<ExcelJS.Column>[] = [
    { header: "来源业务类型", key: "sourceBusinessType", width: 16 },
    { header: "来源服务范围", key: "sourceServiceScope", width: 28 },
    { header: "来源交付成果", key: "sourceDeliverables", width: 24 },
    { header: "来源服务起", key: "sourceServiceStart", width: 12 },
    { header: "来源服务止", key: "sourceServiceEnd", width: 12 }
  ];
  const counselSourceColumns: Partial<ExcelJS.Column>[] = [
    { header: "来源顾问类型", key: "sourceCounselType", width: 16 },
    { header: "来源服务范围", key: "sourceServiceScope", width: 28 },
    { header: "来源服务起", key: "sourceServiceStart", width: 12 },
    { header: "来源服务止", key: "sourceServiceEnd", width: 12 }
  ];
  const typedColumns =
    kind === "litigation"
      ? litigationColumns
      : kind === "project"
        ? projectColumns
        : counselColumns;
  const typedSourceColumns =
    kind === "litigation"
      ? litigationSourceColumns
      : kind === "project"
        ? projectSourceColumns
        : counselSourceColumns;
  const procedureColumns: Partial<ExcelJS.Column>[] = [];
  for (let i = 1; i <= maxProcedures; i += 1) {
    procedureColumns.push(
      { header: `程序${i}-类型`, key: `procedure${i}Type`, width: 14 },
      { header: `程序${i}-标签`, key: `procedure${i}Label`, width: 16 },
      { header: `程序${i}-参与方式`, key: `procedure${i}Engagement`, width: 12 },
      { header: `程序${i}-状态`, key: `procedure${i}Status`, width: 12 },
      { header: `程序${i}-案号`, key: `procedure${i}CaseNumber`, width: 24 },
      { header: `程序${i}-管辖地`, key: `procedure${i}Jurisdiction`, width: 18 },
      { header: `程序${i}-办理机关`, key: `procedure${i}HandlingAgency`, width: 24 },
      { header: `程序${i}-合议庭/部门`, key: `procedure${i}Panel`, width: 20 },
      { header: `程序${i}-经办人`, key: `procedure${i}Handler`, width: 16 },
      { header: `程序${i}-我方地位`, key: `procedure${i}OurStanding`, width: 14 },
      { header: `程序${i}-主办律师`, key: `procedure${i}LeadLawyer`, width: 14 },
      { header: `程序${i}-外部代理`, key: `procedure${i}ExternalLead`, width: 10 },
      { header: `程序${i}-立案/受理`, key: `procedure${i}AcceptedAt`, width: 12 },
      { header: `程序${i}-裁决/结案`, key: `procedure${i}ConcludedAt`, width: 12 },
      { header: `程序${i}-结果`, key: `procedure${i}Outcome`, width: 12 },
      { header: `程序${i}-结果说明`, key: `procedure${i}OutcomeNote`, width: 26 },
      { header: `程序${i}-主审/仲裁员/执行法官`, key: `procedure${i}PresidingJudge`, width: 22 },
      { header: `程序${i}-联系方式`, key: `procedure${i}PresidingJudgeContact`, width: 18 },
      { header: `程序${i}-助理`, key: `procedure${i}JudgeAssistant`, width: 16 },
      { header: `程序${i}-助理联系方式`, key: `procedure${i}JudgeAssistantContact`, width: 18 },
      { header: `程序${i}-程序当事人`, key: `procedure${i}Parties`, width: 48 }
    );
  }

  return [
    ...commonStart,
    ...typedColumns,
    ...procedureColumns,
    ...typedSourceColumns,
    ...commonEnd
  ];
}

function buildIntakeRow(intake: IntakeExportRow, coUserNames: Map<string, string>) {
  return {
    id: intake.id,
    title: intake.title,
    category: matterCategoryLabel[intake.category],
    status: label(intakeStatusLabel, intake.status),
    receivedAt: formatDate(intake.receivedAt),
    cause: intake.cause?.name ?? "",
    causeFreeText: intake.causeFreeText ?? "",
    description: intake.description ?? "",
    client: intake.client?.name ?? "",
    clientType: intake.client ? clientTypeLabel[intake.client.type] : label(clientTypeLabel, intake.clientType),
    clientIdNumber: intake.client?.idNumber ?? "",
    clientAddress: intake.client?.address ?? "",
    clientLegalRep: intake.client?.legalRep ?? "",
    contactName: intake.contactName ?? "",
    contactPhone: intake.contactPhone ?? intake.client?.phone ?? "",
    clientContacts: formatContacts(intake.client?.contacts ?? []),
    firstProcedureType: label(procedureTypeLabel, intake.firstProcedureType),
    firstAgency: intake.firstAgency ?? "",
    jurisdiction: intake.jurisdiction ?? "",
    ourStanding: label(litigationStandingLabel, intake.ourStanding),
    money: decimalNumber(intake.claimAmount),
    claimDescription: intake.claimDescription ?? "",
    barFiling: label(barFilingLabel, intake.barFiling),
    counterclaim: yesNo(intake.counterclaim),
    businessType: intake.businessType ?? "",
    serviceScope: intake.serviceScope ?? "",
    deliverables: intake.deliverables ?? "",
    counselType: intake.counselType ?? "",
    serviceStart: formatDate(intake.serviceStart),
    serviceEnd: formatDate(intake.serviceEnd),
    feeType: label(feeTypeLabel, intake.feeType),
    feeAmount: decimalNumber(intake.feeAmount),
    contingencyTerms: intake.contingencyTerms ?? "",
    feeSchedule: intake.feeSchedule ?? "",
    feeNote: intake.feeNote ?? "",
    owner: intake.ownerUser?.name ?? "",
    coUsers: intake.coUserIds.map((id) => coUserNames.get(id) ?? id).join("；"),
    parties: formatParties(intake.parties),
    documents: formatDocuments(intake.documents),
    matter: intake.matter
      ? `${intake.matter.firmCaseNo ?? intake.matter.internalCode} ${intake.matter.title}`
      : "",
    declinedReason: intake.declinedReason ?? "",
    createdAt: formatDateTime(intake.createdAt),
    updatedAt: formatDateTime(intake.updatedAt)
  };
}

function buildMatterRow(
  matter: MatterExportRow,
  maxProcedures: number,
  coUserNames: Map<string, string>
) {
  const otherClients = matter.clientLinks
    .filter((link) => link.clientId !== matter.primaryClientId)
    .map((link) => `${link.label ? `${link.label}:` : ""}${link.client.name}`)
    .join("；");
  const source = matter.intake;
  const row: Record<string, unknown> = {
    internalCode: matter.internalCode,
    firmCaseNo: matter.firmCaseNo ?? "",
    title: matter.title,
    category: matterCategoryLabel[matter.category],
    status: matterStatusLabel[matter.status],
    cause: matter.cause?.name ?? "",
    causeFreeText: matter.causeFreeText ?? "",
    claimAmount: decimalNumber(matter.claimAmount),
    ourStanding: label(litigationStandingLabel, matter.ourStanding),
    counterclaimAsPlaintiff: yesNo(matter.counterclaimAsPlaintiff),
    counterclaimAsDefendant: yesNo(matter.counterclaimAsDefendant),
    barFiling: label(barFilingLabel, matter.barFiling),
    businessType: matter.businessType ?? "",
    serviceScope: matter.serviceScope ?? "",
    deliverables: matter.deliverables ?? "",
    counselType: matter.counselType ?? "",
    serviceStart: formatDate(matter.serviceStart),
    serviceEnd: formatDate(matter.serviceEnd),
    intakeDate: formatDate(matter.intakeDate),
    firstAcceptedAt: formatDate(matter.firstAcceptedAt),
    closedAt: formatDate(matter.closedAt),
    archivedAt: formatDate(matter.archivedAt),
    primaryClient: matter.primaryClient?.name ?? "",
    primaryClientType: matter.primaryClient ? clientTypeLabel[matter.primaryClient.type] : "",
    primaryClientIdNumber: matter.primaryClient?.idNumber ?? "",
    primaryClientAddress: matter.primaryClient?.address ?? "",
    primaryClientLegalRep: matter.primaryClient?.legalRep ?? "",
    primaryClientContacts: formatContacts(matter.primaryClient?.contacts ?? []),
    otherClients,
    owner: matter.owner.name,
    members: matter.members
      .map((member) => `${member.user.name}（${memberRoleLabel[member.role]}）`)
      .join("；"),
    parties: formatParties(matter.parties),
    procedureSummary: formatProcedureSummary(matter.procedures),
    relatedEntities: matter.relatedEntities
      .map((entity) => [entity.name, entity.relationship, entity.notes].filter(Boolean).join(" / "))
      .join("；"),
    relatedMatters: formatRelatedMatters(matter),
    documents: formatDocuments(matter.documents),
    customValues: formatJson(matter.customValues),
    intakeTitle: source?.title ?? "",
    intakeStatus: label(intakeStatusLabel, source?.status),
    sourceReceivedAt: formatDate(source?.receivedAt),
    sourceDescription: source?.description ?? "",
    sourceFirstProcedureType: label(procedureTypeLabel, source?.firstProcedureType),
    sourceFirstAgency: source?.firstAgency ?? "",
    sourceJurisdiction: source?.jurisdiction ?? "",
    sourceOurStanding: label(litigationStandingLabel, source?.ourStanding),
    sourceClaimAmount: decimalNumber(source?.claimAmount),
    sourceClaimDescription: source?.claimDescription ?? "",
    sourceBarFiling: label(barFilingLabel, source?.barFiling),
    sourceCounterclaim: source ? yesNo(source.counterclaim) : "",
    sourceBusinessType: source?.businessType ?? "",
    sourceServiceScope: source?.serviceScope ?? "",
    sourceDeliverables: source?.deliverables ?? "",
    sourceCounselType: source?.counselType ?? "",
    sourceServiceStart: formatDate(source?.serviceStart),
    sourceServiceEnd: formatDate(source?.serviceEnd),
    sourceFeeType: label(feeTypeLabel, source?.feeType),
    sourceFeeAmount: decimalNumber(source?.feeAmount),
    sourceFeeSchedule: source?.feeSchedule ?? "",
    sourceFeeNote: source?.feeNote ?? "",
    sourceCoUsers: (source?.coUserIds ?? []).map((id) => coUserNames.get(id) ?? id).join("；"),
    sourceDocuments: formatDocuments(source?.documents ?? []),
    createdAt: formatDateTime(matter.createdAt),
    updatedAt: formatDateTime(matter.updatedAt)
  };

  for (let i = 0; i < maxProcedures; i += 1) {
    Object.assign(row, buildProcedureCells(matter.procedures[i], i + 1));
  }
  return row;
}

function buildProcedureCells(
  procedure: MatterExportRow["procedures"][number] | undefined,
  index: number
) {
  if (!procedure) return {};
  return {
    [`procedure${index}Type`]: label(procedureTypeLabel, procedure.type),
    [`procedure${index}Label`]: procedure.customLabel ?? "",
    [`procedure${index}Engagement`]: procedureEngagementLabel[procedure.engagement],
    [`procedure${index}Status`]: procedureStatusLabel[procedure.status],
    [`procedure${index}CaseNumber`]: procedure.caseNumber ?? "",
    [`procedure${index}Jurisdiction`]: procedure.jurisdiction ?? "",
    [`procedure${index}HandlingAgency`]: procedure.handlingAgency ?? "",
    [`procedure${index}Panel`]: procedure.panel ?? "",
    [`procedure${index}Handler`]: procedure.handler ?? "",
    [`procedure${index}OurStanding`]: label(litigationStandingLabel, procedure.ourStanding),
    [`procedure${index}LeadLawyer`]: procedure.leadLawyer?.name ?? "",
    [`procedure${index}ExternalLead`]: yesNo(procedure.isExternalLead),
    [`procedure${index}AcceptedAt`]: formatDate(procedure.acceptedAt),
    [`procedure${index}ConcludedAt`]: formatDate(procedure.concludedAt),
    [`procedure${index}Outcome`]: label(procedureOutcomeLabel, procedure.outcome),
    [`procedure${index}OutcomeNote`]: procedure.outcomeNote ?? "",
    [`procedure${index}PresidingJudge`]: procedure.presidingJudge ?? "",
    [`procedure${index}PresidingJudgeContact`]: procedure.presidingJudgeContact ?? "",
    [`procedure${index}JudgeAssistant`]: procedure.judgeAssistant ?? "",
    [`procedure${index}JudgeAssistantContact`]: procedure.judgeAssistantContact ?? "",
    [`procedure${index}Parties`]: procedure.procedureParties
      .map((row) => `${label(litigationStandingLabel, row.standing)}：${formatParty(row.party)}`)
      .join("；")
  };
}

function formatProcedureSummary(procedures: MatterExportRow["procedures"]) {
  return procedures
    .map((procedure) =>
      [
        label(procedureTypeLabel, procedure.type),
        procedure.customLabel,
        procedure.caseNumber,
        procedure.handlingAgency,
        procedure.status ? procedureStatusLabel[procedure.status] : "",
        procedure.acceptedAt ? `受理:${formatDate(procedure.acceptedAt)}` : "",
        procedure.concludedAt ? `结案:${formatDate(procedure.concludedAt)}` : "",
        procedure.outcome ? `结果:${procedureOutcomeLabel[procedure.outcome]}` : ""
      ].filter(Boolean).join(" / ")
    )
    .join("；");
}

function formatParties(parties: { role: PartyRole; standing: LitigationStanding | null; partyType: PartyType; name: string; idNumber: string | null; enterpriseSocialCode: string | null; phone: string | null; address: string | null; legalRep: string | null; contactName: string | null; notes: string | null }[]) {
  return parties
    .map((party) => `${partyRoleLabel[party.role]}：${formatParty(party)}`)
    .join("；");
}

function formatParty(party: {
  standing?: LitigationStanding | null;
  partyType: PartyType;
  name: string;
  idNumber?: string | null;
  enterpriseSocialCode?: string | null;
  phone?: string | null;
  address?: string | null;
  legalRep?: string | null;
  contactName?: string | null;
  notes?: string | null;
}) {
  const detail = [
    label(litigationStandingLabel, party.standing),
    partyTypeLabel[party.partyType],
    party.idNumber ? `证件:${party.idNumber}` : "",
    party.enterpriseSocialCode ? `代码:${party.enterpriseSocialCode}` : "",
    party.phone ? `电话:${party.phone}` : "",
    party.legalRep ? `法定代表人:${party.legalRep}` : "",
    party.contactName ? `联系人:${party.contactName}` : "",
    party.address ? `地址:${party.address}` : "",
    party.notes ? `备注:${party.notes}` : ""
  ].filter(Boolean);
  return detail.length > 0 ? `${party.name}（${detail.join("，")}）` : party.name;
}

function formatContacts(
  contacts: { name: string; title: string | null; phone: string | null; email: string | null; isPrimary: boolean }[]
) {
  return contacts
    .map((contact) =>
      [
        contact.isPrimary ? "主" : "",
        contact.name,
        contact.title,
        contact.phone,
        contact.email
      ].filter(Boolean).join(" / ")
    )
    .join("；");
}

function formatDocuments(documents: { name: string; category: string; createdAt: Date }[]) {
  return documents
    .map((doc) => `${doc.name}（${doc.category}，${formatDate(doc.createdAt)}）`)
    .join("；");
}

function formatRelatedMatters(matter: MatterExportRow) {
  const from = matter.linksFrom.map((link) => link.relatedMatter);
  const to = matter.linksTo.map((link) => link.matter);
  return [...from, ...to]
    .map((row) => `${row.firmCaseNo ?? row.internalCode} ${row.title}`)
    .join("；");
}

function polishSheet(sheet: ExcelJS.Worksheet, moneyColumnKeys: string[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount }
  };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });
  const columnKeys = new Set(sheet.columns.map((column) => column.key).filter(Boolean));
  for (const key of moneyColumnKeys) {
    if (columnKeys.has(key)) {
      sheet.getColumn(key).numFmt = "#,##0.00";
    }
  }
}

function buildFilename(tab: MattersExportTab) {
  return `lawlink-matters-${TAB_FILE_KEY[tab]}-${formatDate(new Date())}.xlsx`;
}

function sheetName(name: string) {
  return name.replace(/[\\/:*?\[\]]/g, "").slice(0, 31) || "Sheet";
}

function cleanText(input: string | null) {
  const value = input?.trim();
  return value || undefined;
}

function cleanDateText(input: string | null) {
  const value = cleanText(input);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function resolveDateBoundary(input: string | undefined, endOfDay: boolean) {
  if (!input) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "";
  return `${formatDate(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function decimalNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return Number(value);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "是" : "否";
}

function label<T extends string>(
  labels: Partial<Record<T, string>>,
  value: T | null | undefined
) {
  return value ? labels[value] ?? value : "";
}

function formatJson(value: Prisma.JsonValue) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.length > 0 ? JSON.stringify(value) : "";
  if (typeof value === "object") {
    return Object.keys(value).length > 0 ? JSON.stringify(value) : "";
  }
  return String(value);
}
