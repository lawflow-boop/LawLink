"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { runConflictCheck, type QueryItem } from "./algorithm";

const queryItemSchema = z
  .object({
    // v0.4: 角色可选（顶栏快查不需要），server 端默认 OPPOSING_PARTY
    role: z
      .enum([
        "CLIENT_PARTY",
        "OPPOSING_PARTY",
        "THIRD_PARTY",
        "CO_LITIGANT",
        "AGENT",
        "WITNESS",
        "OTHER"
      ])
      .optional(),
    name: z.string().max(120).optional().or(z.literal("")),
    idNumber: z.string().max(50).optional().or(z.literal(""))
  })
  .refine((q) => (q.name && q.name.trim()) || (q.idNumber && q.idNumber.trim()), {
    message: "姓名或证件号至少填写一项"
  });

const runCheckSchema = z.object({
  intakeId: z.string().cuid().optional(),
  queries: z.array(queryItemSchema).min(1)
});

/**
 * 跑一次冲突检索并落库。
 * 如果 intakeId 在，则把 ConflictCheck 挂在该 Intake 上；否则单独存（targetType=Intake 为空）。
 */
export async function runCheckAndSave(input: z.infer<typeof runCheckSchema>) {
  const session = await requireSession();
  const data = runCheckSchema.parse(input);

  // 清理 query（v0.4: 允许 name 为空，由 idNumber 兜底；role 缺省视为 OPPOSING_PARTY）
  const queries: QueryItem[] = data.queries.map((q) => ({
    role: q.role ?? "OPPOSING_PARTY",
    name: (q.name ?? "").trim(),
    idNumber: q.idNumber?.trim() || undefined
  }));

  const result = await runConflictCheck(queries);

  const check = await prisma.conflictCheck.create({
    data: {
      intakeId: data.intakeId,
      queryPayload: {
        queries,
        sameNameClients: result.sameNameClients,
        idMatchedClients: result.idMatchedClients
      } as object,
      hits: {
        create: result.hits.map((h) => ({
          hitType: h.hitType,
          targetType: h.targetType,
          targetId: h.targetId,
          matchedName: h.matchedName,
          matchedField: h.matchedField,
          matchedValue: h.matchedValue,
          matchedRatio: h.matchedRatio,
          severity: h.severity,
          reason: h.reason
        }))
      }
    },
    include: { hits: true }
  });

  await audit({
    userId: session.user.id,
    action: "CONFLICT_CHECK_RUN",
    targetType: "ConflictCheck",
    targetId: check.id,
    detail: {
      intakeId: data.intakeId,
      hitCount: result.hits.length,
      sameNameClientCount: result.sameNameClients.length
    }
  });

  if (data.intakeId) {
    revalidatePath(`/intakes/${data.intakeId}`);
  }
  return {
    ok: true,
    checkId: check.id,
    hits: check.hits,
    sameNameClients: result.sameNameClients,
    idMatchedClients: result.idMatchedClients
  };
}

const conclusionSchema = z.object({
  checkId: z.string().cuid(),
  conclusion: z.enum(["PENDING", "SAME_SUBJECT", "DIFFERENT", "NEED_INFO"]),
  note: z.string().max(500).optional().or(z.literal(""))
});

export async function setConflictConclusion(input: z.infer<typeof conclusionSchema>) {
  const session = await requireSession();
  const data = conclusionSchema.parse(input);

  const updated = await prisma.conflictCheck.update({
    where: { id: data.checkId },
    data: {
      conclusion: data.conclusion,
      decidedById: session.user.id,
      decidedAt: new Date(),
      note: data.note || null
    },
    include: { intake: { select: { id: true } } }
  });

  await audit({
    userId: session.user.id,
    action: "CONFLICT_CONCLUSION_SET",
    targetType: "ConflictCheck",
    targetId: updated.id,
    detail: { conclusion: data.conclusion }
  });

  if (updated.intake) {
    revalidatePath(`/intakes/${updated.intake.id}`);
  }
  return { ok: true };
}
