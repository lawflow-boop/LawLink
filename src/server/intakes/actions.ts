"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { intakeVisibilityFilter } from "@/lib/permissions";
import {
  intakeCreateSchema,
  intakeListQuerySchema,
  declineIntakeSchema,
  type IntakeCreateInput,
  type IntakeListQuery,
  type DeclineIntakeInput
} from "./schemas";
import { seedDefaultFolders } from "@/lib/default-folders";

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out as T;
}

function requireApprover(role: string) {
  if (role !== "ADMIN" && role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅管理员或主任律师可审批收案");
  }
}

/** 按 {委托方} 与 {对方} {案由} 自动生成标题 — 案由本身通常已含"纠纷"二字 */
function generateTitle(
  clientName: string | null,
  opposingNames: string[],
  causeName: string | null
): string {
  const left = clientName || "待补充委托方";
  const right = opposingNames.length > 0 ? opposingNames.join("、") : "待补充对方";
  const cause = causeName ?? "案件";
  return `${left} 与 ${right} ${cause}`;
}

export async function listIntakes(input: Partial<IntakeListQuery> = {}) {
  const session = await requireSession();
  const query = intakeListQuerySchema.parse(input);

  const where: Prisma.IntakeWhereInput = {
    ...intakeVisibilityFilter(session.user.id, session.user.role),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
            { client: { name: { contains: query.search, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.intake.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: { id: true, name: true, type: true } },
        cause: { select: { id: true, name: true } },
        conflictChecks: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: { id: true, conclusion: true, hits: { select: { severity: true } } }
        },
        parties: { where: { role: "OPPOSING_PARTY" }, select: { name: true } },
        matter: { select: { id: true, internalCode: true } },
        ownerUser: { select: { id: true, name: true } }
      }
    }),
    prisma.intake.count({ where })
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getIntakeById(id: string) {
  const session = await requireSession();
  // 单条收案权限检查：manager 看全部，其他人只能看自己参与或创建的
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    const owned = await prisma.intake.findFirst({
      where: {
        id,
        OR: [
          { createdById: session.user.id },
          { ownerUserId: session.user.id },
          { coUserIds: { has: session.user.id } }
        ]
      },
      select: { id: true }
    });
    if (!owned) throw new Error("收案记录不存在");
  }
  const intake = await prisma.intake.findUnique({
    where: { id },
    include: {
      client: true,
      cause: true,
      ownerUser: { select: { id: true, name: true, role: true } },
      parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
      conflictChecks: {
        orderBy: { checkedAt: "desc" },
        include: { hits: true, decidedBy: { select: { id: true, name: true } } }
      },
      matter: { select: { id: true, internalCode: true, title: true } },
      documents: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, category: true, size: true, createdAt: true }
      }
    }
  });
  if (intake) {
    await audit({
      userId: session.user.id,
      action: "INTAKE_VIEW",
      targetType: "Intake",
      targetId: id
    });
  }
  return intake;
}

export async function createIntake(input: IntakeCreateInput) {
  const session = await requireSession();
  const data = intakeCreateSchema.parse(input);

  // ----- 解析客户：已选 / 自由输入新建 -----
  let resolvedClientId: string | null = data.clientId || null;
  let resolvedClientName: string | null = null;

  if (!resolvedClientId && data.clientName && data.clientName.trim()) {
    const name = data.clientName.trim();
    const newClient = await prisma.client.create({
      data: {
        name,
        type: data.clientType ?? "INDIVIDUAL",
        phone: data.contactPhone || null,
        // 同步建一个主联系人
        contacts:
          data.contactName?.trim() || data.contactPhone?.trim()
            ? {
                create: {
                  name: (data.contactName || name).trim(),
                  phone: data.contactPhone?.trim() || null,
                  isPrimary: true
                }
              }
            : undefined
      }
    });
    resolvedClientId = newClient.id;
    resolvedClientName = name;
    await audit({
      userId: session.user.id,
      action: "CLIENT_AUTO_CREATE",
      targetType: "Client",
      targetId: newClient.id,
      detail: { name, type: newClient.type, source: "intake" }
    });
  } else if (resolvedClientId) {
    const c = await prisma.client.findUnique({
      where: { id: resolvedClientId },
      select: { name: true }
    });
    resolvedClientName = c?.name ?? null;

    // 已有客户也补一条联系人（如果填了且现有不存在同名联系人）
    if (data.contactName?.trim() || data.contactPhone?.trim()) {
      const existing = await prisma.contact.findFirst({
        where: {
          clientId: resolvedClientId,
          name: (data.contactName || resolvedClientName || "").trim() || undefined
        }
      });
      if (!existing) {
        await prisma.contact.create({
          data: {
            clientId: resolvedClientId,
            name: (data.contactName || resolvedClientName || "联系人").trim(),
            phone: data.contactPhone?.trim() || null,
            isPrimary: false
          }
        });
      }
    }
  }

  // ----- 案由名（用于自动 title）-----
  let causeName: string | null = data.causeFreeText || null;
  if (data.causeId) {
    const cause = await prisma.causeOfAction.findUnique({
      where: { id: data.causeId },
      select: { name: true }
    });
    causeName = cause?.name ?? causeName;
  }

  const opposingNames = data.parties
    .filter((p) => p.role === "OPPOSING_PARTY")
    .map((p) => p.name)
    .filter(Boolean);

  const finalTitle =
    data.title && data.title.trim()
      ? data.title.trim()
      : generateTitle(resolvedClientName, opposingNames, causeName);

  const created = await prisma.intake.create({
    data: {
      title: finalTitle,
      category: data.category,
      causeId: data.causeId || null,
      causeFreeText: data.causeFreeText || null,
      description: data.description || null,
      status: "PENDING_CONFIRMATION",
      receivedAt: data.receivedAt ?? new Date(),

      clientId: resolvedClientId,
      clientType: data.clientType ?? null,
      contactName: data.contactName?.trim() || null,
      contactPhone: data.contactPhone?.trim() || null,

      firstProcedureType: data.firstProcedureType ?? null,
      firstAgency: data.firstAgency?.trim() || null,
      ourStanding: data.ourStanding ?? null,
      claimAmount: data.claimAmount ?? null,
      claimDescription: data.claimDescription?.trim() || null,

      feeType: data.feeType ?? null,
      feeAmount: data.feeAmount ?? null,
      contingencyTerms: data.contingencyTerms?.trim() || null,
      feeSchedule: data.feeSchedule?.trim() || null,
      feeNote: data.feeNote?.trim() || null,

      ownerUserId: data.ownerUserId || session.user.id,
      coUserIds: data.coUserIds,

      createdById: session.user.id,
      parties: {
        create: data.parties.map((p) =>
          emptyToNull({
            role: p.role,
            standing: p.standing ?? null,
            ordinal: p.ordinal,
            name: p.name,
            idNumber: p.idNumber,
            phone: p.phone,
            address: p.address,
            legalRep: p.legalRep,
            notes: p.notes
          })
        )
      }
    }
  });

  await audit({
    userId: session.user.id,
    action: "INTAKE_CREATE",
    targetType: "Intake",
    targetId: created.id,
    detail: {
      title: created.title,
      category: created.category,
      autoTitle: !data.title,
      autoClient: !!resolvedClientName && !data.clientId
    }
  });

  revalidatePath("/intakes");
  revalidatePath("/matters");
  return { ok: true, id: created.id, clientId: resolvedClientId };
}

export async function declineIntake(input: DeclineIntakeInput) {
  const session = await requireSession();
  requireApprover(session.user.role);
  const data = declineIntakeSchema.parse(input);

  await prisma.intake.update({
    where: { id: data.id },
    data: {
      status: "DECLINED",
      declinedReason: data.reason
    }
  });

  await audit({
    userId: session.user.id,
    action: "INTAKE_DECLINE",
    targetType: "Intake",
    targetId: data.id,
    detail: { reason: data.reason }
  });

  revalidatePath("/intakes");
  revalidatePath(`/intakes/${data.id}`);
  revalidatePath("/matters");
  return { ok: true };
}

/** v0.14: 标记需补正 — 让律师补充材料后可再次提交（区别于 DECLINED 终态） */
export async function markIntakeNeedsRevision(input: { id: string; reason: string }) {
  const session = await requireSession();
  requireApprover(session.user.role);
  if (!input.reason.trim()) throw new Error("请填写补正原因");

  await prisma.intake.update({
    where: { id: input.id },
    data: {
      status: "NEEDS_REVISION",
      declinedReason: input.reason
    }
  });

  await audit({
    userId: session.user.id,
    action: "INTAKE_NEEDS_REVISION",
    targetType: "Intake",
    targetId: input.id,
    detail: { reason: input.reason }
  });

  revalidatePath("/intakes");
  revalidatePath(`/intakes/${input.id}`);
  revalidatePath("/matters");
  return { ok: true };
}

/** v0.14: 律师补完材料后重新提交（NEEDS_REVISION → PENDING_CONFIRMATION） */
export async function resubmitIntake(id: string) {
  const session = await requireSession();

  const intake = await prisma.intake.findUnique({
    where: { id },
    select: { status: true, createdById: true, ownerUserId: true }
  });
  if (!intake) throw new Error("收案不存在");
  if (intake.status !== "NEEDS_REVISION") throw new Error("只有待补正状态可重新提交");

  await prisma.intake.update({
    where: { id },
    data: {
      status: "PENDING_CONFIRMATION",
      declinedReason: null
    }
  });

  await audit({
    userId: session.user.id,
    action: "INTAKE_RESUBMIT",
    targetType: "Intake",
    targetId: id,
    detail: {}
  });

  revalidatePath("/intakes");
  revalidatePath(`/intakes/${id}`);
  revalidatePath("/matters");
  return { ok: true };
}

/** 转 Matter：把 intake 上的全部字段铺到 Matter / 首程序 / Billing / MatterMember / Document */
export async function convertIntakeToMatter(intakeId: string) {
  const session = await requireSession();
  requireApprover(session.user.role);
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    include: {
      parties: true,
      documents: { select: { id: true } }
    }
  });
  if (!intake) throw new Error("Intake 不存在");
  if (intake.status === "CONVERTED") throw new Error("此 Intake 已转化");

  const { generateInternalCode } = await import("@/server/matters/code-generator");
  const internalCode = await generateInternalCode(intake.category);

  // 首程序类型：优先用 intake 选的，缺失按案件类别推断
  const firstProcedureType =
    intake.firstProcedureType ??
    (intake.category === "CIVIL_COMMERCIAL" ||
    intake.category === "CRIMINAL" ||
    intake.category === "ADMINISTRATIVE"
      ? "FIRST_INSTANCE"
      : "NON_LITIGATION_PHASE");

  const matter = await prisma.$transaction(async (tx) => {
    const ownerId = intake.ownerUserId ?? session.user.id;

    const m = await tx.matter.create({
      data: {
        internalCode,
        title: intake.title,
        category: intake.category,
        ownerId,
        causeId: intake.causeId,
        causeFreeText: intake.causeFreeText,
        primaryClientId: intake.clientId,
        intakeId: intake.id,
        intakeDate: intake.receivedAt,
        ourStanding: intake.ourStanding,
        claimAmount: intake.claimAmount,
        // 主办自动作为 LEAD；coUserIds 作为 CO_LEAD
        members: {
          create: [
            { userId: ownerId, role: "LEAD" },
            ...intake.coUserIds
              .filter((uid) => uid !== ownerId)
              .map((uid) => ({ userId: uid, role: "CO_LEAD" as const }))
          ]
        },
        clientLinks: intake.clientId
          ? { create: { clientId: intake.clientId, isPrimary: true, label: "主要委托方" } }
          : undefined,
        parties: {
          create: intake.parties.map((p) => ({
            role: p.role,
            standing: p.standing,
            ordinal: p.ordinal,
            name: p.name,
            idNumber: p.idNumber,
            phone: p.phone,
            address: p.address,
            legalRep: p.legalRep,
            notes: p.notes
          }))
        },
        procedures: {
          create: {
            type: firstProcedureType,
            engagement: "ENGAGED",
            order: 1,
            status: "IN_PROGRESS",
            handlingAgency: intake.firstAgency
          }
        }
      }
    });

    // 律师费 → Billing
    if (intake.feeAmount && intake.feeType) {
      const feeTypeLabel: Record<string, string> = {
        FIXED: "固定收费",
        CONTINGENCY: "风险代理"
      };
      await tx.billing.create({
        data: {
          matterId: m.id,
          title: `委托代理合同 - ${feeTypeLabel[intake.feeType] ?? intake.feeType}`,
          contractAmount: intake.feeAmount,
          schedule: intake.feeSchedule,
          status: "ACTIVE"
        }
      });
    }

    // 把 Intake 上传的合同回填 matterId（保留 intakeId 溯源）
    if (intake.documents.length > 0) {
      await tx.document.updateMany({
        where: { intakeId: intake.id },
        data: { matterId: m.id }
      });
    }

    await tx.intake.update({
      where: { id: intake.id },
      data: { status: "CONVERTED" }
    });

    await tx.timelineEvent.create({
      data: {
        matterId: m.id,
        eventType: "MATTER_CREATED",
        title: `案件已创建（来自 Intake）`,
        occurredAt: new Date()
      }
    });

    // v0.8: 默认卷宗
    await seedDefaultFolders(tx, m.id, intake.category);

    return m;
  });

  await audit({
    userId: session.user.id,
    action: "INTAKE_CONVERT",
    targetType: "Intake",
    targetId: intake.id,
    detail: { matterId: matter.id, internalCode }
  });

  revalidatePath("/intakes");
  revalidatePath(`/intakes/${intake.id}`);
  revalidatePath("/matters");
  return { ok: true, matterId: matter.id, internalCode };
}
