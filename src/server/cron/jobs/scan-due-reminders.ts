/**
 * v0.27: 期限到期提醒扫描
 * v0.38: 增加开庭提醒（Hearing 表）
 *
 * 每天 09:00 跑一次（Asia/Shanghai），覆盖 Deadline / Hearing：
 * - Deadline：命中 dueAt 落在 T-3 / T-1 / T / T+1 的未完成项各发一条通知
 * - Hearing：命中 startsAt 落在 T-3 / T-1 / T（开庭过去不提醒，不含 T+1），文案带具体开庭时间
 * - 接收人：Deadline/Hearing → procedure.matter.ownerId
 * - 去重：refType="DueReminder:Deadline:-3" 等 + refId 实体 ID + 当日已发不再发
 *
 * 业务原因：v0.26 之前没有"扫到期发提醒"机制，导致律师设的答辩期、举证期等到点不响；
 * v0.38 用户要求：凡有具体开庭时间，开庭前主动提醒（提前3天/1天/当天早上）。
 */
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/server/notifications/create";
import { audit } from "@/server/audit";

const OFFSETS = [-3, -1, 0, 1] as const;
type Offset = (typeof OFFSETS)[number];

export type DueReminderScanResult = {
  deadlineScanned: number;
  deadlineNotified: number;
  hearingScanned: number;
  hearingNotified: number;
  suppressed: number;
};

function startOfLocalDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfLocalDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function offsetKey(offset: Offset) {
  return `DueReminder:${offset >= 0 ? "+" : ""}${offset}`;
}

function priorityFor(offset: Offset) {
  if (offset >= 1) return "URGENT";
  if (offset === 0) return "HIGH";
  if (offset === -1) return "HIGH";
  return "NORMAL";
}

function stateText(offset: Offset) {
  if (offset > 0) return `逾期 ${offset} 天`;
  if (offset === 0) return "今天到期";
  return `还有 ${-offset} 天到期`;
}

// 开庭专用：带"今天/明天/X天后"前缀 + 具体时分（开庭精确到时分，区别于只到天的期限）
function hearingWhenText(offset: Offset, startsAt: Date) {
  const hh = String(startsAt.getHours()).padStart(2, "0");
  const mm = String(startsAt.getMinutes()).padStart(2, "0");
  const day = offset === 0 ? "今天" : offset === -1 ? "明天" : `${-offset} 天后`;
  return `${day} ${hh}:${mm} 开庭`;
}

export async function scanDueReminders(): Promise<DueReminderScanResult> {
  const now = new Date();
  const todayStart = startOfLocalDay(now);

  let deadlineScanned = 0;
  let deadlineNotified = 0;
  let hearingScanned = 0;
  let hearingNotified = 0;
  let suppressed = 0;

  for (const offset of OFFSETS) {
    const target = new Date(now);
    target.setDate(target.getDate() + offset);
    const dayStart = startOfLocalDay(target);
    const dayEnd = endOfLocalDay(target);

    // Deadline 扫描（程序内法定期限：答辩期、举证期等）
    const deadlines = await prisma.deadline.findMany({
      where: {
        completed: false,
        dueAt: { gte: dayStart, lte: dayEnd }
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        procedure: {
          select: {
            id: true,
            matter: {
              select: { id: true, title: true, internalCode: true, ownerId: true }
            }
          }
        }
      }
    });
    deadlineScanned += deadlines.length;

    const refTypeDL = `${offsetKey(offset)}:Deadline`;
    for (const d of deadlines) {
      const userId = d.procedure.matter.ownerId;
      if (!userId) continue;

      const dup = await prisma.notification.findFirst({
        where: { refType: refTypeDL, refId: d.id, createdAt: { gte: todayStart } },
        select: { id: true }
      });
      if (dup) {
        suppressed++;
        continue;
      }

      await createNotification({
        userId,
        type: "DEADLINE_REMINDER",
        priority: priorityFor(offset),
        title: `${stateText(offset)}：${d.title}`,
        content: `案件 ${d.procedure.matter.internalCode}·${d.procedure.matter.title}`,
        href: `/matters/${d.procedure.matter.id}`,
        refType: refTypeDL,
        refId: d.id
      });
      deadlineNotified++;
    }

    // Hearing 扫描（开庭提醒）—— 开庭过去不再提醒，跳过 T+1 这档
    if (offset <= 0) {
      const hearings = await prisma.hearing.findMany({
        where: {
          startsAt: { gte: dayStart, lte: dayEnd }
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          room: true,
          judge: true,
          procedure: {
            select: {
              matter: {
                select: { id: true, title: true, internalCode: true, ownerId: true }
              }
            }
          }
        }
      });
      hearingScanned += hearings.length;

      const refTypeHearing = `${offsetKey(offset)}:Hearing`;
      for (const h of hearings) {
        const userId = h.procedure.matter.ownerId;
        if (!userId) continue;

        const dup = await prisma.notification.findFirst({
          where: { refType: refTypeHearing, refId: h.id, createdAt: { gte: todayStart } },
          select: { id: true }
        });
        if (dup) {
          suppressed++;
          continue;
        }

        const place = [h.room && `${h.room}`, h.judge && `审判员 ${h.judge}`]
          .filter(Boolean)
          .join(" · ");
        await createNotification({
          userId,
          type: "HEARING_REMINDER",
          priority: priorityFor(offset),
          title: `${hearingWhenText(offset, h.startsAt)}：${h.title}`,
          content: `案件 ${h.procedure.matter.internalCode}·${h.procedure.matter.title}${place ? ` · ${place}` : ""}`,
          href: `/matters/${h.procedure.matter.id}`,
          refType: refTypeHearing,
          refId: h.id
        });
        hearingNotified++;
      }
    }
  }

  await audit({
    userId: null,
    action: "DUE_REMINDER_SCAN_CRON",
    targetType: "Report",
    targetId: "due-reminder",
    detail: {
      deadlineScanned,
      deadlineNotified,
      hearingScanned,
      hearingNotified,
      suppressed,
      offsets: OFFSETS
    }
  });

  return {
    deadlineScanned,
    deadlineNotified,
    hearingScanned,
    hearingNotified,
    suppressed
  };
}

// 手动触发入口已移至 @/server/reminders/actions（顶层 "use server"，可被客户端组件 import）
