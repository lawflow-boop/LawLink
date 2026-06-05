"use server";

/**
 * v0.28: 自定义字段（JSON 列方案）
 * - 字段定义存 CustomFieldDef 表，管理限 ADMIN
 * - 字段值存于实体的 customValues JSON（本期落地 MATTER）
 */
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CustomFieldEntity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanLeadMatter } from "@/lib/permissions";

const entitySchema = z.enum(["MATTER", "CLIENT"]);
const typeSchema = z.enum(["TEXT", "NUMBER", "DATE", "SELECT"]);

const defCreateSchema = z.object({
  entityType: entitySchema,
  label: z.string().min(1, "字段名称必填").max(40),
  fieldType: typeSchema.default("TEXT"),
  options: z.array(z.string().min(1).max(40)).max(50).default([]),
  required: z.boolean().default(false)
});

const defUpdateSchema = defCreateSchema.partial().extend({
  id: z.string().cuid()
});

async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("仅管理员可管理自定义字段");
  }
  return session;
}

/** 列出某实体的字段定义（admin 视图含禁用项；onlyEnabled=true 用于表单渲染） */
export async function listCustomFieldDefs(
  entityType: CustomFieldEntity,
  onlyEnabled = false
) {
  await requireSession();
  return prisma.customFieldDef.findMany({
    where: { entityType, ...(onlyEnabled ? { enabled: true } : {}) },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }]
  });
}

export async function createCustomFieldDef(input: z.input<typeof defCreateSchema>) {
  const session = await requireAdmin();
  const data = defCreateSchema.parse(input);
  if (data.fieldType === "SELECT" && data.options.length === 0) {
    throw new Error("下拉类型至少需要一个选项值");
  }
  const max = await prisma.customFieldDef.aggregate({
    where: { entityType: data.entityType },
    _max: { order: true }
  });
  const def = await prisma.customFieldDef.create({
    data: {
      entityType: data.entityType,
      key: `cf_${randomUUID().slice(0, 8)}`,
      label: data.label,
      fieldType: data.fieldType,
      options: data.fieldType === "SELECT" ? data.options : [],
      required: data.required,
      order: (max._max.order ?? 0) + 1
    }
  });
  await audit({
    userId: session.user.id,
    action: "CUSTOM_FIELD_CREATE",
    targetType: "CustomFieldDef",
    targetId: def.id,
    detail: { label: def.label }
  });
  revalidatePath("/settings/custom-fields");
  return { ok: true as const, id: def.id };
}

export async function updateCustomFieldDef(input: z.input<typeof defUpdateSchema>) {
  await requireAdmin();
  const { id, ...rest } = defUpdateSchema.parse(input);
  if (rest.fieldType === "SELECT" && rest.options && rest.options.length === 0) {
    throw new Error("下拉类型至少需要一个选项值");
  }
  await prisma.customFieldDef.update({
    where: { id },
    data: {
      ...(rest.label !== undefined ? { label: rest.label } : {}),
      ...(rest.fieldType !== undefined ? { fieldType: rest.fieldType } : {}),
      ...(rest.options !== undefined ? { options: rest.options } : {}),
      ...(rest.required !== undefined ? { required: rest.required } : {})
    }
  });
  await audit({ action: "CUSTOM_FIELD_UPDATE", targetType: "CustomFieldDef", targetId: id });
  revalidatePath("/settings/custom-fields");
  return { ok: true as const };
}

export async function toggleCustomFieldDef(id: string, enabled: boolean) {
  await requireAdmin();
  await prisma.customFieldDef.update({ where: { id }, data: { enabled } });
  revalidatePath("/settings/custom-fields");
  return { ok: true as const };
}

export async function deleteCustomFieldDef(id: string) {
  await requireAdmin();
  await prisma.customFieldDef.delete({ where: { id } });
  await audit({ action: "CUSTOM_FIELD_DELETE", targetType: "CustomFieldDef", targetId: id });
  revalidatePath("/settings/custom-fields");
  return { ok: true as const };
}

/** 保存案件的自定义字段值 */
export async function saveMatterCustomValues(
  matterId: string,
  values: Record<string, string>
) {
  const session = await requireSession();
  await assertMatterWritable(matterId);
  await assertCanLeadMatter(session.user.id, matterId, "仅案件主办/协办可编辑");

  // 仅保留当前已启用字段定义的键，避免脏数据
  const defs = await prisma.customFieldDef.findMany({
    where: { entityType: "MATTER", enabled: true },
    select: { key: true, label: true, required: true }
  });
  const clean: Record<string, string> = {};
  for (const d of defs) {
    const v = values[d.key];
    if (typeof v === "string" && v.trim() !== "") clean[d.key] = v.trim();
    if (d.required && !clean[d.key]) {
      throw new Error(`「${d.label}」为必填项`);
    }
  }

  await prisma.matter.update({
    where: { id: matterId },
    data: { customValues: clean }
  });
  await audit({
    userId: session.user.id,
    action: "MATTER_CUSTOM_VALUES",
    targetType: "Matter",
    targetId: matterId
  });
  revalidatePath(`/matters/${matterId}`);
  return { ok: true as const };
}
