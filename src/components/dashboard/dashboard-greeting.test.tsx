import { describe, expect, it } from "vitest";
import { formatDashboardDateLabel } from "./dashboard-greeting";

describe("formatDashboardDateLabel", () => {
  it("formats Chinese date text deterministically for SSR and client hydration", () => {
    // 2026-06-24 is Wednesday. Avoid toLocaleDateString because Node/Browser ICU
    // may render "日星期三" vs "日 星期三", causing hydration mismatch.
    expect(formatDashboardDateLabel(new Date(2026, 5, 24))).toBe("2026年6月24日 星期三");
  });
});
