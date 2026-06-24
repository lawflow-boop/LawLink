// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hearingCreateSchema } from "./schemas";

describe("hearingCreateSchema", () => {
  it("accepts past hearing time passed as an ISO string from client server action", () => {
    const parsed = hearingCreateSchema.parse({
      procedureId: "cmqq3464i000424vyfsx8um1j",
      title: "昨天开庭补录",
      startsAt: "2026-06-23T01:30:00.000Z",
      room: "第三法庭",
      address: "",
      judge: "",
      contact: "",
      notes: ""
    });

    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.startsAt.toISOString()).toBe("2026-06-23T01:30:00.000Z");
  });
});
