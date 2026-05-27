"use server";

import { requireSession } from "@/lib/auth/session";
import { getYuandianSettings } from "@/lib/yuandian/settings";
import {
  searchEnterpriseCandidates as clientSearch,
  getEnterpriseBaseInfo as clientDetail,
  getEnterpriseSummary as clientSummary,
  type MappedEnterpriseInfo,
  type EnterpriseSummary
} from "@/lib/yuandian/enterprise";
import { audit } from "@/server/audit";
import { prisma } from "@/lib/prisma";
import {
  assertCanAccessMatter,
  assertCanModifyMatter
} from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export type EnterpriseSearchItem = {
  id: string;
  name: string;
  creditCode: string;
};

/**
 * 企业名称搜索（1 POINT/次），未配置时静默返回 configured: false
 */
export async function searchEnterpriseCandidates(
  name: string
): Promise<{ items: EnterpriseSearchItem[]; configured: boolean }> {
  const session = await requireSession();
  const settings = await getYuandianSettings();
  if (!settings.configured) return { items: [], configured: false };

  try {
    const candidates = await clientSearch(name, 10, settings);

    await audit({
      userId: session.user.id,
      action: "YUANDIAN_ENTERPRISE_SEARCH",
      targetType: "SystemSetting",
      targetId: "yuandianSettings",
      detail: { query: name, hits: candidates.length }
    });

    return {
      items: candidates.map((c) => ({
        id: c.id,
        name: c["企业名称"],
        creditCode: c["统一社会信用代码"]
      })),
      configured: true
    };
  } catch {
    return { items: [], configured: true };
  }
}

/**
 * 企业详情（10 POINT/次），未配置时返回 configured: false
 */
export async function getEnterpriseDetail(
  id: string
): Promise<{ info: MappedEnterpriseInfo | null; configured: boolean }> {
  const session = await requireSession();
  const settings = await getYuandianSettings();
  if (!settings.configured) return { info: null, configured: false };

  const info = await clientDetail(id, settings);

  await audit({
    userId: session.user.id,
    action: "YUANDIAN_ENTERPRISE_DETAIL",
    targetType: "SystemSetting",
    targetId: "yuandianSettings",
    detail: { enterpriseId: id, name: info?.name, found: !!info }
  });

  return { info, configured: true };
}

// ============================================================
// v0.26: 对方公司风险查询（聚合总览 + Party 绑定）
// ============================================================

async function loadPartyWithMatter(partyId: string) {
  const party = await prisma.party.findUnique({
    where: { id: partyId },
    select: {
      id: true,
      name: true,
      role: true,
      matterId: true,
      enterpriseId: true,
      enterpriseSocialCode: true,
      enterpriseName: true,
      enterpriseBoundAt: true
    }
  });
  if (!party) throw new Error("当事人不存在");
  if (!party.matterId) throw new Error("当事人未关联案件");
  return party;
}

/**
 * 把某个对方 Party 绑定到元典企业（写入企业 ID、统一社会信用代码、企业名）
 *
 * 权限：当前用户对该 Matter 有修改权限（owner 或 manager）
 */
export async function bindPartyToEnterprise(input: {
  partyId: string;
  enterpriseId: string;
  socialCode: string;
  enterpriseName: string;
}): Promise<{ ok: true }> {
  const session = await requireSession();
  const party = await loadPartyWithMatter(input.partyId);
  await assertCanModifyMatter(
    session.user.id,
    session.user.role,
    party.matterId!
  );

  await prisma.party.update({
    where: { id: party.id },
    data: {
      enterpriseId: input.enterpriseId,
      enterpriseSocialCode: input.socialCode,
      enterpriseName: input.enterpriseName,
      enterpriseBoundAt: new Date()
    }
  });

  await audit({
    userId: session.user.id,
    action: "YUANDIAN_ENTERPRISE_BIND",
    targetType: "Party",
    targetId: party.id,
    detail: {
      matterId: party.matterId,
      partyName: party.name,
      enterpriseId: input.enterpriseId,
      socialCode: input.socialCode,
      enterpriseName: input.enterpriseName
    }
  });

  revalidatePath(`/matters/${party.matterId}`);
  return { ok: true };
}

/**
 * 解绑 Party 与元典企业。
 *
 * 权限：当前用户对该 Matter 有修改权限。
 */
export async function unbindPartyEnterprise(
  partyId: string
): Promise<{ ok: true }> {
  const session = await requireSession();
  const party = await loadPartyWithMatter(partyId);
  await assertCanModifyMatter(
    session.user.id,
    session.user.role,
    party.matterId!
  );

  await prisma.party.update({
    where: { id: partyId },
    data: {
      enterpriseId: null,
      enterpriseSocialCode: null,
      enterpriseName: null,
      enterpriseBoundAt: null
    }
  });

  await audit({
    userId: session.user.id,
    action: "YUANDIAN_ENTERPRISE_UNBIND",
    targetType: "Party",
    targetId: partyId,
    detail: { matterId: party.matterId, partyName: party.name }
  });

  revalidatePath(`/matters/${party.matterId}`);
  return { ok: true };
}

/**
 * 拉取某个已绑定 Party 的企业聚合总览（10 POINT/次）
 *
 * 权限：当前用户对该 Matter 有访问权限。
 */
export async function getEnterpriseSummaryByParty(
  partyId: string
): Promise<{ summary: EnterpriseSummary | null; configured: boolean }> {
  const session = await requireSession();
  const party = await loadPartyWithMatter(partyId);
  await assertCanAccessMatter(
    session.user.id,
    session.user.role,
    party.matterId!
  );

  if (!party.enterpriseId && !party.enterpriseSocialCode) {
    throw new Error("此当事人尚未绑定元典企业");
  }

  const settings = await getYuandianSettings();
  if (!settings.configured) return { summary: null, configured: false };

  const summary = await clientSummary(
    { id: party.enterpriseId ?? undefined, socialCode: party.enterpriseSocialCode ?? undefined },
    settings
  );

  await audit({
    userId: session.user.id,
    action: "YUANDIAN_ENTERPRISE_SUMMARY",
    targetType: "Party",
    targetId: party.id,
    detail: {
      matterId: party.matterId,
      enterpriseId: party.enterpriseId,
      socialCode: party.enterpriseSocialCode,
      level: summary?.level,
      coreRiskTotals: summary?.coreRisks.reduce<Record<string, number>>(
        (acc, r) => {
          acc[r.category] = r.total;
          return acc;
        },
        {}
      )
    }
  });

  return { summary, configured: true };
}
