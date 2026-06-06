import { describe, expect, it } from "vitest";
import { intakeCreateSchema } from "@/server/intakes/schemas";

const baseLitigationIntake = {
  category: "CIVIL_COMMERCIAL",
  title: "甲与乙合同纠纷",
  firstProcedureType: "FIRST_INSTANCE",
  clientName: "甲",
  clientType: "INDIVIDUAL",
  clientIdNumber: "330100199001010000",
  parties: [
    {
      role: "OPPOSING_PARTY",
      ordinal: 1,
      partyType: "NATURAL_PERSON",
      name: "乙",
      idNumber: "330100199002020000",
      enterpriseSocialCode: "",
      phone: "",
      address: "",
      legalRep: "",
      contactName: "",
      enterpriseName: "",
      notes: ""
    }
  ]
};

describe("intakeCreateSchema", () => {
  it("诉讼/仲裁类收案必须填写委托方和案件当事人的诉讼地位", () => {
    const result = intakeCreateSchema.safeParse(baseLitigationIntake);

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      expect(issues).toContainEqual({
        path: "ourStanding",
        message: "请选择委托方诉讼地位"
      });
      expect(issues).toContainEqual({
        path: "parties.0.standing",
        message: "请选择诉讼地位"
      });
    }
  });

  it("诉讼/仲裁类收案填写诉讼地位后通过", () => {
    const result = intakeCreateSchema.safeParse({
      ...baseLitigationIntake,
      ourStanding: "PLAINTIFF",
      parties: [
        {
          ...baseLitigationIntake.parties[0],
          standing: "DEFENDANT"
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("非诉/顾问/专项不强制诉讼地位", () => {
    const result = intakeCreateSchema.safeParse({
      ...baseLitigationIntake,
      category: "NON_LITIGATION",
      firstProcedureType: "NON_LITIGATION_PHASE"
    });

    expect(result.success).toBe(true);
  });
});
