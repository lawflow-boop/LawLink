import { describe, it, expect, beforeEach, vi } from "vitest";
import { getEnterpriseSummary } from "@/lib/yuandian/enterprise";
import { YuandianNotConfiguredError, YuandianApiError } from "@/lib/yuandian/client";
import type { ResolvedYuandianSettings } from "@/lib/yuandian/settings";

const configured: ResolvedYuandianSettings = {
  apiKey: "k",
  baseUrl: "https://open.example.com/open",
  caseDetailHost: "https://www.example.com",
  configured: true
};

const unconfigured: ResolvedYuandianSettings = {
  ...configured,
  apiKey: "",
  configured: false
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as never;
});

function jsonRes(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  } as unknown as Response;
}

// 完整聚合 mock 数据生成器
function aggData(
  overrides: Partial<{
    失信被执行人: number;
    被执行人: number;
    股权冻结: number;
    严重违法: number;
    经营异常: number;
  }> = {}
) {
  const v = {
    失信被执行人: 0,
    被执行人: 0,
    股权冻结: 0,
    严重违法: 0,
    经营异常: 0,
    ...overrides
  };
  return {
    status: "success",
    code: 200,
    data: {
      id: "eid-1",
      name: "测试公司",
      失信被执行人统计: { 总数: v.失信被执行人, 省份: [] },
      被执行人统计: { 总数: v.被执行人, 立案年份: [] },
      股权冻结统计: { 总数: v.股权冻结 },
      严重违法统计: { 总数: v.严重违法, 类别: [{ key: "重大", count: v.严重违法 }] },
      经营异常统计: { 总数: v.经营异常, 列入经营异常名录原因: [] },
      法院公告统计: {
        总数: 5,
        起诉方: 1,
        应诉方: 4,
        法院: [
          { key: "北京海淀法院", count: 3 },
          { key: "上海浦东法院", count: 2 }
        ]
      },
      开庭公告统计: { 总数: 10, 起诉方: 2, 应诉方: 8 },
      行政处罚统计: { 总数: 0 },
      欠税公告统计: { 总数: 0 },
      变更记录统计: { 总数: 3 },
      对外担保统计: { 总数: 0 },
      股权出质统计: { 总数: 1 },
      对外投资统计: { 总数: 8 },
      商标统计: { 总数: 50 },
      专利统计: { 总数: 12 },
      软件著作权统计: { 总数: 0 },
      作品著作权统计: { 总数: 0 },
      网站备案统计: { 总数: 2 }
    }
  };
}

describe("getEnterpriseSummary", () => {
  it("未配置 → throw NotConfigured", async () => {
    await expect(
      getEnterpriseSummary({ id: "x" }, unconfigured)
    ).rejects.toBeInstanceOf(YuandianNotConfiguredError);
  });

  it("id 和 socialCode 同时为空 → throw", async () => {
    await expect(getEnterpriseSummary({}, configured)).rejects.toThrow(/至少传一个/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("正常请求：URL 参数 + 字段映射 + Top 提取", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData()));
    const r = await getEnterpriseSummary({ id: "eid-1" }, configured);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("rh_enterpriseAggregationSummary?");
    expect(url).toContain("id=eid-1");
    expect(init.method).toBe("GET");
    expect(init.headers["X-API-Key"]).toBe("k");

    expect(r).not.toBeNull();
    expect(r!.id).toBe("eid-1");
    expect(r!.name).toBe("测试公司");
    expect(r!.coreRisks).toHaveLength(5);
    expect(r!.coreRisks.map((c) => c.category)).toEqual([
      "失信被执行人",
      "被执行人",
      "股权冻结",
      "严重违法",
      "经营异常"
    ]);
    // 法院公告 top 提取
    const court = r!.litigation.find((s) => s.category === "法院公告")!;
    expect(court.total).toBe(5);
    expect(court.asPlaintiff).toBe(1);
    expect(court.asDefendant).toBe(4);
    expect(court.top).toEqual([
      { key: "北京海淀法院", count: 3 },
      { key: "上海浦东法院", count: 2 }
    ]);
  });

  it("data === null → 返回 null", async () => {
    fetchMock.mockResolvedValue(jsonRes({ status: "success", code: 200, data: null }));
    const r = await getEnterpriseSummary({ socialCode: "abc" }, configured);
    expect(r).toBeNull();
  });

  it("status=failed → 抛 ApiError", async () => {
    fetchMock.mockResolvedValue(jsonRes({ status: "failed", code: 500, message: "boom" }));
    await expect(
      getEnterpriseSummary({ id: "x" }, configured)
    ).rejects.toBeInstanceOf(YuandianApiError);
  });

  it("HTTP 401 → 抛 ApiError", async () => {
    fetchMock.mockResolvedValue(jsonRes({}, false, 401));
    await expect(
      getEnterpriseSummary({ id: "x" }, configured)
    ).rejects.toBeInstanceOf(YuandianApiError);
  });

  it("socialCode 优先走 tyshxydm 参数", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData()));
    await getEnterpriseSummary({ socialCode: "91110000XXXX" }, configured);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("tyshxydm=91110000XXXX");
    expect(url).not.toContain("id=");
  });
});

describe("computeRiskLevel（通过聚合响应间接验证）", () => {
  it("失信被执行人 > 0 → HIGH", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData({ 失信被执行人: 2 })));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("HIGH");
  });

  it("被执行人 > 0（无失信）→ MEDIUM", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData({ 被执行人: 1 })));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("MEDIUM");
  });

  it("股权冻结 > 0 → MEDIUM", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData({ 股权冻结: 3 })));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("MEDIUM");
  });

  it("严重违法 > 0（无被执行/股权冻结）→ MEDIUM", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData({ 严重违法: 1 })));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("MEDIUM");
  });

  it("仅经营异常 > 0 → LOW", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData({ 经营异常: 1 })));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("LOW");
  });

  it("所有核心风险 = 0 → NONE", async () => {
    fetchMock.mockResolvedValue(jsonRes(aggData()));
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("NONE");
  });

  it("失信 + 经营异常 同时 > 0 → 仍 HIGH（最严重者优先）", async () => {
    fetchMock.mockResolvedValue(
      jsonRes(aggData({ 失信被执行人: 1, 经营异常: 5 }))
    );
    const r = await getEnterpriseSummary({ id: "x" }, configured);
    expect(r!.level).toBe("HIGH");
  });
});
