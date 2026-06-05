/**
 * v0.21: 律师周报数据聚合（per-user 视角）
 *
 * 周定义：周一 00:00:00 → 下周一 00:00:00（半开区间）
 */
import { prisma } from "@/lib/prisma";
import type { ReportPeriod } from "./queries";

export function weekPeriod(now = new Date()): ReportPeriod {
  // 周一 = 0
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    label: `${fmt(monday)} ~ ${fmt(new Date(nextMonday.getTime() - 86400_000))}`,
    start: monday,
    end: nextMonday
  };
}

export type LawyerWeeklyDigest = {
  userId: string;
  userName: string;
  period: ReportPeriod;
  newIntake: number;
  closed: number;
  archived: number;
  receivedAmount: number;
};

/**
 * 单个律师本周摘要。复用单条查询，调用方循环。
 */
export async function getLawyerWeeklyDigest(input: {
  userId: string;
  userName: string;
  period?: ReportPeriod;
}): Promise<LawyerWeeklyDigest> {
  const period = input.period ?? weekPeriod();

  const [newIntake, closed, archived, fees] = await Promise.all([
    prisma.matter.count({
      where: {
        ownerId: input.userId,
        createdAt: { gte: period.start, lt: period.end },
        deletedAt: null
      }
    }),
    prisma.matter.count({
      where: {
        ownerId: input.userId,
        closedAt: { gte: period.start, lt: period.end },
        deletedAt: null
      }
    }),
    prisma.matter.count({
      where: {
        ownerId: input.userId,
        archivedAt: { gte: period.start, lt: period.end },
        deletedAt: null
      }
    }),
    prisma.feeEntry.aggregate({
      where: {
        type: "RECEIVED",
        occurredAt: { gte: period.start, lt: period.end },
        matter: { ownerId: input.userId }
      },
      _sum: { amount: true }
    })
  ]);

  return {
    userId: input.userId,
    userName: input.userName,
    period,
    newIntake,
    closed,
    archived,
    receivedAmount: fees._sum.amount ? Number(fees._sum.amount) : 0
  };
}

export function formatWeeklyDigestContent(d: LawyerWeeklyDigest): string {
  const parts = [
    `新收 ${d.newIntake} 件`,
    `已结 ${d.closed} 件`,
    `已归档 ${d.archived} 件`,
    `收款 ${d.receivedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`
  ];
  return parts.join(" · ");
}
