"use server";

/**
 * v0.22: 一键扫描案件全部未审查文档
 *
 * - 取本案中 mime 支持的（PDF / DOCX / text）且 7 天内没审查过的 documents
 * - 硬上限单次 5 个文档（防 token 爆）
 * - 循环调 reviewDocument；单条失败不阻断
 * - 返回 { reviewed, skipped, errors[] }
 */
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { assertCanAccessMatter } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { reviewDocument } from "./review-document";
import { revalidatePath } from "next/cache";

const MAX_DOCS_PER_BATCH = 5;
const RECENT_HOURS = 24 * 7;

const REVIEWABLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/docx"
]);
function isReviewable(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (REVIEWABLE_MIMES.has(mime)) return true;
  return mime.startsWith("text/");
}

export type BatchReviewSummary = {
  reviewed: { documentId: string; documentName: string; itemCount: number }[];
  skipped: { documentId: string; documentName: string; reason: string }[];
  errors: { documentId: string; documentName: string; error: string }[];
  matterId: string;
};

export async function batchReviewMatterDocuments(input: {
  matterId: string;
}): Promise<BatchReviewSummary> {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, input.matterId);

  // 拿本案 documents 当中可审查的
  const docs = await prisma.document.findMany({
    where: { matterId: input.matterId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, mimeType: true, createdAt: true }
  });
  const reviewable = docs.filter((d) => isReviewable(d.mimeType));

  // 拉最近 7 天内已审查的 documentId 集合
  const cutoff = new Date(Date.now() - RECENT_HOURS * 3600_000);
  const recent = await prisma.reviewRecord.findMany({
    where: {
      matterId: input.matterId,
      reviewedAt: { gte: cutoff },
      documentId: { in: reviewable.map((d) => d.id) }
    },
    select: { documentId: true }
  });
  const recentSet = new Set(recent.map((r) => r.documentId));

  const skipped: BatchReviewSummary["skipped"] = [];
  const todo: typeof reviewable = [];
  for (const d of docs) {
    if (!isReviewable(d.mimeType)) {
      skipped.push({
        documentId: d.id,
        documentName: d.name,
        reason: `不支持的格式：${d.mimeType ?? "未知"}`
      });
      continue;
    }
    if (recentSet.has(d.id)) {
      skipped.push({
        documentId: d.id,
        documentName: d.name,
        reason: "7 天内已审查过"
      });
      continue;
    }
    todo.push(d);
  }

  const truncated = todo.length > MAX_DOCS_PER_BATCH;
  const batch = todo.slice(0, MAX_DOCS_PER_BATCH);
  if (truncated) {
    for (const d of todo.slice(MAX_DOCS_PER_BATCH)) {
      skipped.push({
        documentId: d.id,
        documentName: d.name,
        reason: `本次跳过（每次最多 ${MAX_DOCS_PER_BATCH} 个，可再次点扫描）`
      });
    }
  }

  const reviewed: BatchReviewSummary["reviewed"] = [];
  const errors: BatchReviewSummary["errors"] = [];
  for (const d of batch) {
    try {
      const r = await reviewDocument({ documentId: d.id });
      reviewed.push({
        documentId: d.id,
        documentName: d.name,
        itemCount: r.items.length
      });
    } catch (err) {
      errors.push({
        documentId: d.id,
        documentName: d.name,
        error: err instanceof Error ? err.message : "未知错误"
      });
    }
  }

  await audit({
    userId: session.user.id,
    action: "AI_BATCH_REVIEW_MATTER",
    targetType: "Matter",
    targetId: input.matterId,
    detail: {
      reviewed: reviewed.length,
      skipped: skipped.length,
      errors: errors.length,
      totalReviewable: reviewable.length,
      limit: MAX_DOCS_PER_BATCH
    }
  });

  revalidatePath(`/matters/${input.matterId}`);

  return {
    matterId: input.matterId,
    reviewed,
    skipped,
    errors
  };
}
