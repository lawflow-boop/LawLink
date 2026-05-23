/**
 * v0.8 seed：内置 8 个文档模板 + 5 个用章配置
 *
 * 幂等策略：
 *   - DocumentTemplate：用 (name + isBuiltIn=true) 作为逻辑唯一键 findFirst，不存在才创建。重跑不覆盖。
 *   - SealTypeConfig：用 type 作 @id，upsert。
 *
 * 模板 docx Buffer 由 src/lib/template-builder.ts 动态构造，加密入库为 Document(encrypted=true)。
 */
import type { PrismaClient } from "@prisma/client";
import { BUILTIN_TEMPLATES } from "../../src/lib/template-builder";
import { writeFile } from "../../src/lib/storage/local";
import { encryptBuffer, sha256 } from "../../src/lib/storage/crypto";

export async function seedV08Templates(prisma: PrismaClient) {
  // 找一个 ADMIN 作为 uploadedBy
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true }
  });
  if (!admin) {
    console.log("⚠ 跳过 v0.8 模板 seed：未发现 ADMIN 用户");
    return;
  }

  let created = 0;
  let skipped = 0;
  for (const tmpl of BUILTIN_TEMPLATES) {
    const existing = await prisma.documentTemplate.findFirst({
      where: { name: tmpl.name, isBuiltIn: true },
      select: { id: true }
    });
    if (existing) {
      skipped++;
      continue;
    }

    const buf = await tmpl.buildBuffer();
    const enc = encryptBuffer(buf);
    const path = await writeFile("templates", enc.ciphertext);

    const doc = await prisma.document.create({
      data: {
        name: `${tmpl.name}.docx`,
        category: "OTHER",
        path,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: buf.length,
        sha256: sha256(buf),
        encrypted: true,
        algorithm: enc.algorithm,
        iv: enc.iv.toString("base64"),
        authTag: enc.authTag.toString("base64"),
        tags: ["内置模板"],
        uploadedById: admin.id
      }
    });

    await prisma.documentTemplate.create({
      data: {
        name: tmpl.name,
        category: tmpl.category,
        description: tmpl.description,
        applicableCategories: tmpl.applicableCategories,
        docxBlobId: doc.id,
        variables: tmpl.variables,
        isBuiltIn: true,
        enabled: true,
        createdById: admin.id
      }
    });
    created++;
  }
  console.log(`✓ v0.8 模板：${created} 个新建 / ${skipped} 个已存在`);
}

export async function seedV08SealConfigs(prisma: PrismaClient) {
  const configs = [
    {
      type: "OFFICIAL_SEAL" as const,
      label: "律师事务所公章",
      description: "用于法律意见书、所函、律师函、对外正式文件等。",
      approverRoles: ["PRINCIPAL_LAWYER" as const],
      requiresLegalRep: false
    },
    {
      type: "CONTRACT_SEAL" as const,
      label: "合同专用章",
      description: "律所对外签订的合同（顾问、转介等）。",
      approverRoles: ["PRINCIPAL_LAWYER" as const],
      requiresLegalRep: false
    },
    {
      type: "FINANCE_SEAL" as const,
      label: "财务专用章",
      description: "发票、收据、对账单等财务文件。",
      approverRoles: ["FINANCE" as const],
      requiresLegalRep: false
    },
    {
      type: "LEGAL_REP_SEAL" as const,
      label: "法定代表人章",
      description: "工商登记、银行类文件。仅法定代表人本人可审批。",
      approverRoles: [],
      requiresLegalRep: true
    },
    {
      type: "CONTRACT_REVIEW_SEAL" as const,
      label: "合同审核章",
      description: "顾问单位送审合同盖审核章。",
      approverRoles: ["PRINCIPAL_LAWYER" as const],
      requiresLegalRep: false
    }
  ];

  for (const c of configs) {
    await prisma.sealTypeConfig.upsert({
      where: { type: c.type },
      update: {
        label: c.label,
        description: c.description,
        approverRoles: c.approverRoles,
        requiresLegalRep: c.requiresLegalRep
      },
      create: c
    });
  }
  console.log(`✓ v0.8 用章配置：${configs.length} 种已就绪`);
}
