import { z } from "zod";
import { matterCategorySchema, partyInputSchema, procedureTypeSchema } from "@/server/matters/schemas";

export const intakeStatusSchema = z.enum([
  "INTAKE",
  "PENDING_CONFIRMATION",
  "CONVERTED",
  "DECLINED",
  "NEEDS_REVISION"
]);

export const feeTypeSchema = z.enum(["FIXED", "CONTINGENCY", "TIMED"]);

export const clientTypeSchema = z.enum(["INDIVIDUAL", "COMPANY", "ORGANIZATION"]);

export const litigationStandingSchema = z.enum([
  "PLAINTIFF",
  "JOINT_PLAINTIFF",
  "DEFENDANT",
  "JOINT_DEFENDANT",
  "THIRD_PARTY",
  "COUNTERCLAIM_PLAINTIFF",
  "COUNTERCLAIM_DEFENDANT",
  "APPELLANT",
  "APPELLEE",
  "RETRIAL_APPLICANT",
  "RETRIAL_RESPONDENT",
  "ENFORCEMENT_APPLICANT",
  "EXECUTED_PERSON",
  "CRIMINAL_DEFENDANT",
  "CRIMINAL_VICTIM",
  "PRIVATE_PROSECUTOR",
  "CRIMINAL_INCIDENTAL_PLAINTIFF",
  "ARBITRATION_CLAIMANT",
  "ARBITRATION_RESPONDENT",
  "ADMIN_PLAINTIFF",
  "ADMIN_DEFENDANT",
  "ADMIN_RECONSIDERATION_APPLICANT",
  "ADMIN_RECONSIDERATION_RESPONDENT",
  "NON_LITIGATION_PARTY"
]);

const litigationIntakeCategories = new Set([
  "CIVIL_COMMERCIAL",
  "LABOR_ARBITRATION",
  "COMMERCIAL_ARBITRATION",
  "CRIMINAL",
  "ADMINISTRATIVE"
]);

const intakeCreateBaseSchema = z.object({
  // 基础
  // 案件名称去除所有空白字符（产品要求，避免列表/详情显示空格）
  title: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\s+/g, "") : v),
    z.string().max(200).optional().or(z.literal(""))
  ),
  category: matterCategorySchema,
  causeId: z.string().cuid().optional().or(z.literal("")),
  causeFreeText: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  receivedAt: z.coerce.date().optional(),

  // 程序 + 诉讼地位 + 机构 + 标的
  firstProcedureType: procedureTypeSchema.optional(),
  firstAgency: z.string().max(120).optional().or(z.literal("")),
  jurisdiction: z.string().max(120).optional().or(z.literal("")),
  ourStanding: litigationStandingSchema.optional(),
  claimAmount: z.coerce.number().nonnegative().optional(),
  claimDescription: z.string().max(500).optional().or(z.literal("")),

  // v0.30: 律协备案 + 是否反诉
  barFiling: z.enum(["NONE", "COLLECTIVE", "SENSITIVE", "MAJOR", "OTHER"]).optional(),
  counterclaim: z.boolean().default(false),

  // v0.31: 非诉 / 顾问 / 专项 专属
  businessType: z.string().max(60).optional().or(z.literal("")),
  serviceScope: z.string().max(1000).optional().or(z.literal("")),
  deliverables: z.string().max(500).optional().or(z.literal("")),
  counselType: z.string().max(40).optional().or(z.literal("")),
  serviceStart: z.coerce.date().optional(),
  serviceEnd: z.coerce.date().optional(),

  // 委托方 + 联系人
  clientId: z.string().cuid().optional().or(z.literal("")),
  clientName: z.string().max(120).optional().or(z.literal("")),
  clientType: clientTypeSchema.optional(),
  contactName: z.string().max(40).optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional().or(z.literal("")),

  // 企业自动填充（元典查询结果，透传到 Client 创建）
  clientIdNumber: z.string().max(50).optional().or(z.literal("")),
  clientAddress: z.string().max(200).optional().or(z.literal("")),
  clientLegalRep: z.string().max(40).optional().or(z.literal("")),

  // 律师费
  feeType: feeTypeSchema.optional(),
  feeAmount: z.coerce.number().nonnegative().optional(), // FIXED: 总金额；CONTINGENCY: 基础办案费
  contingencyTerms: z.string().max(1000).optional().or(z.literal("")), // CONTINGENCY 收费方式
  feeSchedule: z.string().max(500).optional().or(z.literal("")),
  feeNote: z.string().max(500).optional().or(z.literal("")),

  // 团队
  ownerUserId: z.string().cuid().optional().or(z.literal("")),
  coUserIds: z.array(z.string().cuid()).default([]),

  // 对方 / 第三人（其中可能有 standing）
  parties: z.array(partyInputSchema).default([])
});

function requireLitigationStandings(
  data: z.infer<typeof intakeCreateBaseSchema>,
  ctx: z.RefinementCtx
) {
  if (!litigationIntakeCategories.has(data.category)) return;

  if (!data.ourStanding) {
    ctx.addIssue({
      path: ["ourStanding"],
      code: z.ZodIssueCode.custom,
      message: "请选择委托方诉讼地位"
    });
  }

  data.parties.forEach((party, index) => {
    if (!party.standing) {
      ctx.addIssue({
        path: ["parties", index, "standing"],
        code: z.ZodIssueCode.custom,
        message: "请选择诉讼地位"
      });
    }
  });
}

export const intakeCreateSchema = intakeCreateBaseSchema.superRefine(requireLitigationStandings);

export const intakeUpdateSchema = intakeCreateBaseSchema.extend({
  id: z.string().cuid()
}).superRefine(requireLitigationStandings);

export const intakeListQuerySchema = z.object({
  search: z.string().optional(),
  category: matterCategorySchema.optional(),
  status: intakeStatusSchema.optional(),
  statusIn: z.array(intakeStatusSchema).optional(),
  receivedAtFrom: z.coerce.date().optional(),
  receivedAtTo: z.coerce.date().optional(),
  sortBy: z.enum(["intakeDate", "claimAmount"]).default("intakeDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const declineIntakeSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(1, "请填写不接案原因").max(500)
});

export type IntakeCreateInput = z.infer<typeof intakeCreateSchema>;
export type IntakeListQuery = z.infer<typeof intakeListQuerySchema>;
export type DeclineIntakeInput = z.infer<typeof declineIntakeSchema>;
