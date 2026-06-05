"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { storage } from "@/lib/storage";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanLeadMatter } from "@/lib/permissions";
import { decryptBuffer, encryptBuffer, sha256 } from "@/lib/storage/crypto";
import { buildContext, renderDocxBuffer, detectMissing } from "@/lib/template-engine";
import { suggestFolderByTemplateCategory } from "@/lib/default-folders";
import {
  templateListFilterSchema,
  templateToggleSchema,
  templateRenderSchema
} from "./schemas";

export async function listTemplates(input?: z.input<typeof templateListFilterSchema>) {
  await requireSession();
  const filter = templateListFilterSchema.parse(input ?? {});

  const where: Prisma.DocumentTemplateWhereInput = {};
  if (filter.onlyEnabled) where.enabled = true;
  if (filter.category) where.category = filter.category;
  if (filter.matterCategory) {
    // applicableCategories 为空数组 = 全适用；包含目标也匹配
    where.OR = [
      { applicableCategories: { isEmpty: true } },
      { applicableCategories: { has: filter.matterCategory } }
    ];
  }

  return prisma.documentTemplate.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      applicableCategories: true,
      variables: true,
      isBuiltIn: true,
      enabled: true,
      updatedAt: true
    }
  });
}

export async function getTemplate(id: string) {
  await requireSession();
  return prisma.documentTemplate.findUnique({
    where: { id },
    include: {
      docxBlob: { select: { id: true, name: true, size: true } },
      createdBy: { select: { id: true, name: true } }
    }
  });
}

export async function toggleTemplate(input: z.infer<typeof templateToggleSchema>) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("仅管理员可启用/禁用模板");
  }
  const data = templateToggleSchema.parse(input);

  await prisma.documentTemplate.update({
    where: { id: data.id },
    data: { enabled: data.enabled }
  });

  await audit({
    userId: session.user.id,
    action: "TEMPLATE_TOGGLE",
    targetType: "DocumentTemplate",
    targetId: data.id,
    detail: { enabled: data.enabled }
  });

  revalidatePath("/settings/templates");
  return { ok: true };
}

/**
 * 模板渲染 + 归档
 *   1. 校验输入与权限
 *   2. 读取并解密模板 docx
 *   3. 拼装上下文（含行内补全 overrides 的回写）
 *   4. 渲染 → 加密入库 Document（关联 matter / folder / template / 上下文快照）
 *   5. 返回新 documentId，UI 拿去下载
 */
export async function renderTemplate(input: z.infer<typeof templateRenderSchema>) {
  const session = await requireSession();
  const data = templateRenderSchema.parse(input);

  await assertMatterWritable(data.matterId);
  await assertCanLeadMatter(session.user.id, data.matterId, "仅案件主办/协办可生成文书");

  // 取模板 + docxBlob
  const tmpl = await prisma.documentTemplate.findUnique({
    where: { id: data.templateId },
    include: { docxBlob: true }
  });
  if (!tmpl || !tmpl.enabled) throw new Error("模板不存在或已禁用");
  if (!tmpl.docxBlob) throw new Error("模板源文件缺失");

  // 校验 folder 同案件
  if (data.folderId) {
    const folder = await prisma.documentFolder.findUnique({
      where: { id: data.folderId },
      select: { matterId: true }
    });
    if (!folder || folder.matterId !== data.matterId) {
      throw new Error("目标卷宗与案件不匹配");
    }
  }

  // 取案件 + 模板源文件
  const matter = await prisma.matter.findUnique({
    where: { id: data.matterId },
    select: { internalCode: true, category: true }
  });
  if (!matter) throw new Error("案件不存在");

  const rawCt = await storage.readFile(tmpl.docxBlob.path);
  const templateBuffer = tmpl.docxBlob.encrypted
    ? decryptBuffer(rawCt, tmpl.docxBlob.iv ?? "", tmpl.docxBlob.authTag ?? "")
    : rawCt;

  // 上下文（应用 overrides 行内补全）
  const context = await buildContext({
    matterId: data.matterId,
    userId: session.user.id,
    overrides: data.overrides
  });

  // 检测未填变量（行内补全已落库 → buildContext 会读到；剩下的是真缺）
  const required = Array.isArray(tmpl.variables) ? (tmpl.variables as string[]) : [];
  const missing = detectMissing(required, context);

  // 渲染
  const renderedBuf = renderDocxBuffer(templateBuffer, context);
  const enc = encryptBuffer(renderedBuf);
  const path = await storage.writeFile(`m_${data.matterId}`, enc.ciphertext);

  // 若未指定 folder，按模板大类推荐
  let folderId = data.folderId;
  if (!folderId) {
    const suggestedName = suggestFolderByTemplateCategory(tmpl.category, matter.category);
    if (suggestedName) {
      const f = await prisma.documentFolder.findFirst({
        where: { matterId: data.matterId, name: suggestedName },
        select: { id: true }
      });
      if (f) folderId = f.id;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${tmpl.name}_${matter.internalCode}_${today}.docx`;

  const doc = await prisma.document.create({
    data: {
      matterId: data.matterId,
      folderId: folderId ?? undefined,
      templateId: tmpl.id,
      templateContextSnapshot: context as unknown as Prisma.InputJsonValue,
      name: fileName,
      category: "OTHER",
      path,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: renderedBuf.length,
      sha256: sha256(renderedBuf),
      encrypted: true,
      algorithm: enc.algorithm,
      iv: enc.iv.toString("base64"),
      authTag: enc.authTag.toString("base64"),
      tags: ["模板生成", tmpl.name],
      uploadedById: session.user.id
    }
  });

  await audit({
    userId: session.user.id,
    action: "TEMPLATE_RENDER",
    targetType: "Document",
    targetId: doc.id,
    detail: { templateId: tmpl.id, templateName: tmpl.name, matterId: data.matterId }
  });

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true, documentId: doc.id, fileName, missing };
}
