"use server";

/**
 * v0.27: 服务中心 - 外部联系人通讯录
 *
 * 范围：法院 / 检察院 / 公证 / 仲裁 / 他所律师 / 鉴定专家 / 其他外部联系
 * 同事用 User 表，不在此（前端可一并展示）。
 *
 * 权限：所有登录用户可看已通过联系人，可新建；普通成员新建后需管理层审核。
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { isManager } from "@/lib/permissions";
import { createNotification } from "@/server/notifications/create";
import { notifyRoleApprovers } from "@/server/notifications/approval";
import type { Prisma } from "@prisma/client";

const categories = [
  "COURT",
  "PROSECUTOR",
  "POLICE",
  "NOTARY",
  "ARBITRATION",
  "OTHER_FIRM",
  "EXPERT",
  "OTHER"
] as const;

const externalContactSchema = z.object({
  name: z.string().min(1, "姓名必填").max(60),
  category: z.enum(categories),
  organization: z.string().max(120).optional().or(z.literal("")),
  title: z.string().max(60).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().max(80).optional().or(z.literal("")),
  wechat: z.string().max(60).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  tags: z.array(z.string().max(30)).default([])
});

const externalContactUpdateSchema = externalContactSchema.extend({
  id: z.string().cuid()
});

const externalContactReviewSchema = z.object({
  id: z.string().cuid(),
  note: z.string().max(500).optional().or(z.literal(""))
});

function empty(s?: string | null) {
  return s && s.trim() !== "" ? s.trim() : null;
}

export async function listExternalContacts(
  filter: { category?: (typeof categories)[number] | "ALL"; search?: string } = {}
) {
  const session = await requireSession();
  const canReview = isManager(session.user.role);
  const where: Prisma.ExternalContactWhereInput = {
    archivedAt: null,
    status: canReview ? { in: ["APPROVED", "PENDING_REVIEW"] } : "APPROVED"
  };
  if (filter.category && filter.category !== "ALL") {
    where.category = filter.category;
  }
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { organization: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } }
    ];
  }
  return prisma.externalContact.findMany({
    where,
    orderBy: [{ status: "asc" }, { category: "asc" }, { name: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } }
    }
  });
}

async function notifyRequester(userId: string, input: {
  title: string;
  content?: string;
  refId: string;
}) {
  await createNotification({
    userId,
    type: "SYSTEM",
    priority: "NORMAL",
    title: input.title,
    content: input.content,
    href: "/contacts",
    refType: "ExternalContact",
    refId: input.refId
  });
}

async function assertCanModify(id: string, sessionUserId: string, role: string) {
  const c = await prisma.externalContact.findUnique({
    where: { id },
    select: { createdById: true }
  });
  if (!c) throw new Error("联系人不存在");
  const allowed =
    role === "ADMIN" || role === "PRINCIPAL_LAWYER" || c.createdById === sessionUserId;
  if (!allowed) throw new Error("无权修改此联系人");
}

export async function createExternalContact(input: z.infer<typeof externalContactSchema>) {
  const session = await requireSession();
  const data = externalContactSchema.parse(input);
  const status = isManager(session.user.role) ? "APPROVED" : "PENDING_REVIEW";
  const created = await prisma.externalContact.create({
    data: {
      name: data.name.trim(),
      category: data.category,
      organization: empty(data.organization),
      title: empty(data.title),
      phone: empty(data.phone),
      email: empty(data.email),
      wechat: empty(data.wechat),
      address: empty(data.address),
      notes: empty(data.notes),
      tags: data.tags,
      createdById: session.user.id,
      status
    }
  });
  await audit({
    userId: session.user.id,
    action: "EXTERNAL_CONTACT_CREATE",
    targetType: "ExternalContact",
    targetId: created.id,
    detail: { name: created.name, category: created.category, status: created.status }
  });
  if (created.status === "PENDING_REVIEW") {
    await notifyRoleApprovers({
      roles: ["ADMIN", "PRINCIPAL_LAWYER"],
      excludeUserId: session.user.id,
      title: "新的通讯录联系人待审核",
      content: `${session.user.name ?? "同事"} 新增了外部联系人「${created.name}」`,
      href: "/contacts",
      refType: "ExternalContact",
      refId: created.id,
      priority: "HIGH"
    });
  }
  revalidatePath("/contacts");
  return created;
}

export async function updateExternalContact(input: z.infer<typeof externalContactUpdateSchema>) {
  const session = await requireSession();
  const data = externalContactUpdateSchema.parse(input);
  await assertCanModify(data.id, session.user.id, session.user.role);
  const updated = await prisma.externalContact.update({
    where: { id: data.id },
    data: {
      name: data.name.trim(),
      category: data.category,
      organization: empty(data.organization),
      title: empty(data.title),
      phone: empty(data.phone),
      email: empty(data.email),
      wechat: empty(data.wechat),
      address: empty(data.address),
      notes: empty(data.notes),
      tags: data.tags
    }
  });
  await audit({
    userId: session.user.id,
    action: "EXTERNAL_CONTACT_UPDATE",
    targetType: "ExternalContact",
    targetId: data.id,
    detail: { name: updated.name }
  });
  revalidatePath("/contacts");
  return updated;
}

export async function approveExternalContact(input: z.infer<typeof externalContactReviewSchema>) {
  const session = await requireSession();
  if (!isManager(session.user.role)) throw new Error("仅管理员可审核联系人");
  const data = externalContactReviewSchema.parse(input);
  const current = await prisma.externalContact.findUnique({
    where: { id: data.id },
    select: { id: true, name: true, status: true, createdById: true }
  });
  if (!current) throw new Error("联系人不存在");
  if (current.status !== "PENDING_REVIEW") throw new Error("该联系人当前不在待审核状态");

  const approved = await prisma.externalContact.update({
    where: { id: data.id },
    data: {
      status: "APPROVED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: empty(data.note)
    }
  });

  await audit({
    userId: session.user.id,
    action: "EXTERNAL_CONTACT_APPROVE",
    targetType: "ExternalContact",
    targetId: data.id,
    detail: { name: approved.name, note: empty(data.note) }
  });
  if (current.createdById !== session.user.id) {
    await notifyRequester(current.createdById, {
      title: "通讯录联系人已通过",
      content: `外部联系人「${approved.name}」已通过审核并展示`,
      refId: approved.id
    });
  }
  revalidatePath("/contacts");
  return approved;
}

export async function rejectExternalContact(input: z.infer<typeof externalContactReviewSchema>) {
  const session = await requireSession();
  if (!isManager(session.user.role)) throw new Error("仅管理员可审核联系人");
  const data = externalContactReviewSchema.parse(input);
  const current = await prisma.externalContact.findUnique({
    where: { id: data.id },
    select: { id: true, name: true, status: true, createdById: true }
  });
  if (!current) throw new Error("联系人不存在");
  if (current.status !== "PENDING_REVIEW") throw new Error("该联系人当前不在待审核状态");

  const rejected = await prisma.externalContact.update({
    where: { id: data.id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: empty(data.note)
    }
  });

  await audit({
    userId: session.user.id,
    action: "EXTERNAL_CONTACT_REJECT",
    targetType: "ExternalContact",
    targetId: data.id,
    detail: { name: rejected.name, note: empty(data.note) }
  });
  if (current.createdById !== session.user.id) {
    await notifyRequester(current.createdById, {
      title: "通讯录联系人未通过",
      content: `外部联系人「${rejected.name}」未通过审核${data.note ? `：${data.note}` : ""}`,
      refId: rejected.id
    });
  }
  revalidatePath("/contacts");
  return rejected;
}

export async function archiveExternalContact(id: string) {
  const session = await requireSession();
  await assertCanModify(id, session.user.id, session.user.role);
  await prisma.externalContact.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
  await audit({
    userId: session.user.id,
    action: "EXTERNAL_CONTACT_ARCHIVE",
    targetType: "ExternalContact",
    targetId: id
  });
  revalidatePath("/contacts");
}
