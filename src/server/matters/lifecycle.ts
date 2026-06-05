"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanLeadMatter } from "@/lib/permissions";

const closeMatterSchema = z.object({
  id: z.string().cuid(),
  summary: z.string().min(1, "结案小结必填").max(2000)
});

const holdMatterSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().max(500).optional().or(z.literal(""))
});

export type CloseMatterInput = z.infer<typeof closeMatterSchema>;
export type HoldMatterInput = z.infer<typeof holdMatterSchema>;

/**
 * 结案：把案件状态切到 CLOSED，记录结案小结到 TimelineEvent。
 * 不强制要求所有 procedure 都 concluded，律师自行判断。
 */
export async function closeMatter(input: CloseMatterInput) {
  const session = await requireSession();
  const data = closeMatterSchema.parse(input);
  await assertMatterWritable(data.id);
  await assertCanLeadMatter(session.user.id, data.id, "仅案件主办/协办可以结案");

  await prisma.$transaction(async (tx) => {
    await tx.matter.update({
      where: { id: data.id },
      data: {
        status: "CLOSED",
        closedAt: new Date()
      }
    });
    await tx.timelineEvent.create({
      data: {
        matterId: data.id,
        eventType: "MATTER_CLOSED",
        title: "案件已结案",
        content: data.summary,
        occurredAt: new Date()
      }
    });
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_CLOSE",
    targetType: "Matter",
    targetId: data.id,
    detail: { summaryLen: data.summary.length }
  });

  revalidatePath(`/matters/${data.id}`);
  revalidatePath("/matters");
  return { ok: true };
}

/**
 * 归档：完整流程见 src/server/archive/actions.ts → archiveMatter
 * 这里不再保留旧的轻量版本（v0.9.4 起统一走 ArchiveWizard）。
 */

/**
 * 重新开放（从 ON_HOLD / CLOSED 回到 IN_PROGRESS）。
 * ARCHIVED 状态不能重新开放（如需要应由 ADMIN 走单独路径）。
 */
export async function reopenMatter(id: string) {
  const session = await requireSession();
  const matter = await prisma.matter.findUnique({ where: { id }, select: { status: true } });
  if (!matter) throw new Error("案件不存在");
  await assertMatterWritable(id);
  await assertCanLeadMatter(session.user.id, id, "仅案件主办/协办可以重新开放案件");
  if (matter.status === "ARCHIVED") {
    throw new Error("已归档案件不能重新开放");
  }

  await prisma.$transaction(async (tx) => {
    await tx.matter.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        closedAt: null
      }
    });
    await tx.timelineEvent.create({
      data: {
        matterId: id,
        eventType: "MATTER_REOPENED",
        title: "案件已重新开放",
        occurredAt: new Date()
      }
    });
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_REOPEN",
    targetType: "Matter",
    targetId: id
  });

  revalidatePath(`/matters/${id}`);
  revalidatePath("/matters");
  return { ok: true };
}

/**
 * 暂停案件（客户失联、待补充材料等）。
 */
export async function holdMatter(input: HoldMatterInput) {
  const session = await requireSession();
  const data = holdMatterSchema.parse(input);
  await assertMatterWritable(data.id);
  await assertCanLeadMatter(session.user.id, data.id, "仅案件主办/协办可以暂停案件");

  await prisma.$transaction(async (tx) => {
    await tx.matter.update({
      where: { id: data.id },
      data: { status: "ON_HOLD" }
    });
    await tx.timelineEvent.create({
      data: {
        matterId: data.id,
        eventType: "MATTER_ON_HOLD",
        title: "案件已暂停",
        content: data.reason || undefined,
        occurredAt: new Date()
      }
    });
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_HOLD",
    targetType: "Matter",
    targetId: data.id,
    detail: { reason: data.reason }
  });

  revalidatePath(`/matters/${data.id}`);
  revalidatePath("/matters");
  return { ok: true };
}
