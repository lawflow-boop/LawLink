"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import {
  caseCreateSchema,
  caseUpdateSchema,
  caseListFilterSchema,
  targetCreateSchema,
  targetUpdateSchema,
  propertyCreateSchema,
  propertyUpdateSchema,
  propertyRenewSchema,
  deleteSchema,
} from "./schemas-v2";

// ━━━━ Read ━━━━

export async function listPreservationCases(input?: z.input<typeof caseListFilterSchema>) {
  await requireSession();
  const filter = caseListFilterSchema.parse(input ?? {});

  const where: Prisma.PreservationCaseWhereInput = {};
  if (filter.status !== "ALL") where.status = filter.status;
  if (filter.matterId) where.matterId = filter.matterId;
  if (filter.search) {
    where.OR = [
      { court: { contains: filter.search, mode: "insensitive" } },
      { rulingNumber: { contains: filter.search, mode: "insensitive" } },
      { matter: { title: { contains: filter.search, mode: "insensitive" } } },
      { targets: { some: { name: { contains: filter.search, mode: "insensitive" } } } },
    ];
  }

  return prisma.preservationCase.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      owner: { select: { id: true, name: true } },
      targets: {
        include: {
          properties: {
            orderBy: { expiryDate: "asc" },
            include: {
              renewals: { orderBy: { renewedAt: "desc" }, take: 3 }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

// ━━━━ Case CRUD ━━━━

export async function createPreservationCase(input: z.infer<typeof caseCreateSchema>) {
  const session = await requireSession();
  const data = caseCreateSchema.parse(input);

  if (data.matterId) {
    const m = await prisma.matter.findUnique({ where: { id: data.matterId } });
    if (!m) throw new Error("关联案件不存在");
    await assertMatterWritable(data.matterId);
  }

  const created = await prisma.preservationCase.create({
    data: {
      matterId: data.matterId ?? null,
      type: data.type,
      court: data.court?.trim() || null,
      rulingNumber: data.rulingNumber?.trim() || null,
      guaranteeType: data.guaranteeType ?? null,
      appliedAt: data.appliedAt ?? null,
      note: data.note?.trim() || null,
      ownerId: data.ownerId ?? null,
      remindDays: data.remindDays,
      status: "ACTIVE",
      // Create first target + property inline if provided
      targets: data.firstTarget?.trim() ? {
        create: {
          name: data.firstTarget.trim(),
          properties: data.firstPropertyType ? {
            create: {
              propertyType: data.firstPropertyType,
              propertyDetail: data.firstPropertyDetail?.trim() || null,
              amount: data.firstAmount != null ? new Prisma.Decimal(data.firstAmount) : null,
              startDate: data.firstStartDate ?? new Date(),
              duration: data.firstDuration ?? 365,
              expiryDate: data.firstExpiryDate ?? new Date(Date.now() + 365 * 86400000),
              status: "ACTIVE"
            }
          } : undefined
        }
      } : undefined
    },
    select: { id: true, matterId: true }
  });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_CASE_CREATE",
    targetType: "PreservationCase",
    targetId: created.id,
    detail: { type: data.type }
  });

  revalidatePath("/preservation");
  if (created.matterId) revalidatePath(`/matters/${created.matterId}`);
  return { ok: true, id: created.id };
}

export async function updatePreservationCase(input: z.infer<typeof caseUpdateSchema>) {
  const session = await requireSession();
  const data = caseUpdateSchema.parse(input);
  const { id, matterId, court, rulingNumber, note, ownerId, guaranteeType, ...rest } = data;

  const existing = await prisma.preservationCase.findUnique({ where: { id }, select: { matterId: true } });
  if (!existing) throw new Error("保全案件不存在");
  if (existing.matterId) await assertMatterWritable(existing.matterId);

  const patch: Prisma.PreservationCaseUpdateInput = { ...rest };
  if (matterId !== undefined) patch.matter = matterId ? { connect: { id: matterId } } : { disconnect: true };
  if (ownerId !== undefined) patch.owner = ownerId ? { connect: { id: ownerId } } : { disconnect: true };
  if (court !== undefined) patch.court = court?.trim() || null;
  if (rulingNumber !== undefined) patch.rulingNumber = rulingNumber?.trim() || null;
  if (note !== undefined) patch.note = note?.trim() || null;
  if (guaranteeType !== undefined) patch.guaranteeType = guaranteeType ?? null;

  await prisma.preservationCase.update({ where: { id }, data: patch });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_CASE_UPDATE",
    targetType: "PreservationCase",
    targetId: id
  });

  revalidatePath("/preservation");
  if (existing.matterId) revalidatePath(`/matters/${existing.matterId}`);
  return { ok: true };
}

export async function deletePreservationCase(input: z.infer<typeof deleteSchema>) {
  const session = await requireSession();
  const data = deleteSchema.parse(input);
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅管理员或主任律师可删除保全记录");
  }

  const cs = await prisma.preservationCase.findUnique({ where: { id: data.id }, select: { matterId: true } });
  if (!cs) throw new Error("保全案件不存在");
  if (cs.matterId) await assertMatterWritable(cs.matterId);

  await prisma.preservationCase.delete({ where: { id: data.id } });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_CASE_DELETE",
    targetType: "PreservationCase",
    targetId: data.id
  });

  revalidatePath("/preservation");
  if (cs.matterId) revalidatePath(`/matters/${cs.matterId}`);
  return { ok: true };
}

// ━━━━ Target CRUD ━━━━

export async function addTarget(input: z.infer<typeof targetCreateSchema>) {
  const session = await requireSession();
  const data = targetCreateSchema.parse(input);

  const cs = await prisma.preservationCase.findUnique({ where: { id: data.caseId }, select: { matterId: true } });
  if (!cs) throw new Error("保全案件不存在");
  if (cs.matterId) await assertMatterWritable(cs.matterId);

  const created = await prisma.preservationTarget.create({
    data: { caseId: data.caseId, name: data.name.trim(), note: data.note?.trim() || null }
  });

  revalidatePath("/preservation");
  if (cs.matterId) revalidatePath(`/matters/${cs.matterId}`);
  return { ok: true, id: created.id };
}

export async function updateTarget(input: z.infer<typeof targetUpdateSchema>) {
  await requireSession();
  const data = targetUpdateSchema.parse(input);
  const patch: Prisma.PreservationTargetUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  await prisma.preservationTarget.update({ where: { id: data.id }, data: patch });
  revalidatePath("/preservation");
  return { ok: true };
}

export async function deleteTarget(id: string) {
  await requireSession();
  await prisma.preservationTarget.delete({ where: { id } });
  revalidatePath("/preservation");
  return { ok: true };
}

// ━━━━ Property CRUD ━━━━

export async function addProperty(input: z.infer<typeof propertyCreateSchema>) {
  const session = await requireSession();
  const data = propertyCreateSchema.parse(input);
  if (data.expiryDate <= data.startDate) throw new Error("到期日期必须晚于生效日期");

  const target = await prisma.preservationTarget.findUnique({
    where: { id: data.targetId },
    include: { case: { select: { matterId: true } } }
  });
  if (!target) throw new Error("被保全人不存在");
  if (target.case.matterId) await assertMatterWritable(target.case.matterId);

  const created = await prisma.preservationProperty.create({
    data: {
      targetId: data.targetId,
      propertyType: data.propertyType,
      propertyDetail: data.propertyDetail?.trim() || null,
      amount: data.amount != null ? new Prisma.Decimal(data.amount) : null,
      startDate: data.startDate,
      duration: data.duration,
      expiryDate: data.expiryDate,
      status: "ACTIVE"
    }
  });

  await audit({
    userId: session.user.id,
    action: "PRESERVATION_PROPERTY_CREATE",
    targetType: "PreservationProperty",
    targetId: created.id,
    detail: { propertyType: data.propertyType }
  });

  revalidatePath("/preservation");
  if (target.case.matterId) revalidatePath(`/matters/${target.case.matterId}`);
  return { ok: true, id: created.id };
}

export async function updateProperty(input: z.infer<typeof propertyUpdateSchema>) {
  const session = await requireSession();
  const data = propertyUpdateSchema.parse(input);
  const { id, amount, propertyDetail, ...rest } = data;

  const patch: Prisma.PreservationPropertyUpdateInput = { ...rest };
  if (amount !== undefined) patch.amount = amount != null ? new Prisma.Decimal(amount) : null;
  if (propertyDetail !== undefined) patch.propertyDetail = propertyDetail?.trim() || null;

  await prisma.preservationProperty.update({ where: { id }, data: patch });

  revalidatePath("/preservation");
  return { ok: true };
}

export async function renewProperty(input: z.infer<typeof propertyRenewSchema>) {
  const session = await requireSession();
  const data = propertyRenewSchema.parse(input);

  const prop = await prisma.preservationProperty.findUnique({
    where: { id: data.propertyId },
    include: { target: { include: { case: { select: { matterId: true } } } } }
  });
  if (!prop) throw new Error("保全财产不存在");
  if (prop.status === "LIFTED") throw new Error("已解除的保全不可续保");
  if (prop.target.case.matterId) await assertMatterWritable(prop.target.case.matterId);
  if (data.newExpiryDate <= prop.expiryDate) {
    throw new Error("新到期日必须晚于原到期日");
  }

  await prisma.$transaction([
    prisma.preservationPropertyRenewal.create({
      data: {
        propertyId: data.propertyId,
        renewedAt: new Date(),
        oldExpiryDate: prop.expiryDate,
        newExpiryDate: data.newExpiryDate,
        renewalDuration: data.renewalDuration,
        note: data.note?.trim() || null,
        performedById: session.user.id
      }
    }),
    prisma.preservationProperty.update({
      where: { id: data.propertyId },
      data: { expiryDate: data.newExpiryDate, status: "RENEWED" }
    })
  ]);

  revalidatePath("/preservation");
  if (prop.target.case.matterId) revalidatePath(`/matters/${prop.target.case.matterId}`);
  return { ok: true };
}

export async function liftProperty(propertyId: string, note?: string) {
  const session = await requireSession();
  const prop = await prisma.preservationProperty.findUnique({
    where: { id: propertyId },
    include: { target: { include: { case: { select: { matterId: true } } } } }
  });
  if (!prop) throw new Error("保全财产不存在");
  if (prop.target.case.matterId) await assertMatterWritable(prop.target.case.matterId);

  await prisma.preservationProperty.update({
    where: { id: propertyId },
    data: {
      status: "LIFTED",
    }
  });

  revalidatePath("/preservation");
  if (prop.target.case.matterId) revalidatePath(`/matters/${prop.target.case.matterId}`);
  return { ok: true };
}

export async function deleteProperty(id: string) {
  await requireSession();
  await prisma.preservationProperty.delete({ where: { id } });
  revalidatePath("/preservation");
  return { ok: true };
}

// for dashboard alerts
export async function listExpiringProperties(daysAhead = 60) {
  await requireSession();
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);

  return prisma.preservationProperty.findMany({
    where: {
      status: { in: ["ACTIVE", "RENEWED"] },
      expiryDate: { lte: end }
    },
    orderBy: { expiryDate: "asc" },
    include: {
      target: {
        include: {
          case: {
            include: { matter: { select: { id: true, internalCode: true, title: true } } }
          }
        }
      }
    }
  });
}
