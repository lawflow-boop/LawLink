"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { matterVisibilityFilter, intakeVisibilityFilter } from "@/lib/permissions";

// ============ Types ============

export type TrendDirection = "up" | "down" | "warn";

export type KpiItem = {
  key: string;
  label: string;
  value: number;
  valueFormat?: "currency";
  trend: { direction: TrendDirection; text: string };
  sparkline: number[];
};

export type ScheduleItem = {
  id: string;
  date: string;
  weekday: string;
  time?: string;
  type: "deadline" | "hearing";
  title: string;
  matter: string;
  clientName: string | null;
  matterId: string | null;
  procedure?: string;
  daysUntil: number; // 距今天数（0=今天）
};

export type HeroData = {
  todayDeadlineCount: number;
  weekHearingCount: number;
  nearTermCount: number;
  focus: {
    title: string;
    matter: string;
    internalCode: string;
    daysLeft: number;
    href: string;
  } | null;
};

// ============ KPIs ============

export async function getDashboardKpis(): Promise<KpiItem[]> {
  const session = await requireSession();
  const userId = session.user.id;
  const role = session.user.role;

  const mVis = matterVisibilityFilter(userId, role);
  const iVis = intakeVisibilityFilter(userId, role);

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [inProgress, pending, deadlines, received] = await Promise.all([
    prisma.matter.count({
      where: { status: "IN_PROGRESS", deletedAt: null, ...mVis }
    }),
    prisma.intake.count({
      where: { status: "PENDING_CONFIRMATION", ...iVis }
    }),
    prisma.deadline.count({
      where: {
        dueAt: { gte: now, lte: in7d },
        completed: false,
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null, ...mVis }
        }
      }
    }),
    prisma.feeEntry.aggregate({
      where: {
        type: "RECEIVED",
        occurredAt: { gte: monthStart },
        matter: { deletedAt: null, ...mVis }
      },
      _sum: { amount: true }
    })
  ]);

  const receivedTotal = Number(received._sum.amount ?? 0);

  // Trend text is derived from raw counts
  // Sparkline is a flat representation of the single value (no historical series yet)
  const spark = (v: number) => Array(14).fill(v);

  return [
    {
      key: "in_progress",
      label: "办理中案件",
      value: inProgress,
      trend: { direction: "up", text: `${inProgress} 件` },
      sparkline: spark(inProgress)
    },
    {
      key: "pending",
      label: "待确认收案",
      value: pending,
      trend: { direction: "warn", text: `${pending} 待处理` },
      sparkline: spark(pending)
    },
    {
      key: "deadline",
      label: "近 7 天期限",
      value: deadlines,
      trend: { direction: "warn", text: `${deadlines} 项` },
      sparkline: spark(deadlines)
    },
    {
      key: "received",
      label: "本月实收",
      value: receivedTotal,
      valueFormat: "currency",
      trend: { direction: "up", text: `¥${(receivedTotal / 10000).toFixed(1)}万` },
      sparkline: spark(Math.round(receivedTotal / 1000))
    }
  ];
}

// ============ Revenue Trend ============

export async function getDashboardRevenueTrend(months = 6) {
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
    const val = Number(e.amount) / 10000; // display in 万
    if (e.type === "RECEIVED") buckets[idx].received += val;
    if (e.type === "RECEIVABLE") buckets[idx].receivable += val;
  }

  // Round to 1 decimal
  for (const b of buckets) {
    b.received = Math.round(b.received * 10) / 10;
    b.receivable = Math.round(b.receivable * 10) / 10;
  }

  return buckets;
}

// ============ Category Distribution ============

const CATEGORY_META: Record<string, { name: string; code: string; color: string }> = {
  CIVIL_COMMERCIAL: { name: "民商事", code: "CC", color: "#5B8DEF" },
  NON_LITIGATION:  { name: "非诉",   code: "NL", color: "#4FD1C5" },
  LEGAL_COUNSEL:   { name: "顾问",   code: "GC", color: "#9B7BF7" },
  CRIMINAL:        { name: "刑事",   code: "CR", color: "#FB923C" },
  ADMINISTRATIVE:  { name: "行政",   code: "AD", color: "#FBBF24" },
  SPECIAL_PROJECT: { name: "专项",   code: "SP", color: "#60A5FA" }
};

export async function getDashboardCategoryDistribution() {
  const session = await requireSession();
  const visFilter = matterVisibilityFilter(session.user.id, session.user.role);

  const groups = await prisma.matter.groupBy({
    by: ["category"],
    where: {
      status: "IN_PROGRESS",
      deletedAt: null,
      ...visFilter
    },
    _count: { category: true }
  });

  const result = groups.map((g) => {
    const meta = CATEGORY_META[g.category] ?? { name: g.category, code: "??", color: "#999" };
    return {
      name: meta.name,
      value: g._count.category,
      code: meta.code,
      color: meta.color
    };
  });

  // Sort by value desc
  result.sort((a, b) => b.value - a.value);

  return result;
}

// ============ Schedule (past 2 days to next 15 days：开庭 + 期限) ============

export async function getDashboardSchedule(): Promise<ScheduleItem[]> {
  const session = await requireSession();
  const visFilter = matterVisibilityFilter(session.user.id, session.user.role);

  const now = new Date();
  const from = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const procWhere = { engagement: "ENGAGED" as const, matter: { deletedAt: null, ...visFilter } };
  const procSelect = {
    type: true,
    customLabel: true,
    matter: {
      select: {
        id: true,
        internalCode: true,
        title: true,
        primaryClient: { select: { name: true } },
        clientLinks: {
          select: {
            isPrimary: true,
            client: { select: { name: true } }
          },
          orderBy: [{ isPrimary: "desc" as const }, { addedAt: "asc" as const }]
        }
      }
    }
  };

  const [hearings, deadlines] = await Promise.all([
    prisma.hearing.findMany({
      where: { startsAt: { gte: from, lte: to }, procedure: procWhere },
      include: { procedure: { select: procSelect } },
      orderBy: { startsAt: "asc" },
      take: 12
    }),
    prisma.deadline.findMany({
      where: { dueAt: { gte: from, lte: to }, completed: false, procedure: procWhere },
      include: { procedure: { select: procSelect } },
      orderBy: { dueAt: "asc" },
      take: 12
    })
  ]);

  const itemsWithSort: { item: ScheduleItem; ts: number }[] = [];
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const DAY = 1000 * 60 * 60 * 24;
  const daysFrom = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);
  const fmt = (d: Date) => ({
    date: `${d.getMonth() + 1}月${d.getDate()}日`,
    weekday: weekdays[d.getDay()],
    time: d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
  });
  const clientNameOf = (matter: {
    primaryClient: { name: string } | null;
    clientLinks: { isPrimary: boolean; client: { name: string } }[];
  }) =>
    matter.primaryClient?.name ??
    matter.clientLinks.find((link) => link.isPrimary)?.client.name ??
    matter.clientLinks[0]?.client.name ??
    null;

  for (const h of hearings) {
    const d = new Date(h.startsAt);
    const matter = h.procedure.matter;
    itemsWithSort.push({
      ts: d.getTime(),
      item: {
        id: `h-${h.id}`,
        ...fmt(d),
        type: "hearing",
        title: h.title,
        matter: matter.title,
        clientName: clientNameOf(matter),
        matterId: matter.id,
        procedure: h.procedure.customLabel ?? h.procedure.type,
        daysUntil: daysFrom(d)
      }
    });
  }

  for (const dl of deadlines) {
    const d = new Date(dl.dueAt);
    const matter = dl.procedure.matter;
    itemsWithSort.push({
      ts: d.getTime(),
      item: {
        id: `d-${dl.id}`,
        ...fmt(d),
        type: "deadline",
        title: dl.title,
        matter: matter.title,
        clientName: clientNameOf(matter),
        matterId: matter.id,
        procedure: dl.procedure.customLabel ?? dl.procedure.type,
        daysUntil: daysFrom(d)
      }
    });
  }

  itemsWithSort.sort((a, b) => a.ts - b.ts);

  return itemsWithSort.map((i) => i.item).slice(0, 12);
}

// ============ Hero Data ============

export async function getDashboardHeroData(): Promise<HeroData> {
  const session = await requireSession();
  const userId = session.user.id;
  const role = session.user.role;
  const visFilter = matterVisibilityFilter(userId, role);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in7d = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [todayDeadlines, weekHearings, nearTermDeadlines, urgentDeadline] = await Promise.all([
    // Today's deadlines
    prisma.deadline.count({
      where: {
        dueAt: { gte: todayStart, lt: todayEnd },
        completed: false,
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null, ...visFilter }
        }
      }
    }),
    // This week's hearings
    prisma.hearing.count({
      where: {
        startsAt: { gte: todayStart, lt: weekEnd },
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null, ...visFilter }
        }
      }
    }),
    // Near-term deadlines (7 days)
    prisma.deadline.count({
      where: {
        dueAt: { gte: now, lte: in7d },
        completed: false,
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null, ...visFilter }
        }
      }
    }),
    // Most urgent deadline (nearest future uncompleted)
    prisma.deadline.findFirst({
      where: {
        dueAt: { gte: now },
        completed: false,
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null, ...visFilter }
        }
      },
      orderBy: { dueAt: "asc" },
      include: {
        procedure: {
          select: {
            matter: { select: { id: true, internalCode: true, title: true } }
          }
        }
      }
    })
  ]);

  let focus: HeroData["focus"] = null;
  if (urgentDeadline) {
    const dueDate = new Date(urgentDeadline.dueAt);
    const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const matter = urgentDeadline.procedure.matter;
    focus = {
      title: urgentDeadline.title,
      matter: matter.title,
      internalCode: matter.internalCode,
      daysLeft,
      href: `/matters/${matter.id}`
    };
  }

  return {
    todayDeadlineCount: todayDeadlines,
    weekHearingCount: weekHearings,
    nearTermCount: nearTermDeadlines,
    focus
  };
}
