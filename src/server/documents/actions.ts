"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertDocumentWritable } from "@/lib/archive/guard";
import { matterVisibilityFilter, isManager, assertCanAccessMatter, assertCanLeadMatter } from "@/lib/permissions";
import { storage } from "@/lib/storage";
import { validateUploadedFile } from "@/lib/storage/file-validator";
import { encryptBuffer, sha256 } from "@/lib/storage/crypto";

const documentCategorySchema = z.enum([
  "EVIDENCE",
  "PLEADING",
  "PROCEDURE",
  "JUDGMENT",
  "CONTRACT",
  "OTHER"
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * 上传材料。前端通过 Server Action 传 FormData，含 file（File）、metadata。
 * 加密分支：encrypted=true 时把文件用 AES-256-GCM 加密后写盘。
 */
export async function uploadDocument(formData: FormData) {
  const session = await requireSession();

  const matterIdRaw = formData.get("matterId");
  const intakeIdRaw = formData.get("intakeId");
  const procedureId = formData.get("procedureId");
  const folderIdRaw = formData.get("folderId");
  const name = formData.get("name");
  const category = formData.get("category");
  const encrypted = formData.get("encrypted") === "true";
  const tagsRaw = formData.get("tags");
  const archiveChecklistItemIdRaw = formData.get("archiveChecklistItemId");
  const sourcePartyRaw = formData.get("sourceParty");
  const file = formData.get("file");

  if (!(file instanceof File)) throw new Error("缺少文件");

  const matterId = typeof matterIdRaw === "string" && matterIdRaw ? matterIdRaw : null;
  const intakeId = typeof intakeIdRaw === "string" && intakeIdRaw ? intakeIdRaw : null;
  if (!matterId && !intakeId) throw new Error("matterId 或 intakeId 至少需要一个");

  if (typeof name !== "string" || !name.trim()) throw new Error("材料名称必填");
  const parsedCategory = documentCategorySchema.parse(category || "OTHER");
  const tags =
    typeof tagsRaw === "string" && tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  validateUploadedFile(file, { purpose: "document", maxBytes: MAX_FILE_SIZE });

  const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null;

  // 校验归属对象存在
  let folderName: string | null = null;
  if (matterId) {
    const matter = await prisma.matter.findUnique({
      where: { id: matterId, deletedAt: null },
      select: { id: true, status: true }
    });
    if (!matter) throw new Error("案件不存在");
    await assertCanAccessMatter(session.user.id, session.user.role, matterId);

    if (folderId) {
      const folder = await prisma.documentFolder.findUnique({
        where: { id: folderId },
        select: { matterId: true, name: true }
      });
      if (!folder || folder.matterId !== matterId) {
        throw new Error("目标卷宗与案件不匹配");
      }
      folderName = folder.name;
    }

    // 归档后仅允许补传到 ARCHIVE 卷宗（结案 / 归档），由 guard 判定
    await assertDocumentWritable(matterId, { kind: "upload", folderName });
  }
  if (intakeId) {
    const intake = await prisma.intake.findUnique({
      where: { id: intakeId },
      select: { id: true, status: true, createdById: true, ownerUserId: true, coUserIds: true }
    });
    if (!intake) throw new Error("收案记录不存在");
    if (intake.status === "DECLINED") throw new Error("已拒绝的收案不可上传材料");
    const uid = session.user.id;
    if (
      !isManager(session.user.role) &&
      intake.createdById !== uid &&
      intake.ownerUserId !== uid &&
      !intake.coUserIds.includes(uid)
    ) {
      throw new Error("无权向该收案上传材料");
    }
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const hash = sha256(raw);

  const storageBucket = matterId ? `m_${matterId}` : `i_${intakeId}`;

  let path: string;
  let iv: string | null = null;
  let authTag: string | null = null;
  let algorithm: string | null = null;

  if (encrypted) {
    const enc = encryptBuffer(raw);
    path = await storage.writeFile(storageBucket, enc.ciphertext);
    iv = enc.iv.toString("base64");
    authTag = enc.authTag.toString("base64");
    algorithm = enc.algorithm;
  } else {
    path = await storage.writeFile(storageBucket, raw);
  }

  const archiveChecklistItemId =
    typeof archiveChecklistItemIdRaw === "string" && archiveChecklistItemIdRaw
      ? archiveChecklistItemIdRaw
      : null;

  const created = await prisma.document.create({
    data: {
      matterId,
      intakeId,
      procedureId: typeof procedureId === "string" && procedureId ? procedureId : null,
      folderId,
      name,
      category: parsedCategory,
      sourceParty:
        typeof sourcePartyRaw === "string" && sourcePartyRaw.trim()
          ? sourcePartyRaw.trim()
          : null,
      path,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      sha256: hash,
      encrypted,
      algorithm,
      iv,
      authTag,
      tags,
      archiveChecklistItemId,
      uploadedById: session.user.id
    }
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_UPLOAD",
    targetType: "Document",
    targetId: created.id,
    detail: { matterId, intakeId, name, encrypted, size: file.size }
  });

  // v0.43 项4：写入案件动态时间线（仅案件文档）
  if (matterId) {
    await prisma.timelineEvent.create({
      data: {
        matterId,
        eventType: "DOCUMENT_UPLOADED",
        title: `上传材料：${name.trim()}`,
        occurredAt: new Date(),
        refType: "Document",
        refId: created.id
      }
    });
  }

  if (matterId) revalidatePath(`/matters/${matterId}`);
  if (intakeId) revalidatePath(`/intakes/${intakeId}`);
  return { ok: true, id: created.id };
}

export async function deleteDocument(id: string) {
  const session = await requireSession();
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return { ok: false };

  if (doc.matterId) {
    await assertDocumentWritable(doc.matterId, { kind: "modify" });
    if (doc.uploadedById !== session.user.id) {
      await assertCanLeadMatter(session.user.id, doc.matterId, "只能删除自己上传的材料，或由本案主办/协办删除");
    }
  } else if (
    doc.uploadedById !== session.user.id &&
    session.user.role !== "ADMIN" &&
    session.user.role !== "PRINCIPAL_LAWYER"
  ) {
    throw new Error("只能删除自己上传的材料");
  }

  // 软删除（保留文件以备审计），如需物理删除走单独脚本
  await prisma.document.update({
    where: { id },
    data: { deletedAt: new Date() }
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_DELETE",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, intakeId: doc.intakeId, name: doc.name }
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  if (doc.intakeId) revalidatePath(`/intakes/${doc.intakeId}`);
  return { ok: true };
}

export async function hardDeleteDocument(id: string) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("仅 ADMIN 可彻底删除材料");
  }
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return { ok: false };
  await assertDocumentWritable(doc.matterId, { kind: "modify" });

  await storage.deleteFile(doc.path);
  await prisma.document.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_HARD_DELETE",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, intakeId: doc.intakeId, name: doc.name }
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  if (doc.intakeId) revalidatePath(`/intakes/${doc.intakeId}`);
  return { ok: true };
}

const docListQuerySchema = z.object({
  search: z.string().optional(),
  category: documentCategorySchema.optional(),
  matterId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

export async function listAllDocuments(input: Partial<z.infer<typeof docListQuerySchema>> = {}) {
  const session = await requireSession();
  const query = docListQuerySchema.parse(input);

  const visFilter = matterVisibilityFilter(session.user.id, session.user.role);
  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    matter: { deletedAt: null, ...visFilter },
    ...(query.category ? { category: query.category } : {}),
    ...(query.matterId ? { matterId: query.matterId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { tags: { has: query.search } }
          ]
        }
      : {})
  };

  return prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: query.limit,
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      uploadedBy: { select: { id: true, name: true } }
    }
  });
}

// ============ v0.10: 文书审批流程 ============

export async function submitDocumentForReview(id: string) {
  const session = await requireSession();
  const doc = await prisma.document.findUnique({ where: { id, deletedAt: null } });
  if (!doc) throw new Error("材料不存在");
  if (doc.matterId) {
    await assertCanAccessMatter(session.user.id, session.user.role, doc.matterId);
    await assertDocumentWritable(doc.matterId, { kind: "modify" });
  }
  if (doc.status !== "DRAFT") throw new Error("只有草稿状态的材料才能提交审核");

  await prisma.document.update({
    where: { id },
    data: { status: "PENDING_REVIEW" },
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_SUBMIT_REVIEW",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, name: doc.name },
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  return { ok: true };
}

export async function approveDocument(id: string) {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw new Error("仅管理员或主办律师可审批文书");
  }
  const doc = await prisma.document.findUnique({ where: { id, deletedAt: null } });
  if (!doc) throw new Error("材料不存在");
  if (doc.status !== "PENDING_REVIEW") throw new Error("材料不在待审核状态");

  await prisma.document.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_APPROVE",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, name: doc.name },
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  return { ok: true };
}

export async function rejectDocument(id: string, reason?: string) {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw new Error("仅管理员或主办律师可驳回文书");
  }
  const doc = await prisma.document.findUnique({ where: { id, deletedAt: null } });
  if (!doc) throw new Error("材料不存在");
  if (doc.status !== "PENDING_REVIEW") throw new Error("材料不在待审核状态");

  await prisma.document.update({
    where: { id },
    data: {
      status: "DRAFT",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_REJECT",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, name: doc.name, reason },
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  return { ok: true };
}

export async function fileDocument(id: string) {
  const session = await requireSession();
  const doc = await prisma.document.findUnique({ where: { id, deletedAt: null } });
  if (!doc) throw new Error("材料不存在");
  if (doc.matterId)
    await assertCanAccessMatter(session.user.id, session.user.role, doc.matterId);
  if (doc.status !== "APPROVED") throw new Error("只有已审批的材料才能归档");

  await prisma.document.update({
    where: { id },
    data: { status: "FILED" },
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_FILE",
    targetType: "Document",
    targetId: id,
    detail: { matterId: doc.matterId, name: doc.name },
  });

  if (doc.matterId) revalidatePath(`/matters/${doc.matterId}`);
  return { ok: true };
}
