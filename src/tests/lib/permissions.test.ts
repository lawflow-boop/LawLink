import { describe, it, expect } from "vitest";
import { isManager, matterVisibilityFilter, intakeVisibilityFilter, clientVisibilityFilter } from "@/lib/permissions";

describe("isManager", () => {
  it("ADMIN 是 manager", () => expect(isManager("ADMIN")).toBe(true));
  it("PRINCIPAL_LAWYER 是 manager", () => expect(isManager("PRINCIPAL_LAWYER")).toBe(true));
  it("LAWYER 不是 manager", () => expect(isManager("LAWYER")).toBe(false));
  it("ASSISTANT 不是 manager", () => expect(isManager("ASSISTANT")).toBe(false));
  it("FINANCE 不是 manager", () => expect(isManager("FINANCE")).toBe(false));
});

describe("matterVisibilityFilter", () => {
  const userId = "user-1";

  it("ADMIN 看全部（返回空 where）", () => {
    expect(matterVisibilityFilter(userId, "ADMIN")).toEqual({});
  });

  it("FINANCE 看全部", () => {
    expect(matterVisibilityFilter(userId, "FINANCE")).toEqual({});
  });

  it("LAWYER 看自己拥有或参与的案件", () => {
    const filter = matterVisibilityFilter(userId, "LAWYER");
    expect(filter).toHaveProperty("OR");
    const or = (filter as { OR: unknown[] }).OR;
    expect(or).toHaveLength(2);
    expect(or[0]).toEqual({ ownerId: userId });
    expect(or[1]).toEqual({ members: { some: { userId } } });
  });

  it("ASSISTANT 只看自己参与的案件", () => {
    const filter = matterVisibilityFilter(userId, "ASSISTANT");
    expect(filter).toEqual({ members: { some: { userId } } });
  });
});

describe("intakeVisibilityFilter", () => {
  const userId = "user-1";

  it("ADMIN 看全部", () => {
    expect(intakeVisibilityFilter(userId, "ADMIN")).toEqual({});
  });

  it("LAWYER 看自己创建或参与的", () => {
    const filter = intakeVisibilityFilter(userId, "LAWYER");
    expect(filter).toHaveProperty("OR");
    const or = (filter as { OR: unknown[] }).OR;
    expect(or).toHaveLength(3);
  });
});
