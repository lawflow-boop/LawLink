import { z } from "zod";
import { matterCategorySchema, partyInputSchema, procedureTypeSchema } from "@/server/matters/schemas";

export const intakeStatusSchema = z.enum([
  "INTAKE",
  "PENDING_CONFIRMATION",
  "CONVERTED",
  "DECLINED",
  "NEEDS_REVISION"
]);

export const feeTypeSchema = z.enum(["FIXED", "CONTINGENCY"]);

export const clientTypeSchema = z.enum(["INDIVIDUAL", "COMPANY", "ORGANIZATION"]);

export const litigationStandingSchema = z.enum([
  "PLAINTIFF",
  "DEFENDANT",
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

export const intakeCreateSchema = z.object({
  // 基础
  title: z.string().max(200).optional().or(z.literal("")),
  category: matterCategorySchema,
  causeId: z.string().cuid().optional().or(z.literal("")),
  causeFreeText: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  receivedAt: z.coerce.date().optional(),

  // 程序 + 诉讼地位 + 机构 + 标的
  firstProcedureType: procedureTypeSchema.optional(),
  firstAgency: z.string().max(120).optional().or(z.literal("")),
  ourStanding: litigationStandingSchema.optional(),
  claimAmount: z.coerce.number().nonnegative().optional(),
  claimDescription: z.string().max(500).optional().or(z.literal("")),

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

export const intakeUpdateSchema = intakeCreateSchema.extend({
  id: z.string().cuid()
});

export const intakeListQuerySchema = z.object({
  search: z.string().optional(),
  status: intakeStatusSchema.optional(),
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
