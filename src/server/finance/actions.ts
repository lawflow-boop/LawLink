"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import {
  assertCanAccessMatter,
  assertCanAssociateMatter,
  assertCanLeadMatter,
  isManager,
  matterVisibilityFilter
} from "@/lib/permissions";
import {
  billingCreateSchema,
  feeEntryCreateSchema,
  commissionPlanSetSchema,
  type BillingCreateInput,
  type FeeEntryCreateInput,
  type CommissionPlanSetInput
} from "./schemas";
import { notifyRoleApprovers } from "@/server/notifications/approval";
import {
  invoiceMatterSearchLimit,
  invoiceMatterSearchWhere
} from "./invoice-matter-search";

// ============ Billing ============

export async function createBilling(input: BillingCreateInput) {
  const session = await requireSession();
  const data = billingCreateSchema.parse(input);
  await assertMatterWritable(data.matterId, { allowFinanceRole: true });

  const created = await prisma.billing.create({
    data: {
      matterId: data.matterId,
      title: data.title,
      contractAmount: new Prisma.Decimal(data.contractAmount),
      schedule: data.schedule || null,
      status: data.status,
      signedAt: data.signedAt
    }
  });

  await audit({
    userId: session.user.id,
    action: "BILLING_CREATE",
    targetType: "Billing",
    targetId: created.id,
    detail: { matterId: data.matterId }
  });

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true, id: created.id };
}

export async function deleteBilling(id: string) {
  const session = await requireSession();
  const billing = await prisma.billing.findUnique({
    where: { id },
    select: { matterId: true }
  });
  if (!billing) return { ok: false };

  if (session.user.role === "FINANCE") {
    await assertMatterWritable(billing.matterId, { allowFinanceRole: true });
  } else {
    await assertMatterWritable(billing.matterId);
    await assertCanLeadMatter(session.user.id, billing.matterId, "仅案件主办/协办或财务可删除合同");
  }

  await prisma.billing.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "BILLING_DELETE",
    targetType: "Billing",
    targetId: id
  });
  revalidatePath(`/matters/${billing.matterId}`);
  return { ok: true };
}

// ============ FeeEntry + 自动分成 ============

/**
 * 创建一条收付记录。
 * - 创建 RECEIVED 时自动按 CommissionPlan 派生 COMMISSION 子条目（每位受益人一条）
 * - parent / children 通过 parentFeeEntryId 关联
 */
export async function createFeeEntry(input: FeeEntryCreateInput) {
  const session = await requireSession();
  const data = feeEntryCreateSchema.parse(input);
  await assertMatterWritable(data.matterId, { allowFinanceRole: true });

  const created = await prisma.$transaction(async (tx) => {
    const entry = await tx.feeEntry.create({
      data: {
        matterId: data.matterId,
        billingId: data.billingId || null,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        occurredAt: data.occurredAt,
        invoiceNo: data.invoiceNo || null,
        payerOrPayee: data.payerOrPayee || null,
        method: data.method || null,
        note: data.note || null,
        recordedById: session.user.id
      }
    });

    // 自动分成
    if (data.type === "RECEIVED" && data.amount > 0) {
      const plans = await tx.commissionPlan.findMany({
        where: { matterId: data.matterId, active: true }
      });
      for (const plan of plans) {
        const share = Number(plan.percent) * data.amount / 100;
        if (share <= 0) continue;
        await tx.feeEntry.create({
          data: {
            matterId: data.matterId,
            billingId: data.billingId || null,
            type: "COMMISSION",
            amount: new Prisma.Decimal(share.toFixed(2)),
            occurredAt: data.occurredAt,
            parentFeeEntryId: entry.id,
            beneficiaryUserId: plan.userId,
            note: plan.label ? `按方案 [${plan.label}] 自动分成 ${plan.percent}%` : `自动分成 ${plan.percent}%`,
            recordedById: session.user.id
          }
        });
      }
    }

    // 实收事件入时间线
    if (data.type === "RECEIVED") {
      await tx.timelineEvent.create({
        data: {
          matterId: data.matterId,
          eventType: "FEE_RECEIVED",
          title: `实收 ¥${data.amount.toLocaleString("zh-CN")}`,
          content: data.note ?? undefined,
          occurredAt: data.occurredAt
        }
      });
    }

    return entry;
  });

  await audit({
    userId: session.user.id,
    action: "FEE_ENTRY_CREATE",
    targetType: "FeeEntry",
    targetId: created.id,
    detail: { matterId: data.matterId, type: data.type, amount: data.amount }
  });

  revalidatePath(`/matters/${data.matterId}`);
  revalidatePath("/finance");
  return { ok: true, id: created.id };
}

export async function deleteFeeEntry(id: string) {
  const session = await requireSession();
  if (!isManager(session.user.role) && session.user.role !== "FINANCE") {
    throw new Error("仅管理员、主办律师或财务可删除收付记录");
  }
  const entry = await prisma.feeEntry.findUnique({
    where: { id },
    include: { commissionChildren: { select: { id: true } } }
  });
  if (!entry) return { ok: false };
  await assertMatterWritable(entry.matterId, { allowFinanceRole: true });

  // 删父条目时同时删除自动派生的分成
  await prisma.$transaction(async (tx) => {
    if (entry.commissionChildren.length > 0) {
      await tx.feeEntry.deleteMany({
        where: { id: { in: entry.commissionChildren.map((c) => c.id) } }
      });
    }
    await tx.feeEntry.delete({ where: { id } });
  });

  await audit({
    userId: session.user.id,
    action: "FEE_ENTRY_DELETE",
    targetType: "FeeEntry",
    targetId: id,
    detail: {
      matterId: entry.matterId,
      cascadedChildren: entry.commissionChildren.length
    }
  });
  revalidatePath(`/matters/${entry.matterId}`);
  revalidatePath("/finance");
  return { ok: true };
}

// ============ CommissionPlan ============

/**
 * 整体替换案件的分成方案。
 * 简单策略：删除所有现有 plan，按 items 创建新的。
 */
export async function setCommissionPlan(input: CommissionPlanSetInput) {
  const session = await requireSession();
  const data = commissionPlanSetSchema.parse(input);
  await assertMatterWritable(data.matterId);
  await assertCanLeadMatter(session.user.id, data.matterId, "仅案件主办/协办可设置分成方案");

  await prisma.$transaction([
    prisma.commissionPlan.deleteMany({ where: { matterId: data.matterId } }),
    prisma.commissionPlan.createMany({
      data: data.items.map((it) => ({
        matterId: data.matterId,
        userId: it.userId,
        percent: new Prisma.Decimal(it.percent),
        label: it.label || null,
        active: true
      }))
    })
  ]);

  await audit({
    userId: session.user.id,
    action: "COMMISSION_PLAN_SET",
    targetType: "Matter",
    targetId: data.matterId,
    detail: { itemCount: data.items.length }
  });

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true };
}

// ============ 全局财务统计 ============

export async function getMatterFinance(matterId: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);

  const [billings, entries, plans, issuedInvoices] = await Promise.all([
    prisma.billing.findMany({
      where: { matterId },
      orderBy: { createdAt: "desc" }
    }),
    prisma.feeEntry.findMany({
      where: { matterId },
      orderBy: { occurredAt: "desc" },
      include: {
        beneficiaryUser: { select: { id: true, name: true } },
        parentFeeEntry: { select: { id: true, type: true } }
      }
    }),
    prisma.commissionPlan.findMany({
      where: { matterId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" }
    }),
    // 开票金额：已开具发票合计
    prisma.invoiceRequest.findMany({
      where: { matterId, status: "ISSUED" },
      select: { amount: true }
    })
  ]);

  const sum = (filter: (e: (typeof entries)[number]) => boolean) =>
    entries.filter(filter).reduce((acc, e) => acc + Number(e.amount), 0);

  const stats = {
    contractAmount: billings.reduce((acc, b) => acc + Number(b.contractAmount), 0),
    receivable: sum((e) => e.type === "RECEIVABLE"),
    received: sum((e) => e.type === "RECEIVED"),
    refund: sum((e) => e.type === "REFUND"),
    cost: sum((e) => e.type === "COST"),
    commission: sum((e) => e.type === "COMMISSION"),
    invoiced: issuedInvoices.reduce((acc, i) => acc + Number(i.amount), 0)
  };

  return { billings, entries, plans, stats };
}

/**
 * v0.11: 列出案件下的申请发票
 */
export async function listMatterInvoiceRequests(matterId: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
  return prisma.invoiceRequest.findMany({
    where: { matterId },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      amount: true,
      title: true,
      status: true,
      processNote: true,
      requestedAt: true,
      processedAt: true,
      invoiceType: true,
      invoiceItem: true,
      buyerName: true,
      buyerTaxNo: true,
      evidenceDocIds: true,
      invoiceNo: true,
      issuedAt: true
    }
  });
}

/**
 * v0.12: 获取案件用于开票的默认信息（客户抬头 + 关联 Intake id）
 */
export async function getMatterInvoiceContext(matterId: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
  const m = await prisma.matter.findUnique({
    where: { id: matterId },
    select: {
      id: true,
      title: true,
      intakeId: true,
      intake: {
        select: {
          id: true,
          status: true,
          receivedAt: true,
          client: { select: { name: true } }
        }
      },
      primaryClientId: true,
      primaryClient: { select: { id: true, name: true, idNumber: true } },
      clientLinks: {
        select: {
          isPrimary: true,
          client: { select: { id: true, name: true, idNumber: true } }
        }
      }
    }
  });
  if (!m) throw new Error("案件不存在");

  // v0.42 项3：开票抬头下拉 = 本案关联的全部客户（去重，主要客户置顶）
  const clientMap = new Map<
    string,
    { id: string; name: string; taxNo: string | null; isPrimary: boolean }
  >();
  if (m.primaryClient) {
    clientMap.set(m.primaryClient.id, {
      id: m.primaryClient.id,
      name: m.primaryClient.name,
      taxNo: m.primaryClient.idNumber ?? null,
      isPrimary: true
    });
  }
  for (const link of m.clientLinks) {
    if (!link.client) continue;
    const existing = clientMap.get(link.client.id);
    if (existing) {
      existing.isPrimary = existing.isPrimary || link.isPrimary;
    } else {
      clientMap.set(link.client.id, {
        id: link.client.id,
        name: link.client.name,
        taxNo: link.client.idNumber ?? null,
        isPrimary: link.isPrimary
      });
    }
  }
  const clientOptions = Array.from(clientMap.values()).sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary)
  );

  return {
    matterId: m.id,
    matterTitle: m.title,
    intakeId: m.intakeId ?? null,
    intake: m.intake
      ? {
          id: m.intake.id,
          status: m.intake.status,
          receivedAt: m.intake.receivedAt,
          clientName: m.intake.client?.name ?? null
        }
      : null,
    clientOptions,
    defaultBuyerName:
      m.primaryClient?.name ?? m.intake?.client?.name ?? null
  };
}

/**
 * v0.12: 创建开票申请（带类型/名目/抬头/依据）
 */
export async function createInvoiceRequest(input: {
  // v0.43 项5：matterId 可空——无关联案件开票须填 noMatterReason
  matterId: string | null;
  noMatterReason?: string | null;
  amount: number;
  invoiceType: "PLAIN" | "SPECIAL";
  invoiceItem: "LAWYER_FEE" | "CONSULTING_FEE" | "AGENCY_FEE" | "OTHER";
  buyerName: string;
  buyerTaxNo?: string | null;
  // v0.42 项4：增值税专用发票购方六要素（专票必填）
  buyerAddress?: string | null;
  buyerPhone?: string | null;
  buyerBank?: string | null;
  buyerBankAccount?: string | null;
  evidenceDocIds: string[];
  requestNote?: string | null;
}) {
  const session = await requireSession();
  if (input.matterId) {
    await assertCanAssociateMatter(session.user.id, input.matterId);
  } else {
    // 无关联案件开票仅财务 / 管理员 / 主任可发起，且必须说明原因
    if (!isManager(session.user.role) && session.user.role !== "FINANCE") {
      throw new Error("无关联案件开票仅财务 / 管理员 / 主任律师可发起");
    }
    if (!input.noMatterReason?.trim()) {
      throw new Error("无关联案件时必须填写原因说明");
    }
  }

  if (input.amount <= 0) throw new Error("金额必须大于 0");
  if (input.invoiceType !== "PLAIN" && input.invoiceType !== "SPECIAL") {
    throw new Error("请选择开票类型");
  }
  if (!input.buyerName.trim()) throw new Error("请填写开票抬头");
  // 专票合规校验（《增值税专用发票使用与管理通知》第一条 + 购方六要素）
  if (input.invoiceType === "SPECIAL") {
    if (!input.buyerTaxNo?.trim()) throw new Error("增值税专用发票必须填写纳税人识别号");
    if (!input.buyerAddress?.trim()) throw new Error("增值税专用发票必须填写购方地址");
    if (!input.buyerPhone?.trim()) throw new Error("增值税专用发票必须填写购方电话");
    if (!input.buyerBank?.trim()) throw new Error("增值税专用发票必须填写开户银行");
    if (!input.buyerBankAccount?.trim()) throw new Error("增值税专用发票必须填写银行账号");
  }
  // 关联案件时必须上传开票依据（委托合同等）；无关联案件以原因说明替代，依据可选
  if (input.matterId && input.evidenceDocIds.length === 0) {
    throw new Error("请上传至少一份开票依据（扫描版委托合同等）");
  }

  const isSpecial = input.invoiceType === "SPECIAL";
  const created = await prisma.invoiceRequest.create({
    data: {
      matterId: input.matterId,
      noMatterReason: input.matterId ? null : input.noMatterReason?.trim() || null,
      amount: input.amount,
      invoiceType: input.invoiceType,
      invoiceItem: input.invoiceItem,
      buyerName: input.buyerName.trim(),
      buyerTaxNo: input.buyerTaxNo?.trim() || null,
      buyerAddress: isSpecial ? input.buyerAddress?.trim() || null : null,
      buyerPhone: isSpecial ? input.buyerPhone?.trim() || null : null,
      buyerBank: isSpecial ? input.buyerBank?.trim() || null : null,
      buyerBankAccount: isSpecial ? input.buyerBankAccount?.trim() || null : null,
      evidenceDocIds: input.evidenceDocIds,
      title: input.buyerName.trim(),
      requestNote: input.requestNote?.trim() || null,
      requestedById: session.user.id
    },
    select: { id: true }
  });

  const matter = input.matterId
    ? await prisma.matter.findUnique({
        where: { id: input.matterId },
        select: { internalCode: true, title: true }
      })
    : null;

  await notifyRoleApprovers({
    roles: ["ADMIN", "PRINCIPAL_LAWYER", "FINANCE"],
    excludeUserId: session.user.id,
    title: "新的发票审批待处理",
    content: `${session.user.name ?? "有用户"} 提交了开票申请：${
      matter ? `${matter.internalCode} ${matter.title}` : input.noMatterReason?.trim() || "无关联案件"
    }，金额 ${input.amount.toLocaleString("zh-CN")} 元`,
    href: "/finance",
    refType: "InvoiceRequest",
    refId: created.id,
    priority: "HIGH"
  });

  revalidatePath("/finance");
  if (input.matterId) revalidatePath(`/matters/${input.matterId}`);
  return created;
}

/** v0.43 项5：财务页开票弹窗用——搜索当前用户可关联案件（轻量，返回编号+标题） */
export async function searchMattersForInvoice(q?: string) {
  const session = await requireSession();
  return prisma.matter.findMany({
    where: invoiceMatterSearchWhere(session.user.id, q),
    select: { id: true, internalCode: true, title: true },
    orderBy: { createdAt: "desc" },
    take: invoiceMatterSearchLimit(q)
  });
}

export async function listAllFeeEntries(params: {
  type?: "RECEIVABLE" | "RECEIVED" | "REFUND" | "COST" | "COMMISSION";
  limit?: number;
}) {
  const session = await requireSession();
  const visFilter = matterVisibilityFilter(session.user.id, session.user.role);
  return prisma.feeEntry.findMany({
    where: {
      ...(params.type ? { type: params.type } : {}),
      matter: { deletedAt: null, ...visFilter }
    },
    orderBy: { occurredAt: "desc" },
    take: params.limit ?? 100,
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      beneficiaryUser: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, name: true } }
    }
  });
}

export async function getMonthlyRevenue(months = 6) {
  const session = await requireSession();
  const visFilter = matterVisibilityFilter(session.user.id, session.user.role);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const entries = await prisma.feeEntry.findMany({
    where: {
      type: { in: ["RECEIVABLE", "RECEIVED"] },
      occurredAt: { gte: start },
      matter: { deletedAt: null, ...visFilter }
    },
    select: { type: true, amount: true, occurredAt: true }
  });

  const buckets: { month: string; received: number; receivable: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.push({
      month: `${d.getMonth() + 1}月`,
      received: 0,
      receivable: 0
    });
  }

  for (const e of entries) {
    const d = new Date(e.occurredAt);
    const idx = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
    if (idx < 0 || idx >= months) continue;
    if (e.type === "RECEIVED") buckets[idx].received += Number(e.amount);
    if (e.type === "RECEIVABLE") buckets[idx].receivable += Number(e.amount);
  }

  return buckets;
}

export async function getPersonalRevenue(userId: string) {
  const session = await requireSession();
  if (!isManager(session.user.role) && session.user.id !== userId) {
    throw new Error("只能查看自己的收入数据");
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const yearStart = new Date(monthStart.getFullYear(), 0, 1);

  const [monthly, yearly] = await Promise.all([
    prisma.feeEntry.aggregate({
      where: {
        type: "COMMISSION",
        beneficiaryUserId: userId,
        occurredAt: { gte: monthStart }
      },
      _sum: { amount: true }
    }),
    prisma.feeEntry.aggregate({
      where: {
        type: "COMMISSION",
        beneficiaryUserId: userId,
        occurredAt: { gte: yearStart }
      },
      _sum: { amount: true }
    })
  ]);

  return {
    monthlyCommission: Number(monthly._sum.amount ?? 0),
    yearlyCommission: Number(yearly._sum.amount ?? 0)
  };
}
