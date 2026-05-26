/**
 * v0.20: 律所报表数据聚合（纯 read-only，无 use server）
 *
 * 4 个口径（来自 PRD 后续规划）：
 *  - 案件量：本期新收 / 在办 / 已结案 / 已归档
 *  - 类别分布：按 MatterCategory
 *  - 律师产出：每个律师承办案件数 / 已结案数 / 收款金额
 *  - 客户应收：按客户聚合 应收 - 已收
 *
 * 时间范围：调用方传 [start, end]，按 Matter.createdAt 落入本期为「新收」。
 */
import { prisma } from "@/lib/prisma";
import type { MatterCategory } from "@prisma/client";

export type ReportPeriod = {
  label: string;
  start: Date;
  end: Date;
};

export function periodPresets(now = new Date()): Record<"month" | "quarter" | "year" | "lastYear", ReportPeriod> {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  return {
    month: {
      label: `${y} 年 ${m + 1} 月`,
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 1)
    },
    quarter: {
      label: `${y} 年 Q${q + 1}`,
      start: new Date(y, q * 3, 1),
      end: new Date(y, q * 3 + 3, 1)
    },
    year: {
      label: `${y} 年度`,
      start: new Date(y, 0, 1),
      end: new Date(y + 1, 0, 1)
    },
    lastYear: {
      label: `${y - 1} 年度`,
      start: new Date(y - 1, 0, 1),
      end: new Date(y, 0, 1)
    }
  };
}

/**
 * 解析自定义时间范围（含 start，不含 end，半开区间）。
 * - start/end 必须 yyyy-MM-dd，否则抛错
 * - end > start
 * - 跨度 ≤ 5 年（防止误输入年份导致全库扫描）
 */
export function customPeriod(startStr: string, endStr: string): ReportPeriod {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startStr) || !re.test(endStr)) {
    throw new Error("日期格式不合法，需要 yyyy-MM-dd");
  }
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  // end 解释为"含当天"，转半开区间需 +1 天
  const end = new Date(ey, em - 1, ed + 1);
  if (end.getTime() <= start.getTime()) {
    throw new Error("结束日期必须晚于起始日期");
  }
  const days = (end.getTime() - start.getTime()) / 86400_000;
  if (days > 5 * 366) {
    throw new Error("自定义跨度不能超过 5 年");
  }
  return {
    label: `${startStr} ~ ${endStr}`,
    start,
    end
  };
}

export type ReportKpis = {
  newIntake: number;
  inProgress: number;
  closed: number;
  archived: number;
  archiveRate: number; // 已归档 / 已结案；0 时返回 0
};

export type CategoryBreakdown = {
  category: MatterCategory;
  count: number;
};

export type LawyerOutput = {
  userId: string;
  name: string;
  ownedCount: number; // owner = userId 的案件数
  closedCount: number;
  receivedAmount: number; // 收款金额
};

export type ClientReceivable = {
  clientId: string;
  name: string;
  receivable: number;
  received: number;
  balance: number;
};

export type ReportData = {
  period: ReportPeriod;
  kpis: ReportKpis;
  byCategory: CategoryBreakdown[];
  byLawyer: LawyerOutput[];
  byClientReceivable: ClientReceivable[];
};

export async function getReportData(period: ReportPeriod): Promise<ReportData> {
  // KPI 1: 本期新收（createdAt 落入本期）
  const newIntake = await prisma.matter.count({
    where: {
      createdAt: { gte: period.start, lt: period.end },
      deletedAt: null
    }
  });

  // KPI 2: 在办（status = IN_PROGRESS，不论何时建的）
  const inProgress = await prisma.matter.count({
    where: { status: "IN_PROGRESS", deletedAt: null }
  });

  // KPI 3: 本期已结（closedAt 落入本期）
  const closed = await prisma.matter.count({
    where: {
      closedAt: { gte: period.start, lt: period.end },
      deletedAt: null
    }
  });

  // KPI 4: 本期已归档（archivedAt 落入本期）
  const archived = await prisma.matter.count({
    where: {
      archivedAt: { gte: period.start, lt: period.end },
      deletedAt: null
    }
  });

  const archiveRate = closed > 0 ? archived / closed : 0;

  // 类别分布（按本期新收的案件分类）
  const cats = await prisma.matter.groupBy({
    by: ["category"],
    where: {
      createdAt: { gte: period.start, lt: period.end },
      deletedAt: null
    },
    _count: { _all: true }
  });
  const byCategory: CategoryBreakdown[] = cats.map((c) => ({
    category: c.category,
    count: c._count._all
  }));

  // 律师产出（按 owner 聚合，本期新收 + 本期已结 + 本期收款）
  const lawyerOwnedRaw = await prisma.matter.groupBy({
    by: ["ownerId"],
    where: {
      createdAt: { gte: period.start, lt: period.end },
      deletedAt: null
    },
    _count: { _all: true }
  });
  const lawyerClosedRaw = await prisma.matter.groupBy({
    by: ["ownerId"],
    where: {
      closedAt: { gte: period.start, lt: period.end },
      deletedAt: null
    },
    _count: { _all: true }
  });

  // 律师本期收款：FeeEntry.type=RECEIVED + occurredAt 在本期 + matter.ownerId
  const feeReceivedRaw = await prisma.feeEntry.findMany({
    where: {
      type: "RECEIVED",
      occurredAt: { gte: period.start, lt: period.end }
    },
    select: { amount: true, matter: { select: { ownerId: true } } }
  });
  const receivedByOwner = new Map<string, number>();
  for (const f of feeReceivedRaw) {
    const oid = f.matter?.ownerId;
    if (!oid) continue;
    receivedByOwner.set(oid, (receivedByOwner.get(oid) ?? 0) + Number(f.amount));
  }

  const userIds = new Set<string>();
  for (const r of lawyerOwnedRaw) userIds.add(r.ownerId);
  for (const r of lawyerClosedRaw) userIds.add(r.ownerId);
  for (const id of receivedByOwner.keys()) userIds.add(id);
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true }
  });
  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  const ownedByOwner = new Map(lawyerOwnedRaw.map((r) => [r.ownerId, r._count._all]));
  const closedByOwner = new Map(lawyerClosedRaw.map((r) => [r.ownerId, r._count._all]));

  const byLawyer: LawyerOutput[] = Array.from(userIds)
    .map((uid) => ({
      userId: uid,
      name: userNameById.get(uid) ?? uid,
      ownedCount: ownedByOwner.get(uid) ?? 0,
      closedCount: closedByOwner.get(uid) ?? 0,
      receivedAmount: receivedByOwner.get(uid) ?? 0
    }))
    .sort((a, b) => b.receivedAmount - a.receivedAmount || b.ownedCount - a.ownedCount);

  // 客户应收：FeeEntry RECEIVABLE / RECEIVED 按 matter.primaryClient 聚合
  const fees = await prisma.feeEntry.findMany({
    where: {
      type: { in: ["RECEIVABLE", "RECEIVED"] },
      occurredAt: { gte: period.start, lt: period.end }
    },
    select: {
      type: true,
      amount: true,
      matter: { select: { primaryClient: { select: { id: true, name: true } } } }
    }
  });
  const byClient = new Map<string, ClientReceivable>();
  for (const f of fees) {
    const c = f.matter?.primaryClient;
    if (!c) continue;
    if (!byClient.has(c.id)) {
      byClient.set(c.id, {
        clientId: c.id,
        name: c.name,
        receivable: 0,
        received: 0,
        balance: 0
      });
    }
    const row = byClient.get(c.id)!;
    if (f.type === "RECEIVABLE") row.receivable += Number(f.amount);
    if (f.type === "RECEIVED") row.received += Number(f.amount);
  }
  for (const row of byClient.values()) row.balance = row.receivable - row.received;
  const byClientReceivable = Array.from(byClient.values()).sort(
    (a, b) => b.balance - a.balance
  );

  return {
    period,
    kpis: { newIntake, inProgress, closed, archived, archiveRate },
    byCategory,
    byLawyer,
    byClientReceivable
  };
}
