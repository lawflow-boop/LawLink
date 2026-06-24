// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSummonsText } from "./parse-summons-local";

describe("parseSummonsText", () => {
  it("extracts core hearing fields from Chinese summons OCR text", () => {
    const parsed = parseSummonsText(`
      河南省郑州市中原区人民法院传票
      案号：（2026）豫0102民初1234号
      申请人：张三
      被申请人：示例建设有限公司
      定于二〇二六年六月二十三日上午九时三十分在本院第三法庭开庭。
      审判员：王法官
    `);

    expect(parsed.hearingDate).toBe("2026-06-23");
    expect(parsed.hearingTime).toBe("09:30");
    expect(parsed.courtRoom).toContain("第三法庭");
    expect(parsed.caseNumber).toBe("（2026）豫0102民初1234号");
    expect(parsed.judge).toBe("王法官");
    expect(parsed.parties).toContain("张三");
  });
});
