"use server";

import { requireSession } from "@/lib/auth/session";
import { getYuandianSettings } from "@/lib/yuandian/settings";
import {
  searchEnterpriseCandidates as clientSearch,
  getEnterpriseBaseInfo as clientDetail,
  type MappedEnterpriseInfo
} from "@/lib/yuandian/enterprise";
import { audit } from "@/server/audit";

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
