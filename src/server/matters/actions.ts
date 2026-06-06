"use server";

import { revalidatePath } from "next/cache";
import { LitigationStanding, PartyRole, PartyType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import {
  matterAssociationFilter,
  matterVisibilityFilter,
  assertCanAccessMatter,
  assertCanAssociateMatter,
  assertCanOwnMatter
} from "@/lib/permissions";
import { generateInternalCode, generateFirmCaseNo } from "./code-generator";
import { seedDefaultFolders } from "@/lib/default-folders";
import {
  matterCreateSchema,
  matterListQuerySchema,
  matterUpdateBasicSchema,
  type MatterCreateInput,
  type MatterListQuery,
  type MatterUpdateBasicInput
} from "./schemas";

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out as T;
}

export async function listMatters(input: Partial<MatterListQuery> = {}) {
  const session = await requireSession();
  const query = matterListQuerySchema.parse(input);

  const whereParts: Prisma.MatterWhereInput[] = [
    matterVisibilityFilter(session.user.id, session.user.role),
    { deletedAt: null }
  ];
  if (query.category) whereParts.push({ category: query.category });
  if (query.status) whereParts.push({ status: query.status });
  if (query.statusIn) whereParts.push({ status: { in: query.statusIn } });
  if (query.statusNotIn) whereParts.push({ status: { notIn: query.statusNotIn } });
  if (query.ownerId) whereParts.push({ ownerId: query.ownerId });
  if (query.clientId) whereParts.push({ primaryClientId: query.clientId });
  if (query.intakeDateFrom || query.intakeDateTo) {
    whereParts.push({
      intakeDate: {
        ...(query.intakeDateFrom ? { gte: query.intakeDateFrom } : {}),
        ...(query.intakeDateTo ? { lte: query.intakeDateTo } : {})
      }
    });
  }
  if (query.search) {
    whereParts.push({
      OR: [
        { title: { contains: query.search, mode: "insensitive" } },
        { internalCode: { contains: query.search, mode: "insensitive" } },
        { primaryClient: { name: { contains: query.search, mode: "insensitive" } } }
      ]
    });
  }
  const where: Prisma.MatterWhereInput = { AND: whereParts };

  const compareNullable = <T>(
    a: T | null | undefined,
    b: T | null | undefined,
    compare: (x: T, y: T) => number
  ) => {
    const aEmpty = a === null || a === undefined;
    const bEmpty = b === null || b === undefined;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return compare(a as T, b as T);
  };

  const [allItems, total] = await Promise.all([
    prisma.matter.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        primaryClient: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        cause: { select: { id: true, name: true } },
        procedures: {
          where: { engagement: "ENGAGED" },
          orderBy: { order: "desc" },
          take: 20,
          select: {
            id: true,
            type: true,
            caseNumber: true,
            status: true,
            hearings: {
              orderBy: { startsAt: "desc" },
              take: 1,
              select: { startsAt: true }
            }
          }
        },
        // v0.8.1: 卡片化需要前几位对方/第三人
        parties: {
          where: { role: { in: ["OPPOSING_PARTY", "THIRD_PARTY"] } },
          orderBy: [{ role: "asc" }, { ordinal: "asc" }],
          take: 3,
          select: { id: true, name: true, role: true, standing: true }
        },
        // v0.16: 是否有归档申请待审批
        archiveRecords: {
          where: { status: "PENDING_REVIEW" },
          take: 1,
          select: { id: true }
        },
        _count: { select: { procedures: true } }
      }
    }),
    prisma.matter.count({ where })
  ]);

  const sorted = allItems
    .map((matter) => ({
      ...matter,
      latestHearingAt:
        matter.procedures
          .map((p) => p.hearings[0]?.startsAt ?? null)
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    }))
    .sort((a, b) => {
      const sortValue = (matter: typeof a) => {
        if (query.sortBy === "hearing") return matter.latestHearingAt;
        if (query.sortBy === "claimAmount") {
          return matter.claimAmount === null || matter.claimAmount === undefined
            ? null
            : Number(matter.claimAmount);
        }
        return matter.intakeDate;
      };
      const aValue = sortValue(a);
      const bValue = sortValue(b);
      const aEmpty = aValue === null || aValue === undefined;
      const bEmpty = bValue === null || bValue === undefined;
      if (aEmpty && bEmpty) return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const direction = query.sortDir === "asc" ? 1 : -1;
      const base =
        aValue instanceof Date || bValue instanceof Date
          ? compareNullable(aValue as Date | null, bValue as Date | null, (x, y) => x.getTime() - y.getTime())
          : compareNullable(aValue as number | null, bValue as number | null, (x, y) => x - y);
      if (base !== 0) return base * direction;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const start = (query.page - 1) * query.pageSize;
  const items = sorted.slice(start, start + query.pageSize);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

// v0.32: 程序级基本信息编辑
export async function updateProcedureInfo(input: {
  procedureId: string;
  jurisdiction?: string;
  handlingAgency?: string;
  caseNumber?: string;
  presidingJudge?: string;
  presidingJudgeContact?: string;
  judgeAssistant?: string;
  judgeAssistantContact?: string;
  ourStanding?: string | null;
  acceptedAt?: string | null;
  concludedAt?: string | null;
  procedureParties?: { partyId: string; standing: LitigationStanding }[];
  newProcedureParties?: {
    existingPartyId?: string | null;
    name: string;
    role: PartyRole;
    partyType: PartyType;
    idNumber?: string;
    enterpriseSocialCode?: string;
    standings: LitigationStanding[];
  }[];
}) {
  const session = await requireSession();
  const proc = await prisma.matterProcedure.findUnique({
    where: { id: input.procedureId },
    select: { matterId: true }
  });
  if (!proc) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, proc.matterId);
  await assertMatterWritable(proc.matterId);

  const partyRows = input.procedureParties
    ? normalizeProcedureParties(input.procedureParties)
    : null;
  const newPartyRows = normalizeNewProcedureParties(input.newProcedureParties ?? []);
  if ((input.newProcedureParties?.length ?? 0) !== newPartyRows.length) {
    throw new Error("新增程序当事人信息不完整");
  }

  if (partyRows) {
    const partyIds = [...new Set(partyRows.map((row) => row.partyId))];
    const realPartyIds = partyIds.filter((partyId) => !partyId.startsWith("client:"));
    const clientIds = partyIds
      .filter((partyId) => partyId.startsWith("client:"))
      .map((partyId) => partyId.slice("client:".length));
    const validParties = await prisma.party.findMany({
      where: { matterId: proc.matterId, id: { in: realPartyIds } },
      select: { id: true }
    });
    const validPartyIds = new Set(validParties.map((p) => p.id));
    const matterClients =
      clientIds.length > 0
        ? await prisma.matter.findUnique({
            where: { id: proc.matterId },
            select: {
              primaryClientId: true,
              clientLinks: { select: { clientId: true } }
            }
          })
        : null;
    const validClientIds = new Set([
      ...(matterClients?.primaryClientId ? [matterClients.primaryClientId] : []),
      ...(matterClients?.clientLinks.map((link) => link.clientId) ?? [])
    ]);
    if (
      partyRows.some(
        (row) =>
          !row.partyId.startsWith("client:") &&
          !validPartyIds.has(row.partyId)
      ) ||
      clientIds.some((clientId) => !validClientIds.has(clientId))
    ) {
      throw new Error("存在不属于本案的当事人");
    }
  }

  await prisma.$transaction(async (tx) => {
    const mergedProcedureParties = [...(partyRows ?? [])];
    for (const row of mergedProcedureParties) {
      if (row.partyId.startsWith("client:")) {
        row.partyId = await ensureClientParty(tx, proc.matterId, row.partyId.slice("client:".length), row.standing);
      }
    }
    if (newPartyRows.length > 0) {
      const nextOrdinalByRole = new Map<PartyRole, number>();
      for (const role of [...new Set(newPartyRows.map((row) => row.role))]) {
        const max = await tx.party.aggregate({
          where: { matterId: proc.matterId, role },
          _max: { ordinal: true }
        });
        nextOrdinalByRole.set(role, (max._max.ordinal ?? 0) + 1);
      }

      for (const row of newPartyRows) {
        let partyId = row.existingPartyId ?? null;
        if (partyId) {
          const existingParty = await tx.party.findFirst({
            where: { id: partyId, matterId: proc.matterId },
            select: { id: true }
          });
          if (!existingParty) throw new Error("存在不属于本案的当事人");
          await tx.party.update({
            where: { id: existingParty.id },
            data: {
              role: row.role,
              name: row.name,
              partyType: row.partyType,
              standing: row.standings[0] ?? null,
              idNumber: row.partyType === "NATURAL_PERSON" ? row.idNumber : null,
              enterpriseSocialCode:
                row.partyType === "NATURAL_PERSON" ? null : row.enterpriseSocialCode,
              enterpriseName: row.partyType === "NATURAL_PERSON" ? null : row.name
            }
          });
        } else {
          const ordinal = nextOrdinalByRole.get(row.role) ?? 1;
          nextOrdinalByRole.set(row.role, ordinal + 1);
          const createdParty = await tx.party.create({
            data: {
              matterId: proc.matterId,
              role: row.role,
              ordinal,
              name: row.name,
              partyType: row.partyType,
              standing: row.standings[0] ?? null,
              idNumber: row.partyType === "NATURAL_PERSON" ? row.idNumber : null,
              enterpriseSocialCode:
                row.partyType === "NATURAL_PERSON" ? null : row.enterpriseSocialCode,
              enterpriseName: row.partyType === "NATURAL_PERSON" ? null : row.name
            },
            select: { id: true }
          });
          partyId = createdParty.id;
        }

        for (const standing of row.standings) {
          mergedProcedureParties.push({ partyId, standing });
        }
      }
    }

    await tx.matterProcedure.update({
      where: { id: input.procedureId },
      data: {
        jurisdiction: input.jurisdiction?.trim() || null,
        handlingAgency: input.handlingAgency?.trim() || null,
        caseNumber: input.caseNumber?.trim() || null,
        presidingJudge: input.presidingJudge?.trim() || null,
        presidingJudgeContact: input.presidingJudgeContact?.trim() || null,
        judgeAssistant: input.judgeAssistant?.trim() || null,
        judgeAssistantContact: input.judgeAssistantContact?.trim() || null,
        ourStanding: input.ourStanding ? (input.ourStanding as LitigationStanding) : null,
        acceptedAt: input.acceptedAt ? new Date(input.acceptedAt) : null,
        concludedAt: input.concludedAt ? new Date(input.concludedAt) : null
      }
    });

    if (partyRows || newPartyRows.length > 0) {
      await tx.procedureParty.deleteMany({ where: { procedureId: input.procedureId } });
      if (mergedProcedureParties.length > 0) {
        await tx.procedureParty.createMany({
          data: mergedProcedureParties.map((row, idx) => ({
            procedureId: input.procedureId,
            partyId: row.partyId,
            standing: row.standing,
            ordinal: idx + 1
          })),
          skipDuplicates: true
        });
      }
    }
  });
  await audit({
    userId: session.user.id,
    action: "PROCEDURE_INFO_UPDATE",
    targetType: "MatterProcedure",
    targetId: input.procedureId,
    detail: { matterId: proc.matterId }
  });
  revalidatePath(`/matters/${proc.matterId}`);
}

type NewProcedurePartyInput = {
  existingPartyId?: string | null;
  name: string;
  role: PartyRole;
  partyType: PartyType;
  idNumber?: string;
  enterpriseSocialCode?: string;
  standings: LitigationStanding[];
};

function clientTypeToPartyType(type: "INDIVIDUAL" | "COMPANY" | "ORGANIZATION"): PartyType {
  if (type === "INDIVIDUAL") return "NATURAL_PERSON";
  if (type === "COMPANY") return "COMPANY";
  return "OTHER_ORG";
}

async function ensureClientParty(
  tx: Prisma.TransactionClient,
  matterId: string,
  clientId: string,
  standing: LitigationStanding
) {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, type: true, idNumber: true }
  });
  if (!client) throw new Error("客户不存在");

  const existing = await tx.party.findFirst({
    where: {
      matterId,
      role: "CLIENT_PARTY",
      name: client.name
    },
    select: { id: true }
  });
  if (existing) return existing.id;

  const max = await tx.party.aggregate({
    where: { matterId, role: "CLIENT_PARTY" },
    _max: { ordinal: true }
  });
  const partyType = clientTypeToPartyType(client.type);
  const created = await tx.party.create({
    data: {
      matterId,
      role: "CLIENT_PARTY",
      ordinal: (max._max.ordinal ?? 0) + 1,
      name: client.name,
      partyType,
      standing,
      idNumber: partyType === "NATURAL_PERSON" ? client.idNumber : null,
      enterpriseSocialCode: partyType === "NATURAL_PERSON" ? null : client.idNumber,
      enterpriseName: partyType === "NATURAL_PERSON" ? null : client.name,
      notes: "由案件关联客户自动补入"
    },
    select: { id: true }
  });
  return created.id;
}

function normalizeProcedureParties(
  rows: { partyId: string; standing: LitigationStanding }[]
) {
  const standingValues = new Set(Object.values(LitigationStanding));
  const seen = new Set<string>();
  return rows
    .filter((row) => row.partyId && standingValues.has(row.standing))
    .map((row) => ({ ...row, standing: normalizeLitigationStanding(row.standing) }))
    .filter((row) => {
      const key = `${row.partyId}:${row.standing}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeLitigationStanding(standing: LitigationStanding): LitigationStanding {
  if (standing === "JOINT_PLAINTIFF") return "PLAINTIFF";
  if (standing === "JOINT_DEFENDANT") return "DEFENDANT";
  return standing;
}

function normalizeNewProcedureParties(rows: NewProcedurePartyInput[]) {
  const standingValues = new Set(Object.values(LitigationStanding));
  const roleValues = new Set(Object.values(PartyRole));
  const partyTypeValues = new Set(Object.values(PartyType));
  return rows
    .map((row) => ({
      existingPartyId: row.existingPartyId || null,
      name: row.name.trim(),
      role: row.role,
      partyType: row.partyType,
      idNumber: row.idNumber?.trim() ?? "",
      enterpriseSocialCode: row.enterpriseSocialCode?.trim() ?? "",
      standings: [
        ...new Set(
          row.standings
            .filter((standing) => standingValues.has(standing))
            .map((standing) => normalizeLitigationStanding(standing))
        )
      ]
    }))
    .filter(
      (row) =>
        row.name &&
        roleValues.has(row.role) &&
        partyTypeValues.has(row.partyType) &&
        row.standings.length > 0 &&
        (row.partyType === "NATURAL_PERSON"
          ? row.idNumber
          : row.enterpriseSocialCode)
    );
}

// v0.32: 关联案件 —— 搜索 / 关联 / 解除
export async function searchMattersForLink(matterId: string, q: string) {
  const session = await requireSession();
  await assertCanAssociateMatter(session.user.id, matterId);
  const query = q.trim();
  // 已关联的（两个方向）排除
  const links = await prisma.matterLink.findMany({
    where: { OR: [{ matterId }, { relatedMatterId: matterId }] },
    select: { matterId: true, relatedMatterId: true }
  });
  const excludeIds = new Set<string>([matterId]);
  links.forEach((l) => {
    excludeIds.add(l.matterId);
    excludeIds.add(l.relatedMatterId);
  });
  const items = await prisma.matter.findMany({
    where: {
      deletedAt: null,
      id: { notIn: Array.from(excludeIds) },
      ...matterAssociationFilter(session.user.id),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { internalCode: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    },
    select: { id: true, internalCode: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 8
  });
  return items;
}

export async function addMatterLink(matterId: string, relatedMatterId: string) {
  const session = await requireSession();
  await assertCanAssociateMatter(session.user.id, matterId);
  await assertCanAssociateMatter(session.user.id, relatedMatterId);
  if (matterId === relatedMatterId) throw new Error("不能关联到自身");
  await prisma.matterLink.upsert({
    where: { matterId_relatedMatterId: { matterId, relatedMatterId } },
    create: { matterId, relatedMatterId },
    update: {}
  });
  await audit({
    userId: session.user.id,
    action: "MATTER_LINK_ADD",
    targetType: "Matter",
    targetId: matterId,
    detail: { relatedMatterId }
  });
  revalidatePath(`/matters/${matterId}`);
}

export async function removeMatterLink(matterId: string, relatedMatterId: string) {
  const session = await requireSession();
  await assertCanAssociateMatter(session.user.id, matterId);
  await assertCanAssociateMatter(session.user.id, relatedMatterId);
  // 两个方向都删（无论当初谁关联谁）
  await prisma.matterLink.deleteMany({
    where: {
      OR: [
        { matterId, relatedMatterId },
        { matterId: relatedMatterId, relatedMatterId: matterId }
      ]
    }
  });
  await audit({
    userId: session.user.id,
    action: "MATTER_LINK_REMOVE",
    targetType: "Matter",
    targetId: matterId,
    detail: { relatedMatterId }
  });
  revalidatePath(`/matters/${matterId}`);
}

export async function getMatterById(id: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, id);
  const matter = await prisma.matter.findFirst({
    where: { id, deletedAt: null },
    include: {
      primaryClient: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
      clientLinks: { include: { client: { select: { id: true, name: true, type: true, idNumber: true } } } },
      owner: { select: { id: true, name: true, role: true } },
      members: {
        include: { user: { select: { id: true, name: true, role: true } } }
      },
      cause: true,
      parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
      relatedEntities: { orderBy: { createdAt: "asc" } },
      intake: { select: { counterclaim: true, claimDescription: true } },
      linksFrom: {
        include: { relatedMatter: { select: { id: true, internalCode: true, title: true } } }
      },
      linksTo: {
        include: { matter: { select: { id: true, internalCode: true, title: true } } }
      },
      procedures: {
        orderBy: { order: "asc" },
        include: {
          deadlines: { orderBy: [{ completed: "asc" }, { dueAt: "asc" }] },
          hearings: { orderBy: { startsAt: "asc" } },
          stages: { orderBy: { order: "asc" } },
          procedureParties: {
            orderBy: [{ standing: "asc" }, { ordinal: "asc" }],
            include: { party: true }
          },
          memos: { orderBy: [{ done: "asc" }, { createdAt: "desc" }] }
        }
      },
      timelineEvents: { orderBy: { occurredAt: "desc" }, take: 50 }
    }
  });

  if (matter) {
    await audit({
      userId: session.user.id,
      action: "MATTER_VIEW",
      targetType: "Matter",
      targetId: id
    });
  }
  return matter;
}

export async function createMatter(input: MatterCreateInput) {
  const session = await requireSession();
  const data = matterCreateSchema.parse(input);

  const internalCode = await generateInternalCode(data.category);
  const firmCaseNo = await generateFirmCaseNo(data.category);
  const [primaryClientId, ...otherClientIds] = data.clientIds;

  const created = await prisma.$transaction(async (tx) => {
    const matter = await tx.matter.create({
      data: {
        internalCode,
        firmCaseNo,
        title: data.title,
        category: data.category,
        ownerId: session.user.id,

        ...emptyToNull({
          causeId: data.causeId,
          causeFreeText: data.causeFreeText
        }),

        claimAmount: data.claimAmount ?? undefined,
        ourStanding: data.ourStanding,
        counterclaimAsPlaintiff: data.counterclaimAsPlaintiff,
        counterclaimAsDefendant: data.counterclaimAsDefendant,
        intakeDate: data.intakeDate ?? new Date(),

        primaryClientId,

        // 主办律师默认是创建者
        members: {
          create: { userId: session.user.id, role: "LEAD" }
        },

        // 多客户关联表
        clientLinks: {
          create: data.clientIds.map((cid, idx) => ({
            clientId: cid,
            isPrimary: idx === 0,
            label: idx === 0 ? "主要委托方" : `委托方 ${idx + 1}`
          }))
        },

        // 当事人
        parties: {
          create: data.parties.map((p) =>
            emptyToNull({
              role: p.role,
              ordinal: p.ordinal,
              name: p.name,
              partyType: p.partyType,
              idNumber: p.idNumber,
              phone: p.phone,
              address: p.address,
              legalRep: p.legalRep,
              contactName: p.contactName,
              enterpriseSocialCode: p.enterpriseSocialCode,
              enterpriseName: p.enterpriseName,
              notes: p.notes
            })
          )
        },

        // 首程序
        procedures: {
          create: {
            type: data.firstProcedure.type,
            customLabel: data.firstProcedure.customLabel || null,
            engagement: "ENGAGED",
            order: 1,
            caseNumber: data.firstProcedure.caseNumber || null,
            handlingAgency: data.firstProcedure.handlingAgency || null,
            acceptedAt: data.firstProcedure.acceptedAt,
            status: "IN_PROGRESS"
          }
        },

        firstAcceptedAt: data.firstProcedure.acceptedAt
      }
    });

    // TimelineEvent: 案件创建
    await tx.timelineEvent.create({
      data: {
        matterId: matter.id,
        eventType: "MATTER_CREATED",
        title: "案件已创建",
        occurredAt: new Date()
      }
    });

    // v0.8: 默认卷宗
    await seedDefaultFolders(tx, matter.id, data.category);

    // 标记 otherClientIds 避免被 lint 误判未用
    void otherClientIds;

    return matter;
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_CREATE",
    targetType: "Matter",
    targetId: created.id,
    detail: { internalCode: created.internalCode, title: created.title }
  });

  revalidatePath("/matters");
  return { ok: true, id: created.id, internalCode: created.internalCode };
}

/**
 * v0.5: 更新案件团队。
 * - 仅当前主办律师可操作；管理角色只负责审批，不因角色放开他人案件处理权
 * - ownerId 改变时同步替换 MatterMember 中的 LEAD
 * - coLeadIds 和 assistantIds 覆盖式更新对应角色（不影响主办自动 LEAD）
 */
export async function updateMatterTeam(input: {
  matterId: string;
  ownerId: string;
  coLeadIds: string[];
  assistantIds: string[];
}) {
  const session = await requireSession();
  const matter = await prisma.matter.findUnique({
    where: { id: input.matterId, deletedAt: null },
    select: { id: true, ownerId: true }
  });
  if (!matter) throw new Error("案件不存在");
  await assertMatterWritable(input.matterId);
  await assertCanOwnMatter(session.user.id, input.matterId, "只有当前主办律师可以修改承办团队");

  // 校验：coLeadIds / assistantIds 不能与 ownerId 重叠
  const co = input.coLeadIds.filter((id) => id !== input.ownerId);
  const ass = input.assistantIds.filter(
    (id) => id !== input.ownerId && !co.includes(id)
  );

  await prisma.$transaction(async (tx) => {
    // 更新 Matter.ownerId
    if (matter.ownerId !== input.ownerId) {
      await tx.matter.update({
        where: { id: input.matterId },
        data: { ownerId: input.ownerId }
      });
    }

    // 重建 MatterMember：先删除全部，再按新结构插入
    await tx.matterMember.deleteMany({ where: { matterId: input.matterId } });

    const rows = [
      { matterId: input.matterId, userId: input.ownerId, role: "LEAD" as const },
      ...co.map((uid) => ({
        matterId: input.matterId,
        userId: uid,
        role: "CO_LEAD" as const
      })),
      ...ass.map((uid) => ({
        matterId: input.matterId,
        userId: uid,
        role: "ASSISTANT" as const
      }))
    ];
    await tx.matterMember.createMany({ data: rows, skipDuplicates: true });
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_TEAM_UPDATE",
    targetType: "Matter",
    targetId: input.matterId,
    detail: { ownerId: input.ownerId, coLeads: co.length, assistants: ass.length }
  });

  // v0.43 项4：写入案件动态时间线
  await prisma.timelineEvent.create({
    data: {
      matterId: input.matterId,
      eventType: "TEAM_CHANGED",
      title: "更新办案团队",
      occurredAt: new Date(),
      refType: "Matter",
      refId: input.matterId
    }
  });

  revalidatePath(`/matters/${input.matterId}`);
  return { ok: true };
}

// v0.27: 编辑案件基本信息（系统编号 + 收案日期 readonly，状态走 lifecycle）
export async function updateMatterBasicInfo(input: MatterUpdateBasicInput) {
  const session = await requireSession();
  const data = matterUpdateBasicSchema.parse(input);

  const matter = await prisma.matter.findUnique({
    where: { id: data.id, deletedAt: null },
    select: { id: true, ownerId: true, title: true }
  });
  if (!matter) throw new Error("案件不存在");
  await assertMatterWritable(data.id);
  await assertCanOwnMatter(session.user.id, data.id, "只有当前主办律师可以编辑案件基本信息");

  await prisma.matter.update({
    where: { id: data.id },
    data: {
      title: data.title,
      causeId: data.causeId ? data.causeId : null,
      causeFreeText: data.causeFreeText ? data.causeFreeText : null,
      claimAmount:
        data.claimAmount === null || data.claimAmount === undefined
          ? null
          : new Prisma.Decimal(data.claimAmount),
      ourStanding: data.ourStanding ?? null
    }
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_BASIC_UPDATE",
    targetType: "Matter",
    targetId: data.id,
    detail: { titleBefore: matter.title, titleAfter: data.title }
  });

  revalidatePath(`/matters/${data.id}`);
  return { ok: true };
}

export async function softDeleteMatter(id: string) {
  const session = await requireSession();
  await assertMatterWritable(id);
  await assertCanOwnMatter(session.user.id, id, "只有当前主办律师可以删除案件");

  await prisma.matter.update({
    where: { id },
    data: { deletedAt: new Date() }
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_DELETE",
    targetType: "Matter",
    targetId: id
  });

  revalidatePath("/matters");
  return { ok: true };
}
