import { describe, it, expect } from "vitest";
import { periodPresets, customPeriod } from "@/server/reports/queries";

function ymd(d: Date): [number, number, number] {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

describe("periodPresets", () => {
  it("2026-05-26 → 本月 = 2026-05-01 到 2026-06-01", () => {
    const p = periodPresets(new Date(2026, 4, 26));
    expect(ymd(p.month.start)).toEqual([2026, 5, 1]);
    expect(ymd(p.month.end)).toEqual([2026, 6, 1]);
    expect(p.month.label).toBe("2026 年 5 月");
  });

  it("2026-05-26 → 本季 = 2026 Q2（4-7 月）", () => {
    const p = periodPresets(new Date(2026, 4, 26));
    expect(ymd(p.quarter.start)).toEqual([2026, 4, 1]);
    expect(ymd(p.quarter.end)).toEqual([2026, 7, 1]);
    expect(p.quarter.label).toBe("2026 年 Q2");
  });

  it("2026-05-26 → 本年 = 2026-01-01 到 2027-01-01", () => {
    const p = periodPresets(new Date(2026, 4, 26));
    expect(ymd(p.year.start)).toEqual([2026, 1, 1]);
    expect(ymd(p.year.end)).toEqual([2027, 1, 1]);
    expect(p.year.label).toBe("2026 年度");
  });

  it("2026-05-26 → 上年 = 2025-01-01 到 2026-01-01", () => {
    const p = periodPresets(new Date(2026, 4, 26));
    expect(ymd(p.lastYear.start)).toEqual([2025, 1, 1]);
    expect(ymd(p.lastYear.end)).toEqual([2026, 1, 1]);
    expect(p.lastYear.label).toBe("2025 年度");
  });

  it("Q1（1 月）边界", () => {
    const p = periodPresets(new Date(2026, 0, 15));
    expect(ymd(p.quarter.start)).toEqual([2026, 1, 1]);
    expect(ymd(p.quarter.end)).toEqual([2026, 4, 1]);
    expect(p.quarter.label).toBe("2026 年 Q1");
  });

  it("Q4（12 月）边界，本月 end 跨年", () => {
    const p = periodPresets(new Date(2026, 11, 31));
    expect(ymd(p.month.start)).toEqual([2026, 12, 1]);
    expect(ymd(p.month.end)).toEqual([2027, 1, 1]);
    expect(ymd(p.quarter.start)).toEqual([2026, 10, 1]);
    expect(ymd(p.quarter.end)).toEqual([2027, 1, 1]);
  });
});

describe("customPeriod", () => {
  it("2026-01-01 ~ 2026-03-31 → start=01-01, end=04-01（含末日 → 半开 +1）", () => {
    const p = customPeriod("2026-01-01", "2026-03-31");
    expect(ymd(p.start)).toEqual([2026, 1, 1]);
    expect(ymd(p.end)).toEqual([2026, 4, 1]);
    expect(p.label).toBe("2026-01-01 ~ 2026-03-31");
  });

  it("月末跨月正确递增（2026-01-31 → 2026-02-01）", () => {
    const p = customPeriod("2026-01-01", "2026-01-31");
    expect(ymd(p.end)).toEqual([2026, 2, 1]);
  });

  it("日期格式不合法抛错", () => {
    expect(() => customPeriod("2026/01/01", "2026-03-31")).toThrow(/格式/);
    expect(() => customPeriod("2026-1-1", "2026-3-31")).toThrow(/格式/);
  });

  it("同一天合法（含当天 → 半开 +1 后仍 > start）", () => {
    expect(() => customPeriod("2026-03-01", "2026-03-01")).not.toThrow();
  });

  it("end < start 抛错", () => {
    expect(() => customPeriod("2026-03-01", "2026-02-28")).toThrow(/晚于/);
  });

  it("跨度 > 5 年抛错", () => {
    expect(() => customPeriod("2020-01-01", "2026-01-02")).toThrow(/5 年/);
  });

  it("正好 5 年内合法", () => {
    expect(() => customPeriod("2021-01-01", "2025-12-31")).not.toThrow();
  });
});
