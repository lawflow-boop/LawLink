"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { createNotification } from "@/server/notifications/create";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanAssociateMatter } from "@/lib/permissions";

const taskCreateSchema = z.object({
  matterId: z.string().cuid(),
  title: z.string().min(1, "事项标题必填").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  assigneeId: z.string().cuid().optional().or(z.literal("")),
  dueAt: z.coerce.date().optional(),
  priority: z.coerce.number().int().min(0).max(2).default(0),
  stageId: z.string().cuid().optional().or(z.literal(""))
});

const taskUpdateSchema = taskCreateSchema.extend({
  id: z.string().cuid()
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export async function createTask(input: TaskCreateInput) {
  const session = await requireSession();
  const data = taskCreateSchema.parse(input);
  await assertCanAssociateMatter(session.user.id, data.matterId);
  await assertMatterWritable(data.matterId);

  const created = await prisma.task.create({
    data: {
      matterId: data.matterId,
      title: data.title,
      description: data.description || null,
      assigneeId: data.assigneeId || null,
      dueAt: data.dueAt,
      priority: data.priority,
      stageId: data.stageId || null
    }
  });

  await audit({
    userId: session.user.id,
    action: "TASK_CREATE",
    targetType: "Task",
    targetId: created.id,
    detail: { matterId: data.matterId, title: created.title }
  });

  // v0.43 项4：写入案件动态时间线
  await prisma.timelineEvent.create({
    data: {
      matterId: data.matterId,
      eventType: "TASK_ADDED",
      title: `新增事项：${created.title}`,
      occurredAt: new Date(),
      refType: "Task",
      refId: created.id
    }
  });

  // 通知被指派人（非创建者本人时）
  if (data.assigneeId && data.assigneeId !== session.user.id) {
    await createNotification({
      userId: data.assigneeId,
      type: "TASK_ASSIGNED",
      title: "您有新事项",
      content: `事项「${created.title}」已指派给您`,
      href: `/matters/${data.matterId}`,
      refType: "Task",
      refId: created.id
    });
  }

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true, id: created.id };
}

export async function updateTask(input: TaskUpdateInput) {
  const session = await requireSession();
  const data = taskUpdateSchema.parse(input);
  await assertCanAssociateMatter(session.user.id, data.matterId);
  await assertMatterWritable(data.matterId);
  const { id, matterId, ...rest } = data;

  await prisma.task.update({
    where: { id },
    data: {
      title: rest.title,
      description: rest.description || null,
      assigneeId: rest.assigneeId || null,
      dueAt: rest.dueAt,
      priority: rest.priority,
      stageId: rest.stageId || null
    }
  });

  await audit({
    userId: session.user.id,
    action: "TASK_UPDATE",
    targetType: "Task",
    targetId: id
  });

  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

export async function toggleTaskCompleted(id: string) {
  const session = await requireSession();
  const current = await prisma.task.findUnique({ where: { id } });
  if (!current) return { ok: false };
  await assertCanAssociateMatter(session.user.id, current.matterId);
  await assertMatterWritable(current.matterId);

  const next = !current.completed;
  await prisma.task.update({
    where: { id },
    data: {
      completed: next,
      completedAt: next ? new Date() : null
    }
  });

  await audit({
    userId: session.user.id,
    action: next ? "TASK_COMPLETE" : "TASK_REOPEN",
    targetType: "Task",
    targetId: id
  });

  revalidatePath(`/matters/${current.matterId}`);
  return { ok: true };
}

export async function deleteTask(id: string) {
  const session = await requireSession();
  const current = await prisma.task.findUnique({ where: { id } });
  if (!current) return { ok: false };
  await assertCanAssociateMatter(session.user.id, current.matterId);
  await assertMatterWritable(current.matterId);

  await prisma.task.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    action: "TASK_DELETE",
    targetType: "Task",
    targetId: id
  });

  revalidatePath(`/matters/${current.matterId}`);
  return { ok: true };
}
