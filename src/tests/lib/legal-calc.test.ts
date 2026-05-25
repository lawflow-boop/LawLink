import { describe, it, expect } from "vitest";
import { calcCourtFee, calcLateInterest, daysBetween, numberToChinese } from "@/lib/legal-calc";

describe("calcCourtFee — 财产案件分段累进", () => {
  it("≤1万：固定50元", () => {
    expect(calcCourtFee({ caseType: "PROPERTY", amount: 5000 }).fee).toBe(50);
  });

  it("10万：×2.5%-200 = 2300", () => {
    expect(calcCourtFee({ caseType: "PROPERTY", amount: 100_000 }).fee).toBe(2300);
  });

  it("100万：×1%+3800 = 13800", () => {
    expect(calcCourtFee({ caseType: "PROPERTY", amount: 1_000_000 }).fee).toBe(13800);
  });

  it("简易程序减半", () => {
    const r = calcCourtFee({ caseType: "PROPERTY", amount: 100_000 });
    expect(r.feeSimplified).toBe(Math.round(r.fee / 2));
  });
});

describe("calcCourtFee — 其他案件类型", () => {
  it("劳动争议固定10元", () => {
    const r = calcCourtFee({ caseType: "LABOR" });
    expect(r.fee).toBe(10);
    expect(r.feeSimplified).toBe(5);
  });
});

describe("calcLateInterest", () => {
  it("逾期30天计算", () => {
    const r = calcLateInterest({
      principal: 100_000,
      dueDate: new Date("2025-01-01"),
      paidDate: new Date("2025-01-31"),
    });
    expect(r.daysLate).toBe(30);
    expect(r.interest).toBeGreaterThan(0);
    expect(r.totalToPay).toBe(100_000 + r.interest);
  });

  it("未逾期：0天、0利息", () => {
    const r = calcLateInterest({
      principal: 100_000,
      dueDate: new Date("2025-01-31"),
      paidDate: new Date("2025-01-01"),
    });
    expect(r.daysLate).toBe(0);
    expect(r.interest).toBe(0);
  });
});

describe("daysBetween", () => {
  it("基本天数差", () => {
    expect(daysBetween(new Date("2025-01-01"), new Date("2025-01-11"))).toBe(10);
  });

  it("排除周末", () => {
    // 2025-01-06 (Mon) → 2025-01-10 (Fri) = 4 工作日
    expect(daysBetween(new Date("2025-01-06"), new Date("2025-01-10"), true)).toBe(4);
  });
});

describe("numberToChinese", () => {
  it("整数", () => {
    expect(numberToChinese(10000)).toBe("壹万元整");
  });

  it("带角分", () => {
    const result = numberToChinese(123.45);
    expect(result).toContain("壹佰贰拾叁元");
    expect(result).toContain("肆角伍分");
  });

  it("零元", () => {
    expect(numberToChinese(0)).toBe("零元整");
  });
});
