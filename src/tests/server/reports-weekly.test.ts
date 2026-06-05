import { describe, it, expect } from "vitest";
import { weekPeriod, formatWeeklyDigestContent } from "@/server/reports/weekly";

function ymd(d: Date): [number, number, number] {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

describe("weekPeriod", () => {
  it("周二 2026-05-26 → 周一 05-25 到下周一 06-01", () => {
    const p = weekPeriod(new Date(2026, 4, 26));
    expect(ymd(p.start)).toEqual([2026, 5, 25]);
    expect(ymd(p.end)).toEqual([2026, 6, 1]);
    expect(p.label).toBe("2026-05-25 ~ 2026-05-31");
  });

  it("周一 2026-05-25 当天本身 → 本周一即 05-25", () => {
    const p = weekPeriod(new Date(2026, 4, 25));
    expect(ymd(p.start)).toEqual([2026, 5, 25]);
    expect(ymd(p.end)).toEqual([2026, 6, 1]);
  });

  it("周日 2026-05-31 → 仍属本周（5/25-5/31）", () => {
    const p = weekPeriod(new Date(2026, 4, 31));
    expect(ymd(p.start)).toEqual([2026, 5, 25]);
    expect(ymd(p.end)).toEqual([2026, 6, 1]);
  });

  it("跨年：周二 2026-12-29 → 本周一 12-28 到下周一 2027-01-04", () => {
    const p = weekPeriod(new Date(2026, 11, 29));
    expect(ymd(p.start)).toEqual([2026, 12, 28]);
    expect(ymd(p.end)).toEqual([2027, 1, 4]);
  });
});

describe("formatWeeklyDigestContent", () => {
  it("拼接 4 项数据，金额带千分位 + 2 位小数", () => {
    const text = formatWeeklyDigestContent({
      userId: "u1",
      userName: "张三",
      period: weekPeriod(new Date(2026, 4, 26)),
      newIntake: 3,
      closed: 1,
      archived: 2,
      receivedAmount: 125000.5
    });
    expect(text).toContain("新收 3 件");
    expect(text).toContain("已结 1 件");
    expect(text).toContain("已归档 2 件");
    expect(text).toContain("125,000.50 元");
  });

  it("零值也照常拼", () => {
    const text = formatWeeklyDigestContent({
      userId: "u1",
      userName: "李四",
      period: weekPeriod(),
      newIntake: 0,
      closed: 0,
      archived: 0,
      receivedAmount: 0
    });
    expect(text).toContain("0.00 元");
    expect(text.split("·")).toHaveLength(4);
  });
});
