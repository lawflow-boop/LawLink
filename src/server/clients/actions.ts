"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { clientVisibilityFilter, isManager } from "@/lib/permissions";
import { generateClientCode } from "./code-generator";
import {
  clientCreateSchema,
  clientUpdateSchema,
  clientListQuerySchema,
  contactInputSchema,
  type ClientCreateInput,
  type ClientUpdateInput,
  type ContactInput,
  type ClientListQuery
} from "./schemas";

// 空字符串归 null（Prisma 不接受 "" 给可空字段）
function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out as T;
}

export async function listClients(input: Partial<ClientListQuery> = {}) {
  const session = await requireSession();
  const query = clientListQuerySchema.parse(input);

  const where: Prisma.ClientWhereInput = {
    ...clientVisibilityFilter(session.user.id, session.user.role),
    deletedAt: null,
    ...(query.type ? { type: query.type } : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { idNumber: { contains: query.search } },
            { phone: { contains: query.search } },
            { email: { contains: query.search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
        _count: { select: { matters: true, intakes: true } }
      }
    }),
    prisma.client.count({ where })
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getClientById(id: string) {
  const session = await requireSession();
  // 权限检查：manager/finance 看全部，其他人需有关联案件
  if (!isManager(session.user.role) && session.user.role !== "FINANCE") {
    const accessible = await prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
        ...clientVisibilityFilter(session.user.id, session.user.role)
      },
      select: { id: true }
    });
    if (!accessible) throw new Error("客户不存在");
  }
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      matters: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          internalCode: true,
          title: true,
          category: true,
          status: true,
          updatedAt: true
        }
      }
    }
  });

  if (client) {
    await audit({
      userId: session.user.id,
      action: "CLIENT_VIEW",
      targetType: "Client",
      targetId: id
    });
  }
  return client;
}

// v0.37: 客户财务汇总 —— 跨该客户名下所有案件聚合合同/应收/已收
export async function getClientFinanceSummary(clientId: string) {
  const session = await requireSession();
  // 权限：与 getClientById 一致
  if (!isManager(session.user.role) && session.user.role !== "FINANCE") {
    const accessible = await prisma.client.findFirst({
      where: {
        id: clientId,
        deletedAt: null,
        ...clientVisibilityFilter(session.user.id, session.user.role)
      },
      select: { id: true }
    });
    if (!accessible) throw new Error("客户不存在");
  }

  const matterWhere = { primaryClientId: clientId, deletedAt: null };
  const [billings, fees, matterCount] = await Promise.all([
    prisma.billing.findMany({
      where: { matter: matterWhere },
      include: { matter: { select: { id: true, internalCode: true, title: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.feeEntry.findMany({
      where: { type: { in: ["RECEIVABLE", "RECEIVED"] }, matter: matterWhere },
      select: { type: true, amount: true }
    }),
    prisma.matter.count({ where: matterWhere })
  ]);

  const contractTotal = billings.reduce((s, b) => s + Number(b.contractAmount), 0);
  const receivable = fees
    .filter((f) => f.type === "RECEIVABLE")
    .reduce((s, f) => s + Number(f.amount), 0);
  const received = fees
    .filter((f) => f.type === "RECEIVED")
    .reduce((s, f) => s + Number(f.amount), 0);

  return {
    contractTotal,
    receivable,
    received,
    pending: Math.max(0, receivable - received),
    matterCount,
    billings: billings.map((b) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      contractAmount: Number(b.contractAmount),
      signedAt: b.signedAt,
      matter: b.matter
    }))
  };
}

export async function createClient(input: ClientCreateInput) {
  const session = await requireSession();
  const data = clientCreateSchema.parse(input);

  const internalCode = await generateClientCode();
  const created = await prisma.client.create({
    data: {
      ...emptyToNull({
        name: data.name,
        type: data.type,
        idNumber: data.idNumber,
        address: data.address,
        phone: data.phone,
        email: data.email,
        source: data.source,
        notes: data.notes,
        industry: data.industry,
        ethnicity: data.ethnicity
      }),
      internalCode,
      cooperationStatus: data.cooperationStatus,
      gender: data.gender || null,
      tags: data.tags,
      contacts: {
        create: data.contacts.map((c) =>
          emptyToNull({
            name: c.name,
            title: c.title,
            phone: c.phone,
            email: c.email,
            wechat: c.wechat,
            isPrimary: c.isPrimary,
            notes: c.notes
          })
        )
      }
    }
  });

  await audit({
    userId: session.user.id,
    action: "CLIENT_CREATE",
    targetType: "Client",
    targetId: created.id,
    detail: { name: created.name, type: created.type }
  });

  revalidatePath("/clients");
  return { ok: true, id: created.id };
}

export async function updateClient(input: ClientUpdateInput) {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw new Error("仅管理员或主办律师可编辑客户信息");
  }
  const data = clientUpdateSchema.parse(input);
  const { id, contacts, gender, ...rest } = data;

  // 简单策略：删除所有联系人 + 重新创建。后续可优化为 diff
  await prisma.$transaction([
    prisma.contact.deleteMany({ where: { clientId: id } }),
    prisma.client.update({
      where: { id },
      data: {
        ...emptyToNull(rest),
        gender: gender || null,
        tags: data.tags,
        contacts: {
          create: contacts.map((c) =>
            emptyToNull({
              name: c.name,
              title: c.title,
              phone: c.phone,
              email: c.email,
              wechat: c.wechat,
              isPrimary: c.isPrimary,
              notes: c.notes
            })
          )
        }
      }
    })
  ]);

  await audit({
    userId: session.user.id,
    action: "CLIENT_UPDATE",
    targetType: "Client",
    targetId: id
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true, id };
}

export async function softDeleteClient(id: string) {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("只有管理员或主办律师可以删除客户");
  }

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() }
  });

  await audit({
    userId: session.user.id,
    action: "CLIENT_DELETE",
    targetType: "Client",
    targetId: id
  });

  revalidatePath("/clients");
  return { ok: true };
}

// 单独的 contact 操作（用于详情页快速编辑联系人，不通过整 client 重写）
export async function addContact(clientId: string, input: ContactInput) {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw new Error("仅管理员或主办律师可编辑联系人");
  }
  const data = contactInputSchema.parse(input);
  const created = await prisma.contact.create({
    data: { clientId, ...emptyToNull(data) }
  });
  await audit({
    userId: session.user.id,
    action: "CONTACT_CREATE",
    targetType: "Contact",
    targetId: created.id,
    detail: { clientId }
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, id: created.id };
}

export async function deleteContact(id: string) {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw new Error("仅管理员或主办律师可删除联系人");
  }
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return { ok: false };
  await prisma.contact.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "CONTACT_DELETE",
    targetType: "Contact",
    targetId: id,
    detail: { clientId: contact.clientId }
  });
  revalidatePath(`/clients/${contact.clientId}`);
  return { ok: true };
}
