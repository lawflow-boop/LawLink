import type { Prisma, PreservationType, PropertyType, GuaranteeType, PreservationStatus } from "@prisma/client";

export type PreservationCaseRow = Prisma.PreservationCaseGetPayload<{
  include: {
    matter: { select: { id: true; internalCode: true; title: true } };
    owner: { select: { id: true; name: true } };
    targets: {
      include: {
        properties: {
          include: {
            renewals: { orderBy: { renewedAt: "desc" }; take: 3 }
          }
        }
      }
    }
  };
}>;

export type MatterOption = {
  id: string;
  internalCode: string;
  title: string;
};

export type UserOption = { id: string; name: string };

/** @deprecated 旧模型兼容别名 */
export type PreservationRow = Prisma.PreservationGetPayload<{
  include: {
    matter: { select: { id: true; internalCode: true; title: true } };
    owner: { select: { id: true; name: true } };
    renewals: true;
  };
}>;

export const PRES_TYPE_CN: Record<PreservationType, string> = {
  PRE_LITIGATION: "诉前保全",
  LITIGATION: "诉中保全",
  ENFORCEMENT: "执行保全"
};

export const PROPERTY_TYPE_CN: Record<PropertyType, string> = {
  BANK_DEPOSIT: "银行存款",
  REAL_ESTATE: "房产",
  VEHICLE: "车辆",
  EQUITY: "股权",
  IP: "知识产权",
  OTHER: "其他财产"
};

export const GUARANTEE_TYPE_CN: Record<GuaranteeType, string> = {
  CASH_DEPOSIT: "保证金",
  GUARANTEE_LETTER: "保函",
  PROPERTY: "财产担保",
  NONE: "无需担保"
};

export const PRES_STATUS_CN: Record<PreservationStatus, string> = {
  ACTIVE: "生效中",
  RENEWED: "已续保",
  EXPIRED: "已到期",
  LIFTED: "已解除"
};

export const PRES_STATUS_COLOR: Record<PreservationStatus, { bg: string; text: string; border: string }> = {
  ACTIVE: { bg: "rgb(74 222 128 / 0.12)", text: "rgb(22 163 74)", border: "rgb(74 222 128 / 0.5)" },
  RENEWED: { bg: "rgb(96 165 250 / 0.12)", text: "rgb(37 99 235)", border: "rgb(96 165 250 / 0.5)" },
  EXPIRED: { bg: "rgb(248 113 113 / 0.12)", text: "rgb(220 38 38)", border: "rgb(248 113 113 / 0.5)" },
  LIFTED: { bg: "rgb(156 163 175 / 0.12)", text: "rgb(107 114 128)", border: "rgb(156 163 175 / 0.5)" }
};

// 到期倒计时分级
export function classifyExpiry(daysLeft: number): { label: string; tone: "danger" | "warn" | "ok" | "muted" } {
  if (daysLeft < 0) return { label: `已过期 ${-daysLeft} 天`, tone: "danger" };
  if (daysLeft === 0) return { label: "今日到期", tone: "danger" };
  if (daysLeft <= 7) return { label: `${daysLeft} 天后到期`, tone: "danger" };
  if (daysLeft <= 30) return { label: `${daysLeft} 天后到期`, tone: "warn" };
  if (daysLeft <= 60) return { label: `${daysLeft} 天后到期`, tone: "muted" };
  return { label: `${daysLeft} 天后到期`, tone: "ok" };
}
