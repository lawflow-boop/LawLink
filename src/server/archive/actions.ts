"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { createNotification } from "@/server/notifications/create";
import { checklistForCategory, evaluateChecklist } from "@/lib/archive/checklists";
import { nextArchiveNo } from "@/lib/archive/archive-no";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanLeadMatter } from "@/lib/permissions";
import { renderArchiveCover, renderArchiveCatalog } from "./render";
import { archiveSubmitSchema, type ArchiveSubmitInput, CLOSED_REASON_CN } from "./schemas";

/**
 * v0.9.4 归档：完整流程
 *   1. 权限：本案主办 / 协办提交，ADMIN 审批
 *   2. 校验 checklist 缺必填项 → 若有且未 forceWithMissing 则拒绝
 *   3. 生成 archiveNo
 *   4. 渲染卷宗封皮 → 入 ARCHIVE 卷宗
 *   5. 渲染卷宗目录（含已生成的封皮自身可选不入目录）
 *   6. 创建 ArchiveRecord
 *   7. Matter status=ARCHIVED + archivedAt + closedAt
 *   8. TimelineEvent + audit
 */
export async function archiveMatter(input: ArchiveSubmitInput) {
  const session = await requireSession();
  const data = archiveSubmitSchema.parse(input);

  await assertMatterWritable(data.matterId);
  await assertCanLeadMatter(session.user.id, data.matterId, "仅案件主办/协办可以提交归档申请");

  const matter = await prisma.matter.findUnique({
    where: { id: data.matterId },
    select: { id: true, status: true, category: true, internalCode: true, title: true }
  });
  if (!matter) throw new Error("案件不存在");
  if (matter.status === "ARCHIVED") throw new Error("案件已归档");

  // checklist 缺项校验
  const checklist = checklistForCategory(matter.category);
  const { missingRequired } = evaluateChecklist(checklist, data.checklist);
  if (missingRequired.length > 0 && !data.forceWithMissing) {
    throw new Error(
      `归档清单缺必填项 ${missingRequired.length} 项：${missingRequired.map((x) => x.label).join("、")}。如确认强制归档，请勾选"强制归档"。`
    );
  }
  const missingItems = missingRequired.map((x) => x.id);

  // 渲染必须在事务外（涉及文件系统 + 加密）。先渲染再事务里建记录。
  const now = new Date();
  const archiveNo = await nextArchiveNo(prisma, matter.category, now);

  const extras = {
    archiveNo,
    closedReason: data.closedReason,
    completedAt: data.completedAt,
    archivedAt: now,
    judgmentSummary: data.judgmentSummary || undefined
  };

  let coverDocId: string;
  try {
    coverDocId = await renderArchiveCover(prisma, {
      matterId: matter.id,
      userId: session.user.id,
      extras
    });
  } catch (err) {
    throw new Error(`渲染卷宗封皮失败：${err instanceof Error ? err.message : String(err)}`);
  }

  let catalogDocId: string;
  try {
    catalogDocId = await renderArchiveCatalog(prisma, {
      matterId: matter.id,
      userId: session.user.id,
      extras,
      excludeDocIds: [coverDocId]
    });
  } catch (err) {
    // 封皮已落库；目录失败时回滚封皮文档（标记软删）。律师重试可重新生成。
    await prisma.document.update({
      where: { id: coverDocId },
      data: { deletedAt: new Date() }
    }).catch(() => null);
    throw new Error(`渲染卷宗目录失败：${err instanceof Error ? err.message : String(err)}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.archiveRecord.create({
      data: {
        matterId: matter.id,
        archiveNo,
        summary: data.summary,
        judgmentSummary: data.judgmentSummary || null,
        closedReason: data.closedReason,
        completedAt: data.completedAt,
        checklistJson: data.checklist as Prisma.InputJsonValue,
        missingItems,
        coverDocId,
        catalogDocId,
        archivedBy: session.user.name ?? session.user.id,
        archivedById: session.user.id,
        status: "PENDING_REVIEW",
        reviewedById: null,
        reviewedAt: null
      }
    });

    await tx.timelineEvent.create({
      data: {
        matterId: matter.id,
        eventType: "MATTER_ARCHIVE_REQUESTED",
        title: `归档申请已提交（${archiveNo}，待审批）`,
        content: `结案方式：${CLOSED_REASON_CN[data.closedReason]}。${data.summary}`,
        occurredAt: now
      }
    });
  });

  await audit({
    userId: session.user.id,
    action: "MATTER_ARCHIVE",
    targetType: "Matter",
    targetId: matter.id,
    detail: {
      archiveNo,
      closedReason: data.closedReason,
      missingCount: missingItems.length,
      forced: data.forceWithMissing && missingItems.length > 0
    }
  });

  revalidatePath(`/matters/${matter.id}`);
  revalidatePath("/matters");
  revalidatePath("/archive");
  return { ok: true, archiveNo, status: "PENDING_REVIEW" };
}

/**
 * v0.16: 管理员审批通过归档申请（PENDING_REVIEW → APPROVED）
 */
export async function approveArchiveRecord(input: { archiveId: string; note?: string }) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("只有管理员可以审批归档申请");
  }

  const record = await prisma.archiveRecord.findUnique({
    where: { id: input.archiveId },
    select: {
      id: true,
      matterId: true,
      status: true,
      completedAt: true,
      archiveNo: true,
      archivedById: true
    }
  });
  if (!record) throw new Error("归档记录不存在");
  if (record.status !== "PENDING_REVIEW") throw new Error("此归档申请已审批");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.archiveRecord.update({
      where: { id: record.id },
      data: {
        status: "APPROVED",
        reviewedById: session.user.id,
        reviewedAt: now,
        reviewNote: input.note?.trim() || null
      }
    });
    await tx.matter.update({
      where: { id: record.matterId },
      data: { status: "ARCHIVED", archivedAt: now, closedAt: record.completedAt }
    });
    await tx.timelineEvent.create({
      data: {
        matterId: record.matterId,
        eventType: "MATTER_ARCHIVED",
        title: `案件已归档（${record.archiveNo}）`,
        content: input.note?.trim() ? `管理员审批：${input.note.trim()}` : "管理员审批通过",
        occurredAt: now
      }
    });
  });

  // v0.18: 通知申请人
  if (record.archivedById && record.archivedById !== session.user.id) {
    const matter = await prisma.matter.findUnique({
      where: { id: record.matterId },
      select: { title: true, internalCode: true }
    });
    await createNotification({
      userId: record.archivedById,
      type: "ARCHIVE_APPROVED",
      priority: "NORMAL",
      title: `归档申请已通过（${record.archiveNo}）`,
      content: `案件 ${matter?.internalCode ?? record.matterId}·${matter?.title ?? ""} 的归档申请已获管理员批准。`,
      href: `/matters/${record.matterId}`,
      refType: "ArchiveRecord",
      refId: record.id
    });
  }

  await audit({
    userId: session.user.id,
    action: "ARCHIVE_APPROVE",
    targetType: "ArchiveRecord",
    targetId: record.id,
    detail: { matterId: record.matterId, archiveNo: record.archiveNo }
  });

  revalidatePath(`/matters/${record.matterId}`);
  revalidatePath("/matters");
  revalidatePath("/archive");
  return { ok: true };
}

/**
 * v0.16: 管理员驳回归档申请
 */
export async function rejectArchiveRecord(input: { archiveId: string; note: string }) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("只有管理员可以驳回归档申请");
  }
  if (!input.note.trim()) throw new Error("请填写驳回原因");

  const record = await prisma.archiveRecord.findUnique({
    where: { id: input.archiveId },
    select: {
      id: true,
      matterId: true,
      status: true,
      archiveNo: true,
      archivedById: true
    }
  });
  if (!record) throw new Error("归档记录不存在");
  if (record.status !== "PENDING_REVIEW") throw new Error("此归档申请已审批");

  await prisma.archiveRecord.update({
    where: { id: record.id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: input.note.trim()
    }
  });

  // v0.18: 通知申请人
  if (record.archivedById && record.archivedById !== session.user.id) {
    const matter = await prisma.matter.findUnique({
      where: { id: record.matterId },
      select: { title: true, internalCode: true }
    });
    await createNotification({
      userId: record.archivedById,
      type: "ARCHIVE_REJECTED",
      priority: "HIGH",
      title: `归档申请被驳回（${record.archiveNo}）`,
      content: `案件 ${matter?.internalCode ?? record.matterId}·${matter?.title ?? ""} 的归档申请被驳回。原因：${input.note.trim()}`,
      href: `/matters/${record.matterId}`,
      refType: "ArchiveRecord",
      refId: record.id
    });
  }

  await audit({
    userId: session.user.id,
    action: "ARCHIVE_REJECT",
    targetType: "ArchiveRecord",
    targetId: record.id,
    detail: { matterId: record.matterId, archiveNo: record.archiveNo, note: input.note.trim() }
  });

  revalidatePath(`/matters/${record.matterId}`);
  revalidatePath("/archive");
  return { ok: true };
}

/**
 * 获取案件的归档准备数据：当前 checklist 模板 + 已有 ArchiveRecord（若有）
 */
export async function getArchivePrepData(matterId: string) {
  const session = await requireSession();
  await assertCanLeadMatter(session.user.id, matterId, "仅案件主办/协办可以准备归档");
  const matter = await prisma.matter.findUnique({
    where: { id: matterId },
    select: {
      id: true,
      title: true,
      internalCode: true,
      category: true,
      status: true,
      closedAt: true,
      archivedAt: true,
      archiveRecords: {
        orderBy: { archivedAt: "desc" },
        take: 1,
        select: {
          archiveNo: true,
          summary: true,
          judgmentSummary: true,
          closedReason: true,
          completedAt: true,
          checklistJson: true,
          missingItems: true,
          coverDocId: true,
          catalogDocId: true,
          archivedBy: true,
          archivedAt: true
        }
      }
    }
  });
  if (!matter) throw new Error("案件不存在");

  const checklist = checklistForCategory(matter.category);

  // v0.11: 取最近一次结案事件的 content 作为预填小结
  const lastCloseEvent = await prisma.timelineEvent.findFirst({
    where: { matterId, eventType: "MATTER_CLOSED" },
    orderBy: { occurredAt: "desc" },
    select: { content: true }
  });

  // v0.17: 已上传并关联到 checklist item 的材料（用于向导自动勾选）
  const linkedDocs = await prisma.document.findMany({
    where: {
      matterId,
      deletedAt: null,
      archiveChecklistItemId: { not: null }
    },
    select: {
      id: true,
      name: true,
      archiveChecklistItemId: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  // itemId → 关联材料列表（保留全部，UI 展示首条 + 余数）
  const docsByItem: Record<string, { id: string; name: string }[]> = {};
  for (const d of linkedDocs) {
    const key = d.archiveChecklistItemId!;
    (docsByItem[key] ??= []).push({ id: d.id, name: d.name });
  }

  return {
    matter,
    checklist,
    existingSummary: lastCloseEvent?.content ?? null,
    docsByItem
  };
}

/**
 * 已归档案件列表（/archive 总览页）—— 仅 status=APPROVED
 */
export async function listArchivedMatters() {
  await requireSession();
  return prisma.archiveRecord.findMany({
    where: { status: "APPROVED" },
    orderBy: { archivedAt: "desc" },
    take: 200,
    select: {
      id: true,
      archiveNo: true,
      summary: true,
      closedReason: true,
      completedAt: true,
      archivedAt: true,
      archivedBy: true,
      missingItems: true,
      matter: {
        select: {
          id: true,
          title: true,
          internalCode: true,
          firmCaseNo: true,
          category: true,
          primaryClient: { select: { name: true } }
        }
      }
    }
  });
}

/**
 * v0.17: 待审批归档申请列表（仅 ADMIN）
 * /archive 待审批 tab 使用
 */
export async function listPendingArchiveRecords() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("仅管理员可查看待审批归档");
  }
  return prisma.archiveRecord.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { archivedAt: "asc" },
    take: 200,
    select: {
      id: true,
      archiveNo: true,
      summary: true,
      judgmentSummary: true,
      closedReason: true,
      completedAt: true,
      archivedAt: true,
      archivedBy: true,
      missingItems: true,
      checklistJson: true,
      matter: {
        select: {
          id: true,
          title: true,
          internalCode: true,
          firmCaseNo: true,
          category: true,
          primaryClient: { select: { name: true } }
        }
      }
    }
  });
}

/**
 * v0.18: 律师端查询自己的已驳回归档申请
 * 用于"我的已驳回归档"入口或案件详情页 banner
 */
export async function listRejectedArchiveRecords() {
  const session = await requireSession();
  return prisma.archiveRecord.findMany({
    where: {
      archivedById: session.user.id,
      status: "REJECTED"
    },
    orderBy: { archivedAt: "desc" },
    take: 100,
    select: {
      id: true,
      archiveNo: true,
      matterId: true,
      summary: true,
      reviewedAt: true,
      reviewNote: true,
      matter: {
        select: {
          id: true,
          title: true,
          internalCode: true,
          status: true,
          archivedAt: true
        }
      }
    }
  });
}

/**
 * v0.18: 获取案件最新一条 ArchiveRecord（无论状态）
 * 案件详情页展示"归档中/已驳回"状态 banner 用
 */
export async function getLatestArchiveRecord(matterId: string) {
  await requireSession();
  return prisma.archiveRecord.findFirst({
    where: { matterId },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      archiveNo: true,
      status: true,
      archivedAt: true,
      reviewedAt: true,
      reviewNote: true,
      archivedBy: true,
      missingItems: true
    }
  });
}

/**
 * v0.20: 批量审批 —— 通过
 *
 * 单条独立处理（不强求原子），逐条复用 approveArchiveRecord 的事务。
 * 返回 { succeeded, failed }，failed 含失败原因，前端展示部分失败的情况。
 */
export async function batchApproveArchiveRecords(input: {
  archiveIds: string[];
  note?: string;
}): Promise<{
  succeeded: string[];
  failed: { id: string; error: string }[];
}> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("只有管理员可以审批归档申请");
  }
  if (!input.archiveIds.length) throw new Error("未选择任何归档申请");
  if (input.archiveIds.length > 100) throw new Error("单次批量不超过 100 条");

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of input.archiveIds) {
    try {
      await approveArchiveRecord({ archiveId: id, note: input.note });
      succeeded.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : "未知错误" });
    }
  }
  await audit({
    userId: session.user.id,
    action: "ARCHIVE_BATCH_APPROVE",
    targetType: "ArchiveRecord",
    targetId: input.archiveIds.join(","),
    detail: {
      total: input.archiveIds.length,
      succeeded: succeeded.length,
      failed: failed.length
    }
  });
  return { succeeded, failed };
}

/**
 * v0.20: 批量审批 —— 驳回（统一原因）
 */
export async function batchRejectArchiveRecords(input: {
  archiveIds: string[];
  note: string;
}): Promise<{
  succeeded: string[];
  failed: { id: string; error: string }[];
}> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("只有管理员可以驳回归档申请");
  }
  if (!input.archiveIds.length) throw new Error("未选择任何归档申请");
  if (input.archiveIds.length > 100) throw new Error("单次批量不超过 100 条");
  if (!input.note.trim()) throw new Error("请填写驳回原因");

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of input.archiveIds) {
    try {
      await rejectArchiveRecord({ archiveId: id, note: input.note });
      succeeded.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : "未知错误" });
    }
  }
  await audit({
    userId: session.user.id,
    action: "ARCHIVE_BATCH_REJECT",
    targetType: "ArchiveRecord",
    targetId: input.archiveIds.join(","),
    detail: {
      total: input.archiveIds.length,
      succeeded: succeeded.length,
      failed: failed.length,
      note: input.note.trim()
    }
  });
  return { succeeded, failed };
}
