/**
 * v0.9.4 归档专用渲染：卷宗封皮 + 卷宗目录
 *
 * 复用 docxtemplater 管道，但比通用 renderTemplate 多两件事：
 *   1. 注入 archive.* 上下文（归档号、结案方式、归档日期等）
 *   2. 卷宗目录额外注入 documents[] 数组用于行循环
 *
 * 渲染产物落到 ARCHIVE/结案/归档 卷宗，category=PROCEDURE，绑定模板 ID（用于审计）。
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { storage } from "@/lib/storage";
import { decryptBuffer, encryptBuffer, sha256 } from "@/lib/storage/crypto";
import { buildContext, renderDocxBuffer, type RenderContext } from "@/lib/template-engine";
import { suggestFolderByTemplateCategory } from "@/lib/default-folders";
import { CLOSED_REASON_CN } from "./schemas";
import type { ArchiveClosedReason } from "@prisma/client";

const CATEGORY_CN_DOC: Record<string, string> = {
  EVIDENCE: "证据",
  PLEADING: "诉讼文书",
  PROCEDURE: "程序文书",
  JUDGMENT: "裁判文书",
  CONTRACT: "合同",
  OTHER: "其他"
};

function toCNDate(d: Date): string {
  const cnDigits = "〇一二三四五六七八九";
  const y = String(d.getFullYear()).split("").map((c) => cnDigits[+c]).join("");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const cnNum = (n: number) => {
    if (n <= 10) return ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][n];
    if (n < 20) return "十" + cnDigits[n - 10];
    if (n < 30) return "二十" + (n === 20 ? "" : cnDigits[n - 20]);
    return "三十" + (n === 30 ? "" : cnDigits[n - 30]);
  };
  return `${y}年${cnNum(m)}月${cnNum(day)}日`;
}

interface ArchiveExtras {
  archiveNo: string;
  closedReason: ArchiveClosedReason;
  completedAt: Date;
  archivedAt: Date;
  judgmentSummary?: string;
}

async function loadBuiltinTemplate(prisma: PrismaClient, key: "archive_cover" | "archive_catalog") {
  // 用 name 找内置模板（key 没存 DB，name 由 BUILTIN_TEMPLATES 决定）
  const nameMap: Record<string, string> = {
    archive_cover: "卷宗封皮",
    archive_catalog: "卷宗目录"
  };
  const tmpl = await prisma.documentTemplate.findFirst({
    where: { name: nameMap[key], isBuiltIn: true, enabled: true },
    include: { docxBlob: true }
  });
  if (!tmpl || !tmpl.docxBlob) {
    throw new Error(`内置模板 ${nameMap[key]} 缺失，请运行 npx prisma db seed`);
  }
  const raw = await storage.readFile(tmpl.docxBlob.path);
  const buffer = tmpl.docxBlob.encrypted
    ? decryptBuffer(raw, tmpl.docxBlob.iv ?? "", tmpl.docxBlob.authTag ?? "")
    : raw;
  return { tmpl, templateBuffer: buffer };
}

async function findOrCreateArchiveFolder(
  prisma: Pick<PrismaClient, "documentFolder">,
  matterId: string,
  matterCategory: "CIVIL_COMMERCIAL" | "CRIMINAL" | "ADMINISTRATIVE" | "NON_LITIGATION" | "LEGAL_COUNSEL" | "SPECIAL_PROJECT"
): Promise<string> {
  const suggestedName = suggestFolderByTemplateCategory("ARCHIVE", matterCategory) ?? "归档";
  const existing = await prisma.documentFolder.findFirst({
    where: { matterId, name: suggestedName },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await prisma.documentFolder.create({
    data: { matterId, name: suggestedName, isDefault: false, orderIndex: 99 }
  });
  return created.id;
}

/**
 * 渲染卷宗封皮 → 返回 Document.id
 */
export async function renderArchiveCover(
  prisma: PrismaClient,
  opts: {
    matterId: string;
    userId: string;
    extras: ArchiveExtras;
  }
): Promise<string> {
  const { tmpl, templateBuffer } = await loadBuiltinTemplate(prisma, "archive_cover");

  const baseCtx = await buildContext({ matterId: opts.matterId, userId: opts.userId });
  const matter = await prisma.matter.findUnique({
    where: { id: opts.matterId },
    select: { internalCode: true, category: true }
  });
  if (!matter) throw new Error("案件不存在");

  const ctx: RenderContext = {
    ...baseCtx,
    archive: {
      archiveNo: opts.extras.archiveNo,
      closedReasonCN: CLOSED_REASON_CN[opts.extras.closedReason],
      completedAtCN: toCNDate(opts.extras.completedAt),
      archivedAtCN: toCNDate(opts.extras.archivedAt),
      judgmentSummary: opts.extras.judgmentSummary ?? ""
    }
  };

  const buf = renderDocxBuffer(templateBuffer, ctx);
  const enc = encryptBuffer(buf);
  const path = await storage.writeFile(`m_${opts.matterId}`, enc.ciphertext);

  const folderId = await findOrCreateArchiveFolder(prisma, opts.matterId, matter.category);

  const fileName = `卷宗封皮_${opts.extras.archiveNo}.docx`;
  const doc = await prisma.document.create({
    data: {
      matterId: opts.matterId,
      folderId,
      templateId: tmpl.id,
      templateContextSnapshot: ctx as unknown as Prisma.InputJsonValue,
      name: fileName,
      category: "PROCEDURE",
      path,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: buf.length,
      sha256: sha256(buf),
      encrypted: true,
      algorithm: enc.algorithm,
      iv: enc.iv.toString("base64"),
      authTag: enc.authTag.toString("base64"),
      tags: ["归档", "卷宗封皮", opts.extras.archiveNo],
      uploadedById: opts.userId
    }
  });
  return doc.id;
}

interface CatalogDocEntry {
  seq: number;
  name: string;
  categoryCN: string;
  uploadDate: string;
  pages: string;
  remark: string;
}

/**
 * 渲染卷宗目录 → 返回 Document.id
 *
 * documents 数组从案件下所有 Document 取（按 createdAt 升序）；
 * 排除自身（封皮 + 目录尚未生成）+ 已删除（deletedAt）。
 */
export async function renderArchiveCatalog(
  prisma: PrismaClient,
  opts: {
    matterId: string;
    userId: string;
    extras: ArchiveExtras;
    excludeDocIds?: string[]; // 通常传入封皮 doc id
  }
): Promise<string> {
  const { tmpl, templateBuffer } = await loadBuiltinTemplate(prisma, "archive_catalog");

  const baseCtx = await buildContext({ matterId: opts.matterId, userId: opts.userId });
  const matter = await prisma.matter.findUnique({
    where: { id: opts.matterId },
    select: { internalCode: true, category: true }
  });
  if (!matter) throw new Error("案件不存在");

  const docs = await prisma.document.findMany({
    where: {
      matterId: opts.matterId,
      deletedAt: null,
      ...(opts.excludeDocIds && opts.excludeDocIds.length > 0
        ? { id: { notIn: opts.excludeDocIds } }
        : {})
    },
    select: { id: true, name: true, category: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  const entries: CatalogDocEntry[] = docs.map((d, i) => ({
    seq: i + 1,
    name: d.name,
    categoryCN: CATEGORY_CN_DOC[d.category] ?? d.category,
    uploadDate: d.createdAt.toISOString().slice(0, 10),
    pages: "",
    remark: ""
  }));

  const ctx: RenderContext = {
    ...baseCtx,
    archive: {
      archiveNo: opts.extras.archiveNo,
      closedReasonCN: CLOSED_REASON_CN[opts.extras.closedReason],
      completedAtCN: toCNDate(opts.extras.completedAt),
      archivedAtCN: toCNDate(opts.extras.archivedAt),
      judgmentSummary: opts.extras.judgmentSummary ?? ""
    },
    documents: entries
  };

  const buf = renderDocxBuffer(templateBuffer, ctx);
  const enc = encryptBuffer(buf);
  const path = await storage.writeFile(`m_${opts.matterId}`, enc.ciphertext);

  const folderId = await findOrCreateArchiveFolder(prisma, opts.matterId, matter.category);

  const fileName = `卷宗目录_${opts.extras.archiveNo}.docx`;
  const doc = await prisma.document.create({
    data: {
      matterId: opts.matterId,
      folderId,
      templateId: tmpl.id,
      templateContextSnapshot: ctx as unknown as Prisma.InputJsonValue,
      name: fileName,
      category: "PROCEDURE",
      path,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: buf.length,
      sha256: sha256(buf),
      encrypted: true,
      algorithm: enc.algorithm,
      iv: enc.iv.toString("base64"),
      authTag: enc.authTag.toString("base64"),
      tags: ["归档", "卷宗目录", opts.extras.archiveNo],
      uploadedById: opts.userId
    }
  });
  return doc.id;
}
