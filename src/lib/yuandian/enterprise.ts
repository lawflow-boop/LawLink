/**
 * 元典开放平台 — 企业信息 API（server-side only）
 *
 * 入口：GET {baseUrl}/{routeKey}?param=value，header X-API-Key。
 * 复用 settings.ts 的加密密钥读取。
 */
import { getYuandianSettings, type ResolvedYuandianSettings } from "./settings";
import { YuandianNotConfiguredError, YuandianApiError } from "./client";

// 元典企业搜索候选
export type EnterpriseCandidate = {
  id: string;
  企业名称: string;
  统一社会信用代码: string;
};

// 映射后的企业信息（英文 key）
export type MappedEnterpriseInfo = {
  id: string;
  name: string;
  creditCode: string;
  legalRep: string;
  registeredCapital: string;
  address: string;
  status: string;
  businessScope: string;
  establishedDate: string;
};

// 元典企业基本信息原始响应（中文 key）
type RawEnterpriseBaseInfo = Record<string, unknown> & {
  id?: string;
};

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

/**
 * 企业名称搜索候选（rh_enterpriseSearch，1 POINT/次）
 */
export async function searchEnterpriseCandidates(
  name: string,
  topK = 10,
  resolved?: ResolvedYuandianSettings
): Promise<EnterpriseCandidate[]> {
  const s = resolved ?? (await getYuandianSettings());
  if (!s.configured) throw new YuandianNotConfiguredError();

  const q = name.trim();
  if (!q) return [];

  const url = `${s.baseUrl.replace(/\/$/, "")}/rh_enterpriseSearch?name=${encodeURIComponent(q)}&top_k=${Math.min(topK, 50)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);

  let json: {
    status?: string;
    code?: number;
    message?: string;
    data?: EnterpriseCandidate[] | null;
  };
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": s.apiKey,
        Accept: "application/json"
      },
      signal: ctrl.signal
    });
    if (!res.ok) throw new YuandianApiError(`HTTP ${res.status}`, res.status);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (json.status !== "success") {
    throw new YuandianApiError(json.message ?? "元典企业搜索失败", json.code ?? 500);
  }
  return json.data ?? [];
}

/**
 * 企业基本信息详情（rh_enterpriseBaseInfo，10 POINT/次）
 */
export async function getEnterpriseBaseInfo(
  id: string,
  resolved?: ResolvedYuandianSettings
): Promise<MappedEnterpriseInfo | null> {
  const s = resolved ?? (await getYuandianSettings());
  if (!s.configured) throw new YuandianNotConfiguredError();

  const url = `${s.baseUrl.replace(/\/$/, "")}/rh_enterpriseBaseInfo?id=${encodeURIComponent(id)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  let json: {
    status?: string;
    code?: number;
    message?: string;
    data?: RawEnterpriseBaseInfo | null;
  };
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": s.apiKey,
        Accept: "application/json"
      },
      signal: ctrl.signal
    });
    if (!res.ok) throw new YuandianApiError(`HTTP ${res.status}`, res.status);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (json.status !== "success") {
    throw new YuandianApiError(json.message ?? "元典企业详情查询失败", json.code ?? 500);
  }
  if (!json.data) return null;

  const d = json.data as Record<string, unknown>;
  return {
    id: String(d.id ?? id),
    name: getStr(d, "企业名称"),
    creditCode: getStr(d, "统一社会信用代码"),
    legalRep: getStr(d, "法定代表人"),
    registeredCapital: getStr(d, "注册资本"),
    address: getStr(d, "注册地址"),
    status: getStr(d, "经营状态"),
    businessScope: getStr(d, "经营范围"),
    establishedDate: getStr(d, "成立日期")
  };
}
