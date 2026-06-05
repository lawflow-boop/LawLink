"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanAssociateMatter, matterAssociationFilter } from "@/lib/permissions";
import {
  preservationCreateSchema,
  preservationUpdateSchema,
  preservationListFilterSchema,
  preservationRenewSchema,
  preservationLiftSchema,
  preservationIdSchema
} from "./schemas";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function listPreservations(input?: z.input<typeof preservationListFilterSchema>) {
  const session = await requireSession();
  const filter = preservationListFilterSchema.parse(input ?? {});

  const accessWhere: Prisma.PreservationWhereInput = {
    OR: [
      { matter: { deletedAt: null, ...matterAssociationFilter(session.user.id) } },
      { matterId: null, ownerId: session.user.id }
    ]
  };
  const where: Prisma.PreservationWhereInput = { AND: [accessWhere] };
  if (filter.status !== "ALL") where.status = filter.status;
  if (filter.matterId) where.matterId = filter.matterId;
  if (filter.search) {
    where.AND = [
      accessWhere,
      {
        OR: [
          { respondent: { contains: filter.search, mode: "insensitive" } },
          { propertyDetail: { contains: filter.search, mode: "insensitive" } },
          { rulingNumber: { contains: filter.search, mode: "insensitive" } },
          { matter: { title: { contains: filter.search, mode: "insensitive" } } },
          { matter: { internalCode: { contains: filter.search, mode: "insensitive" } } }
        ]
      }
    ];
  }

  return prisma.preservation.findMany({
    where,
    orderBy: [{ status: "asc" }, { expiryDate: "asc" }],
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      owner: { select: { id: true, name: true } },
      renewals: { orderBy: { renewedAt: "desc" }, take: 3 }
    }
  });
}

export async function getPreservation(id: string) {
  const session = await requireSession();
  await assertCanAccessPreservation(session.user.id, id);
  return prisma.preservation.findUnique({
    where: { id },
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      owner: { select: { id: true, name: true } },
      renewals: {
        orderBy: { renewedAt: "desc" },
        include: { performedBy: { select: { id: true, name: true } } }
      }
    }
  });
}

type PreservationAccess = {
  id: string;
  matterId: string | null;
  ownerId: string | null;
};

async function assertCanAccessPreservationRecord(userId: string, record: PreservationAccess) {
  if (record.matterId) {
    await assertCanAssociateMatter(userId, record.matterId);
    return;
  }
  if (record.ownerId !== userId) throw new Error("无权操作此保全记录");
}

async function assertCanAccessPreservation(userId: string, id: string) {
  const record = await prisma.preservation.findUnique({
    where: { id },
    select: { id: true, matterId: true, ownerId: true }
  });
  if (!record) throw new Error("保全记录不存在");
  await assertCanAccessPreservationRecord(userId, record);
  return record;
}

// 用于 dashboard 预警
export async function listExpiringPreservations(daysAhead = 60) {
  const session = await requireSession();
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);

  return prisma.preservation.findMany({
    where: {
      status: { in: ["ACTIVE", "RENEWED"] },
      expiryDate: { lte: end },
      OR: [
        { matter: { deletedAt: null, ...matterAssociationFilter(session.user.id) } },
        { matterId: null, ownerId: session.user.id }
      ]
    },
    orderBy: { expiryDate: "asc" },
    include: {
      matter: { select: { id: true, internalCode: true, title: true } }
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function createPreservation(input: z.infer<typeof preservationCreateSchema>) {
  const session = await requireSession();
  const data = preservationCreateSchema.parse(input);

  if (data.expiryDate <= data.startDate) {
    throw new Error("到期日期必须晚于生效日期");
  }
  if (data.matterId) {
    const m = await prisma.matter.findUnique({
      where: { id: data.matterId },
      select: { id: true }
    });
    if (!m) throw new Error("关联案件不存在");
    await assertCanAssociateMatter(session.user.id, data.matterId);
    await assertMatterWritable(data.matterId);
  }

  const created = await prisma.preservation.create({
    data: {
      matterId: data.matterId ?? null,
      type: data.type,
      propertyType: data.propertyType,
      amount: data.amount != null ? new Prisma.Decimal(data.amount) : null,
      respondent: data.respondent.trim(),
      guaranteeType: data.guaranteeType ?? null,
      appliedAt: data.appliedAt ?? null,
      startDate: data.startDate,
      duration: data.duration,
      expiryDate: data.expiryDate,
      court: data.court?.trim() || null,
      rulingNumber: data.rulingNumber?.trim() || null,
      propertyDetail: data.propertyDetail?.trim() || null,
      note: data.note?.trim() || null,
      ownerId: data.ownerId ?? null,
      remindDays: data.remindDays,
      status: "ACTIVE"
    },
    select: { id: true, matterId: true }
  });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_CREATE",
    targetType: "Preservation",
    targetId: created.id,
    detail: { type: data.type, propertyType: data.propertyType }
  });

  revalidatePath("/preservation");
  if (created.matterId) revalidatePath(`/matters/${created.matterId}`);
  return { ok: true, id: created.id };
}

export async function updatePreservation(input: z.infer<typeof preservationUpdateSchema>) {
  const session = await requireSession();
  const data = preservationUpdateSchema.parse(input);
  const { id, amount, matterId, court, rulingNumber, propertyDetail, note, ownerId, guaranteeType, ...rest } = data;

  const existing = await prisma.preservation.findUnique({
    where: { id },
    select: { id: true, matterId: true }
  });
  if (!existing) throw new Error("保全记录不存在");
  if (existing.matterId) {
    await assertCanAssociateMatter(session.user.id, existing.matterId);
    await assertMatterWritable(existing.matterId);
  }
  if (matterId !== undefined && matterId !== existing.matterId) {
    if (matterId) {
      await assertCanAssociateMatter(session.user.id, matterId);
      await assertMatterWritable(matterId);
    }
  }

  if (rest.startDate && rest.expiryDate && rest.expiryDate <= rest.startDate) {
    throw new Error("到期日期必须晚于生效日期");
  }

  const patch: Prisma.PreservationUpdateInput = { ...rest };
  if (amount !== undefined) patch.amount = amount != null ? new Prisma.Decimal(amount) : null;
  if (matterId !== undefined) {
    patch.matter = matterId ? { connect: { id: matterId } } : { disconnect: true };
  }
  if (ownerId !== undefined) {
    patch.owner = ownerId ? { connect: { id: ownerId } } : { disconnect: true };
  }
  if (court !== undefined) patch.court = court?.trim() || null;
  if (rulingNumber !== undefined) patch.rulingNumber = rulingNumber?.trim() || null;
  if (propertyDetail !== undefined) patch.propertyDetail = propertyDetail?.trim() || null;
  if (note !== undefined) patch.note = note?.trim() || null;
  if (guaranteeType !== undefined) patch.guaranteeType = guaranteeType ?? null;

  await prisma.preservation.update({ where: { id }, data: patch });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_UPDATE",
    targetType: "Preservation",
    targetId: id
  });

  revalidatePath("/preservation");
  if (existing.matterId) revalidatePath(`/matters/${existing.matterId}`);
  return { ok: true };
}

export async function renewPreservation(input: z.infer<typeof preservationRenewSchema>) {
  const session = await requireSession();
  const data = preservationRenewSchema.parse(input);

  const pres = await prisma.preservation.findUnique({
    where: { id: data.id },
    select: { id: true, expiryDate: true, matterId: true, ownerId: true, status: true }
  });
  if (!pres) throw new Error("保全记录不存在");
  await assertCanAccessPreservationRecord(session.user.id, pres);
  if (pres.status === "LIFTED") throw new Error("已解除的保全不可续保");
  if (pres.matterId) {
    await assertMatterWritable(pres.matterId);
  }
  if (data.newExpiryDate <= pres.expiryDate) {
    throw new Error(`新到期日必须晚于原到期日（${pres.expiryDate.toISOString().slice(0, 10)}）`);
  }

  await prisma.$transaction([
    prisma.preservationRenewal.create({
      data: {
        preservationId: data.id,
        renewedAt: new Date(),
        oldExpiryDate: pres.expiryDate,
        newExpiryDate: data.newExpiryDate,
        renewalDuration: data.renewalDuration,
        note: data.note?.trim() || null,
        performedById: session.user.id
      }
    }),
    prisma.preservation.update({
      where: { id: data.id },
      data: {
        expiryDate: data.newExpiryDate,
        status: "RENEWED"
      }
    })
  ]);

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_RENEW",
    targetType: "Preservation",
    targetId: data.id,
    detail: { newExpiryDate: data.newExpiryDate, days: data.renewalDuration }
  });

  revalidatePath("/preservation");
  if (pres.matterId) revalidatePath(`/matters/${pres.matterId}`);
  return { ok: true };
}

export async function liftPreservation(input: z.infer<typeof preservationLiftSchema>) {
  const session = await requireSession();
  const data = preservationLiftSchema.parse(input);

  const pres = await prisma.preservation.findUnique({
    where: { id: data.id },
    select: { id: true, matterId: true, ownerId: true, note: true }
  });
  if (!pres) throw new Error("保全记录不存在");
  await assertCanAccessPreservationRecord(session.user.id, pres);
  if (pres.matterId) {
    await assertMatterWritable(pres.matterId);
  }

  await prisma.preservation.update({
    where: { id: data.id },
    data: {
      status: "LIFTED",
      note: data.note ? `${pres.note ? pres.note + "\n" : ""}【解除】${data.note}` : pres.note
    }
  });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_LIFT",
    targetType: "Preservation",
    targetId: data.id,
    detail: { note: data.note }
  });

  revalidatePath("/preservation");
  if (pres.matterId) revalidatePath(`/matters/${pres.matterId}`);
  return { ok: true };
}

export async function deletePreservation(input: z.infer<typeof preservationIdSchema>) {
  const session = await requireSession();
  const data = preservationIdSchema.parse(input);
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅管理员或主任律师可删除保全记录");
  }

  const pres = await prisma.preservation.findUnique({
    where: { id: data.id },
    select: { id: true, matterId: true, ownerId: true }
  });
  if (!pres) throw new Error("保全记录不存在");
  await assertCanAccessPreservationRecord(session.user.id, pres);
  if (pres.matterId) {
    await assertMatterWritable(pres.matterId);
  }

  await prisma.preservation.delete({ where: { id: data.id } });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_DELETE",
    targetType: "Preservation",
    targetId: data.id
  });

  revalidatePath("/preservation");
  if (pres.matterId) revalidatePath(`/matters/${pres.matterId}`);
  return { ok: true };
}
