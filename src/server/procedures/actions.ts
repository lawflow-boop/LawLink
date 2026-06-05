"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanAccessMatter, assertCanLeadMatter } from "@/lib/permissions";
import {
  procedureCreateSchema,
  procedureUpdateSchema,
  deadlineCreateSchema,
  hearingCreateSchema,
  type ProcedureCreateInput,
  type ProcedureUpdateInput,
  type DeadlineCreateInput,
  type HearingCreateInput
} from "./schemas";

function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out as T;
}

// ============ Procedure ============

export async function addProcedure(input: ProcedureCreateInput) {
  const session = await requireSession();
  const data = procedureCreateSchema.parse(input);
  await assertCanAccessMatter(session.user.id, session.user.role, data.matterId);
  await assertMatterWritable(data.matterId);

  const lastOrder = await prisma.matterProcedure.findFirst({
    where: { matterId: data.matterId },
    orderBy: { order: "desc" },
    select: { order: true }
  });

  const created = await prisma.matterProcedure.create({
    data: {
      matterId: data.matterId,
      type: data.type,
      customLabel: data.customLabel || null,
      engagement: data.engagement,
      order: (lastOrder?.order ?? 0) + 1,
      caseNumber: data.caseNumber || null,
      jurisdiction: data.jurisdiction || null,
      handlingAgency: data.handlingAgency || null,
      panel: data.panel || null,
      handler: data.handler || null,
      acceptedAt: data.acceptedAt,
      leadLawyerId: data.isExternalLead ? null : (data.leadLawyerId || null),
      isExternalLead: data.isExternalLead,
      status: data.engagement === "INFORMATIONAL" ? "CONCLUDED" : "IN_PROGRESS"
    }
  });

  await prisma.timelineEvent.create({
    data: {
      matterId: data.matterId,
      eventType: "PROCEDURE_ADDED",
      title: `新增程序：${created.customLabel ?? created.type}`,
      occurredAt: new Date(),
      refType: "MatterProcedure",
      refId: created.id
    }
  });

  await audit({
    userId: session.user.id,
    action: "PROCEDURE_CREATE",
    targetType: "MatterProcedure",
    targetId: created.id,
    detail: { matterId: data.matterId, type: data.type }
  });

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true, id: created.id };
}

export async function updateProcedure(input: ProcedureUpdateInput) {
  const session = await requireSession();
  const data = procedureUpdateSchema.parse(input);
  const { id, ...rest } = data;

  const existing = await prisma.matterProcedure.findUnique({
    where: { id },
    select: { matterId: true }
  });
  if (!existing) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, existing.matterId);
  await assertMatterWritable(existing.matterId);

  const updated = await prisma.matterProcedure.update({
    where: { id },
    data: emptyToNull(rest)
  });

  await audit({
    userId: session.user.id,
    action: "PROCEDURE_UPDATE",
    targetType: "MatterProcedure",
    targetId: id
  });

  revalidatePath(`/matters/${updated.matterId}`);
  return { ok: true };
}

export async function deleteProcedure(id: string) {
  const session = await requireSession();
  const procedure = await prisma.matterProcedure.findUnique({ where: { id } });
  if (!procedure) return { ok: false };

  await assertCanAccessMatter(session.user.id, session.user.role, procedure.matterId);
  await assertMatterWritable(procedure.matterId);
  await assertCanLeadMatter(session.user.id, procedure.matterId, "仅案件主办/协办可以删除程序");

  await prisma.matterProcedure.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "PROCEDURE_DELETE",
    targetType: "MatterProcedure",
    targetId: id,
    detail: { matterId: procedure.matterId }
  });

  revalidatePath(`/matters/${procedure.matterId}`);
  return { ok: true };
}

// ============ Deadline ============

export async function addDeadline(input: DeadlineCreateInput) {
  const session = await requireSession();
  const data = deadlineCreateSchema.parse(input);

  const procedureForGuard = await prisma.matterProcedure.findUnique({
    where: { id: data.procedureId },
    select: { matterId: true }
  });
  if (!procedureForGuard) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, procedureForGuard.matterId);
  await assertMatterWritable(procedureForGuard.matterId);

  const created = await prisma.deadline.create({
    data: {
      procedureId: data.procedureId,
      title: data.title,
      category: data.category,
      dueAt: data.dueAt,
      basis: data.basis || null,
      remindDays: data.remindDays
    }
  });

  const procedure = await prisma.matterProcedure.findUnique({
    where: { id: data.procedureId },
    select: { matterId: true }
  });

  if (procedure) {
    await audit({
      userId: session.user.id,
      action: "DEADLINE_CREATE",
      targetType: "Deadline",
      targetId: created.id,
      detail: { matterId: procedure.matterId, procedureId: data.procedureId }
    });
    // v0.43 项4：写入案件动态时间线
    await prisma.timelineEvent.create({
      data: {
        matterId: procedure.matterId,
        eventType: "DEADLINE_ADDED",
        title: `新增期限：${data.title}`,
        occurredAt: new Date(),
        refType: "Deadline",
        refId: created.id
      }
    });
    revalidatePath(`/matters/${procedure.matterId}`);
  }

  return { ok: true, id: created.id };
}

export async function toggleDeadlineCompleted(id: string) {
  const session = await requireSession();
  const current = await prisma.deadline.findUnique({
    where: { id },
    include: { procedure: { select: { matterId: true } } }
  });
  if (!current) return { ok: false };
  await assertCanAccessMatter(session.user.id, session.user.role, current.procedure.matterId);
  await assertMatterWritable(current.procedure.matterId);

  const next = !current.completed;
  await prisma.deadline.update({
    where: { id },
    data: {
      completed: next,
      completedAt: next ? new Date() : null
    }
  });

  await audit({
    userId: session.user.id,
    action: next ? "DEADLINE_COMPLETE" : "DEADLINE_REOPEN",
    targetType: "Deadline",
    targetId: id
  });

  revalidatePath(`/matters/${current.procedure.matterId}`);
  return { ok: true };
}

export async function deleteDeadline(id: string) {
  const session = await requireSession();
  const current = await prisma.deadline.findUnique({
    where: { id },
    include: { procedure: { select: { matterId: true } } }
  });
  if (!current) return { ok: false };
  await assertCanAccessMatter(session.user.id, session.user.role, current.procedure.matterId);
  await assertMatterWritable(current.procedure.matterId);

  await prisma.deadline.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "DEADLINE_DELETE",
    targetType: "Deadline",
    targetId: id
  });
  revalidatePath(`/matters/${current.procedure.matterId}`);
  return { ok: true };
}

// ============ Hearing ============

export async function addHearing(input: HearingCreateInput) {
  const session = await requireSession();
  const data = hearingCreateSchema.parse(input);

  const procedureForGuard = await prisma.matterProcedure.findUnique({
    where: { id: data.procedureId },
    select: { matterId: true }
  });
  if (!procedureForGuard) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, procedureForGuard.matterId);
  await assertMatterWritable(procedureForGuard.matterId);

  const created = await prisma.hearing.create({
    data: {
      procedureId: data.procedureId,
      title: data.title,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      room: data.room || null,
      address: data.address || null,
      judge: data.judge || null,
      contact: data.contact || null,
      notes: data.notes || null
    }
  });

  const procedure = await prisma.matterProcedure.findUnique({
    where: { id: data.procedureId },
    select: { matterId: true }
  });

  if (procedure) {
    await prisma.timelineEvent.create({
      data: {
        matterId: procedure.matterId,
        eventType: "HEARING_SCHEDULED",
        title: `开庭：${data.title}`,
        occurredAt: data.startsAt,
        refType: "Hearing",
        refId: created.id
      }
    });

    await audit({
      userId: session.user.id,
      action: "HEARING_CREATE",
      targetType: "Hearing",
      targetId: created.id,
      detail: { matterId: procedure.matterId, procedureId: data.procedureId }
    });
    revalidatePath(`/matters/${procedure.matterId}`);
  }

  return { ok: true, id: created.id };
}

export async function deleteHearing(id: string) {
  const session = await requireSession();
  const current = await prisma.hearing.findUnique({
    where: { id },
    include: { procedure: { select: { matterId: true } } }
  });
  if (!current) return { ok: false };
  await assertCanAccessMatter(session.user.id, session.user.role, current.procedure.matterId);
  await assertMatterWritable(current.procedure.matterId);

  await prisma.hearing.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "HEARING_DELETE",
    targetType: "Hearing",
    targetId: id
  });
  revalidatePath(`/matters/${current.procedure.matterId}`);
  return { ok: true };
}

// ============ ProcedureMemo（v0.42 备忘录）============

export async function addProcedureMemo(input: {
  procedureId: string;
  content: string;
}) {
  const session = await requireSession();
  const content = input.content.trim();
  if (!content) throw new Error("备忘内容不能为空");
  if (content.length > 1000) throw new Error("备忘内容过长（≤1000字）");

  const proc = await prisma.matterProcedure.findUnique({
    where: { id: input.procedureId },
    select: { matterId: true }
  });
  if (!proc) throw new Error("程序不存在");
  await assertCanAccessMatter(session.user.id, session.user.role, proc.matterId);
  await assertMatterWritable(proc.matterId);

  const created = await prisma.procedureMemo.create({
    data: {
      procedureId: input.procedureId,
      content,
      createdById: session.user.id
    }
  });
  revalidatePath(`/matters/${proc.matterId}`);
  return { ok: true, id: created.id };
}

export async function toggleProcedureMemo(id: string) {
  const session = await requireSession();
  const current = await prisma.procedureMemo.findUnique({
    where: { id },
    include: { procedure: { select: { matterId: true } } }
  });
  if (!current) return { ok: false };
  await assertCanAccessMatter(session.user.id, session.user.role, current.procedure.matterId);
  await assertMatterWritable(current.procedure.matterId);

  const next = !current.done;
  await prisma.procedureMemo.update({
    where: { id },
    data: { done: next, doneAt: next ? new Date() : null }
  });
  revalidatePath(`/matters/${current.procedure.matterId}`);
  return { ok: true };
}

export async function deleteProcedureMemo(id: string) {
  const session = await requireSession();
  const current = await prisma.procedureMemo.findUnique({
    where: { id },
    include: { procedure: { select: { matterId: true } } }
  });
  if (!current) return { ok: false };
  await assertCanAccessMatter(session.user.id, session.user.role, current.procedure.matterId);
  await assertMatterWritable(current.procedure.matterId);

  await prisma.procedureMemo.delete({ where: { id } });
  revalidatePath(`/matters/${current.procedure.matterId}`);
  return { ok: true };
}
