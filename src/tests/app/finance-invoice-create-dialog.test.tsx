import { describe, expect, it } from "vitest";
import {
  invoiceMatterSearchLimit,
  invoiceMatterSearchWhere
} from "@/server/finance/invoice-matter-search";

describe("invoice matter search", () => {
  it("空关键词返回本人可关联案件条件", () => {
    expect(invoiceMatterSearchWhere("u1", "")).toEqual({
      deletedAt: null,
      OR: [
        { ownerId: "u1" },
        { members: { some: { userId: "u1" } } }
      ]
    });
    expect(invoiceMatterSearchLimit("")).toBe(12);
  });

  it("输入关键词后按案名、系统编号和所内案号筛选", () => {
    expect(invoiceMatterSearchWhere("u1", " 二审 ")).toEqual({
      deletedAt: null,
      AND: [
        {
          OR: [
            { ownerId: "u1" },
            { members: { some: { userId: "u1" } } }
          ]
        },
        {
          OR: [
            { title: { contains: "二审", mode: "insensitive" } },
            { internalCode: { contains: "二审", mode: "insensitive" } },
            { firmCaseNo: { contains: "二审", mode: "insensitive" } }
          ]
        }
      ]
    });
    expect(invoiceMatterSearchLimit(" 二审 ")).toBe(10);
  });
});
