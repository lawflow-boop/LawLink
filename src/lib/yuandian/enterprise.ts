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

// ============================================================
// v0.26: 企业聚合总览（rh_enterpriseAggregationSummary，10 POINT/次）
// ============================================================

/** 聚合接口返回各模块统计的通用结构。律师视角主要看「总数」。 */
export type EnterpriseStat = {
  /** 模块名（"失信被执行人统计" 等，去掉"统计"后缀） */
  category: string;
  /** 该模块总记录数 */
  total: number;
  /** 起诉方计数（仅涉诉相关模块） */
  asPlaintiff?: number;
  /** 应诉方计数（仅涉诉相关模块） */
  asDefendant?: number;
  /** Top 维度摘要（如年份/法院/类型分布），最多 5 项 */
  top?: { key: string; count: number }[];
};

export type EnterpriseRiskLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type EnterpriseSummary = {
  id: string;
  name: string;
  /** 核心风险（律师重点关注） */
  coreRisks: EnterpriseStat[];
  /** 涉诉概况 */
  litigation: EnterpriseStat[];
  /** 辅助信息（变更/担保/股权出质/IP 等） */
  auxiliary: EnterpriseStat[];
  /** 整体风险等级 — 用于 UI 顶部红绿灯 */
  level: EnterpriseRiskLevel;
};

// 律师核心关心：5 类风险 — 命中即标红
const CORE_RISK_KEYS = [
  "失信被执行人统计",
  "被执行人统计",
  "股权冻结统计",
  "严重违法统计",
  "经营异常统计"
] as const;

// 涉诉相关
const LITIGATION_KEYS = [
  "法院公告统计",
  "开庭公告统计",
  "行政处罚统计",
  "欠税公告统计"
] as const;

// 辅助维度
const AUXILIARY_KEYS = [
  "变更记录统计",
  "对外担保统计",
  "股权出质统计",
  "对外投资统计",
  "商标统计",
  "专利统计",
  "软件著作权统计",
  "作品著作权统计",
  "网站备案统计"
] as const;

// 每个统计模块 top 维度对应的 key 名（聚合接口字段名不一致）
const TOP_FIELD_BY_CATEGORY: Record<string, string> = {
  失信被执行人统计: "执行法院",
  被执行人统计: "执行法院",
  股权冻结统计: "执行法院",
  严重违法统计: "类别",
  经营异常统计: "列入经营异常名录原因",
  法院公告统计: "法院",
  开庭公告统计: "审理法院",
  行政处罚统计: "决定机关",
  欠税公告统计: "欠税税种",
  变更记录统计: "变更项目",
  对外担保统计: "主债权种类",
  股权出质统计: "状态",
  对外投资统计: "投资经营状态",
  商标统计: "类别",
  专利统计: "申请公布年份",
  软件著作权统计: "批准年份",
  作品著作权统计: "类别",
  网站备案统计: "单位性质"
};

function pickStat(
  raw: Record<string, unknown>,
  rawKey: string
): EnterpriseStat | null {
  const node = raw[rawKey];
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const total = typeof obj["总数"] === "number" ? (obj["总数"] as number) : 0;
  const asPlaintiff =
    typeof obj["起诉方"] === "number" ? (obj["起诉方"] as number) : undefined;
  const asDefendant =
    typeof obj["应诉方"] === "number" ? (obj["应诉方"] as number) : undefined;
  const topField = TOP_FIELD_BY_CATEGORY[rawKey];
  let top: { key: string; count: number }[] | undefined;
  if (topField) {
    const arr = obj[topField];
    if (Array.isArray(arr)) {
      top = arr
        .slice(0, 5)
        .filter(
          (x): x is { key: string; count: number } =>
            !!x &&
            typeof x === "object" &&
            typeof (x as { key?: unknown }).key === "string" &&
            typeof (x as { count?: unknown }).count === "number"
        )
        .map((x) => ({ key: x.key, count: x.count }));
    }
  }
  return {
    category: rawKey.replace(/统计$/, ""),
    total,
    asPlaintiff,
    asDefendant,
    top
  };
}

function computeRiskLevel(coreRisks: EnterpriseStat[]): EnterpriseRiskLevel {
  const m = new Map(coreRisks.map((s) => [s.category, s.total]));
  // HIGH：失信被执行人（拒不履行的最强信号）
  if ((m.get("失信被执行人") ?? 0) > 0) return "HIGH";
  // MEDIUM：被执行人 / 股权冻结 / 严重违法 — 已有执行案件或重大违规
  if (
    (m.get("被执行人") ?? 0) > 0 ||
    (m.get("股权冻结") ?? 0) > 0 ||
    (m.get("严重违法") ?? 0) > 0
  ) {
    return "MEDIUM";
  }
  // LOW：仅经营异常（多为年报/地址等非诚信问题）
  if ((m.get("经营异常") ?? 0) > 0) return "LOW";
  return "NONE";
}

/**
 * 企业聚合总览（rh_enterpriseAggregationSummary，10 POINT/次）
 *
 * 接受企业 ID 或统一社会信用代码（二者至少一个）。
 */
export async function getEnterpriseSummary(
  identifier: { id?: string; socialCode?: string },
  resolved?: ResolvedYuandianSettings
): Promise<EnterpriseSummary | null> {
  if (!identifier.id && !identifier.socialCode) {
    throw new Error("企业 ID 与统一社会信用代码至少传一个");
  }
  const s = resolved ?? (await getYuandianSettings());
  if (!s.configured) throw new YuandianNotConfiguredError();

  const params = new URLSearchParams();
  if (identifier.id) params.set("id", identifier.id);
  if (identifier.socialCode) params.set("tyshxydm", identifier.socialCode);
  const url = `${s.baseUrl.replace(/\/$/, "")}/rh_enterpriseAggregationSummary?${params.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let json: {
    status?: string;
    code?: number;
    message?: string;
    data?: Record<string, unknown> | null;
  };
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": s.apiKey, Accept: "application/json" },
      signal: ctrl.signal
    });
    if (!res.ok) throw new YuandianApiError(`HTTP ${res.status}`, res.status);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (json.status !== "success") {
    throw new YuandianApiError(
      json.message ?? "元典企业聚合查询失败",
      json.code ?? 500
    );
  }
  if (!json.data) return null;

  const d = json.data;
  const coreRisks = CORE_RISK_KEYS.map((k) => pickStat(d, k)).filter(
    (x): x is EnterpriseStat => !!x
  );
  const litigation = LITIGATION_KEYS.map((k) => pickStat(d, k)).filter(
    (x): x is EnterpriseStat => !!x
  );
  const auxiliary = AUXILIARY_KEYS.map((k) => pickStat(d, k)).filter(
    (x): x is EnterpriseStat => !!x
  );

  return {
    id: typeof d.id === "string" ? d.id : (identifier.id ?? ""),
    name: typeof d.name === "string" ? d.name : "",
    coreRisks,
    litigation,
    auxiliary,
    level: computeRiskLevel(coreRisks)
  };
}
