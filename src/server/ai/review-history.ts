"use server";

/**
 * v0.21: 文书 AI 审查历史查询
 */
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { assertCanAccessMatter } from "@/lib/permissions";
import type {
  ReviewItem,
  ReviewSeverity,
  ReviewType
} from "@/lib/ai/review-parser";

export type ReviewHistoryEntry = {
  id: string;
  reviewedAt: Date;
  reviewedBy: { id: string; name: string };
  itemCount: number;
  truncated: boolean;
  textPreviewChars: number;
  /** 按 severity 统计：{ HIGH: 2, MEDIUM: 3, LOW: 0 } */
  severityCounts: Record<ReviewSeverity, number>;
};

export async function listReviewHistory(input: {
  documentId: string;
}): Promise<ReviewHistoryEntry[]> {
  const session = await requireSession();

  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, deletedAt: null },
    select: { id: true, matterId: true }
  });
  if (!doc) return [];
  if (doc.matterId) {
    await assertCanAccessMatter(session.user.id, session.user.role, doc.matterId);
  }

  const list = await prisma.reviewRecord.findMany({
    where: { documentId: doc.id },
    orderBy: { reviewedAt: "desc" },
    select: {
      id: true,
      reviewedAt: true,
      itemCount: true,
      truncated: true,
      textPreviewChars: true,
      itemsJson: true,
      reviewedBy: { select: { id: true, name: true } }
    }
  });

  return list.map((r) => {
    const items = (Array.isArray(r.itemsJson) ? r.itemsJson : []) as ReviewItem[];
    const sev: Record<ReviewSeverity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const it of items) {
      if (it.severity in sev) sev[it.severity]++;
    }
    return {
      id: r.id,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy,
      itemCount: r.itemCount,
      truncated: r.truncated,
      textPreviewChars: r.textPreviewChars,
      severityCounts: sev
    };
  });
}

export async function getReviewRecord(input: {
  recordId: string;
}): Promise<{
  id: string;
  reviewedAt: Date;
  reviewedBy: { id: string; name: string };
  documentName: string;
  textPreviewChars: number;
  truncated: boolean;
  items: ReviewItem[];
} | null> {
  const session = await requireSession();
  const rec = await prisma.reviewRecord.findUnique({
    where: { id: input.recordId },
    select: {
      id: true,
      reviewedAt: true,
      itemsJson: true,
      textPreviewChars: true,
      truncated: true,
      matterId: true,
      reviewedBy: { select: { id: true, name: true } },
      document: { select: { name: true } }
    }
  });
  if (!rec) return null;
  await assertCanAccessMatter(session.user.id, session.user.role, rec.matterId);
  return {
    id: rec.id,
    reviewedAt: rec.reviewedAt,
    reviewedBy: rec.reviewedBy,
    documentName: rec.document.name,
    textPreviewChars: rec.textPreviewChars,
    truncated: rec.truncated,
    items: (Array.isArray(rec.itemsJson) ? rec.itemsJson : []) as ReviewItem[]
  };
}
