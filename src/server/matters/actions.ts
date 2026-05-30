"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type LitigationStanding } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { matterVisibilityFilter, assertCanAccessMatter } from "@/lib/permissions";
import { generateInternalCode } from "./code-generator";
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

  const where: Prisma.MatterWhereInput = {
    ...matterVisibilityFilter(session.user.id, session.user.role),
    deletedAt: null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.statusIn ? { status: { in: query.statusIn } } : {}),
    ...(query.statusNotIn ? { status: { notIn: query.statusNotIn } } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.clientId ? { primaryClientId: query.clientId } : {}),
    ...(query.intakeDateFrom || query.intakeDateTo
      ? {
          intakeDate: {
            ...(query.intakeDateFrom ? { gte: query.intakeDateFrom } : {}),
            ...(query.intakeDateTo ? { lte: query.intakeDateTo } : {})
          }
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { internalCode: { contains: query.search, mode: "insensitive" } },
            { primaryClient: { name: { contains: query.search, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.matter.findMany({
      where,
      // 默认按收案时间倒序（用户偏好）；intakeDate 为空的旧数据回落到 updatedAt
      orderBy: [
        { intakeDate: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" }
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        primaryClient: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        cause: { select: { id: true, name: true } },
        procedures: {
          where: { engagement: "ENGAGED" },
          orderBy: { order: "desc" },
          take: 1,
          select: { id: true, type: true, caseNumber: true, status: true }
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

  // v0.39: 本页案件回款金额（FeeEntry RECEIVED 聚合，一次查询）
  const receivedByMatter = new Map<string, number>();
  if (items.length > 0) {
    const grouped = await prisma.feeEntry.groupBy({
      by: ["matterId"],
      where: { type: "RECEIVED", matterId: { in: items.map((m) => m.id) } },
      _sum: { amount: true }
    });
    for (const g of grouped) {
      receivedByMatter.set(g.matterId, Number(g._sum.amount ?? 0));
    }
  }

  const itemsWithReceived = items.map((m) => ({
    ...m,
    receivedAmount: receivedByMatter.get(m.id) ?? 0
  }));

  return { items: itemsWithReceived, total, page: query.page, pageSize: query.pageSize };
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
}) {
  const session = await requireSession();
  const proc = await prisma.matterProcedure.findUnique({
    where: { id: input.procedureId },
    select: { matterId: true }
  });
  if (!proc) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, proc.matterId);
  await assertMatterWritable(proc.matterId);

  await prisma.matterProcedure.update({
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
  await audit({
    userId: session.user.id,
    action: "PROCEDURE_INFO_UPDATE",
    targetType: "MatterProcedure",
    targetId: input.procedureId,
    detail: { matterId: proc.matterId }
  });
  revalidatePath(`/matters/${proc.matterId}`);
}

// v0.32: 关联案件 —— 搜索 / 关联 / 解除
export async function searchMattersForLink(matterId: string, q: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
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
      ...matterVisibilityFilter(session.user.id, session.user.role),
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
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
  await assertCanAccessMatter(session.user.id, session.user.role, relatedMatterId);
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
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
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
      clientLinks: { include: { client: { select: { id: true, name: true, type: true } } } },
      owner: { select: { id: true, name: true, role: true } },
      members: {
        include: { user: { select: { id: true, name: true, role: true } } }
      },
      cause: true,
      parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
      relatedEntities: { orderBy: { createdAt: "asc" } },
      intake: { select: { counterclaim: true } },
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
          stages: { orderBy: { order: "asc" } }
        }
      },
      tasks: {
        orderBy: [{ completed: "asc" }, { dueAt: "asc" }]
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
  const [primaryClientId, ...otherClientIds] = data.clientIds;

  const created = await prisma.$transaction(async (tx) => {
    const matter = await tx.matter.create({
      data: {
        internalCode,
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
 * - 仅 ADMIN / PRINCIPAL_LAWYER / 当前 LEAD 可操作
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

  const canEdit =
    session.user.role === "ADMIN" ||
    session.user.role === "PRINCIPAL_LAWYER" ||
    matter.ownerId === session.user.id;
  if (!canEdit) throw new Error("无权修改团队");

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

  const canEdit =
    session.user.role === "ADMIN" ||
    session.user.role === "PRINCIPAL_LAWYER" ||
    matter.ownerId === session.user.id;
  if (!canEdit) throw new Error("无权编辑案件基本信息");

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
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("只有管理员或主办律师可以删除案件");
  }

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
