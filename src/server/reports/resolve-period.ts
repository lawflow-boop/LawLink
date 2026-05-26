/**
 * 把 search params 解析成 ReportPeriod，被 page 和 export route 共用。
 *
 * 接受参数：
 *   ?period=month|quarter|year|lastYear   预设
 *   ?period=custom&start=yyyy-MM-dd&end=yyyy-MM-dd   自定义
 *   缺省 / 非法 → year
 */
import { customPeriod, periodPresets, type ReportPeriod } from "./queries";

export type ResolvedPeriod = {
  period: ReportPeriod;
  /** 用于回写 URL */
  periodKey: "month" | "quarter" | "year" | "lastYear" | "custom";
  startStr?: string;
  endStr?: string;
  error?: string;
};

const VALID = ["month", "quarter", "year", "lastYear"] as const;

export function resolveReportPeriod(params: {
  period?: string;
  start?: string;
  end?: string;
}): ResolvedPeriod {
  const presets = periodPresets();

  if (params.period === "custom") {
    if (!params.start || !params.end) {
      return {
        period: presets.year,
        periodKey: "year",
        error: "缺少 start / end，已回退本年"
      };
    }
    try {
      return {
        period: customPeriod(params.start, params.end),
        periodKey: "custom",
        startStr: params.start,
        endStr: params.end
      };
    } catch (err) {
      return {
        period: presets.year,
        periodKey: "year",
        error: err instanceof Error ? err.message : "自定义时间错误，已回退本年"
      };
    }
  }

  if (params.period && (VALID as readonly string[]).includes(params.period)) {
    const key = params.period as (typeof VALID)[number];
    return { period: presets[key], periodKey: key };
  }

  return { period: presets.year, periodKey: "year" };
}
