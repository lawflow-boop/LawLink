import { z } from "zod";

export const matterCategorySchema = z.enum([
  "CIVIL_COMMERCIAL",
  "CRIMINAL",
  "ADMINISTRATIVE",
  "NON_LITIGATION",
  "LEGAL_COUNSEL",
  "SPECIAL_PROJECT"
]);

export const matterStatusSchema = z.enum([
  "PENDING_ACCEPTANCE",
  "IN_PROGRESS",
  "ON_HOLD",
  "CLOSED",
  "ARCHIVED"
]);

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

export const procedureTypeSchema = z.enum([
  "FIRST_INSTANCE",
  "SECOND_INSTANCE",
  "RETRIAL_REVIEW",
  "RETRIAL",
  "REMAND_FIRST",
  "REMAND_SECOND",
  "PROSECUTORIAL_SUPERVISION",
  "COMMERCIAL_ARBITRATION",
  "LABOR_ARBITRATION",
  "ARBITRATION_SET_ASIDE",
  "ARBITRATION_ENFORCEMENT_REVIEW",
  "ENFORCEMENT",
  "ENFORCEMENT_OBJECTION",
  "INVESTIGATION",
  "PROSECUTION_REVIEW",
  "DEATH_PENALTY_REVIEW",
  "CRIMINAL_ENFORCEMENT",
  "COMMUTATION_PAROLE_REVIEW",
  "ADMIN_RECONSIDERATION",
  "ADMIN_NON_LITIGATION_ENFORCEMENT",
  "NON_LITIGATION_PHASE",
  "CUSTOM"
]);

export const partyRoleSchema = z.enum([
  "CLIENT_PARTY",
  "OPPOSING_PARTY",
  "THIRD_PARTY",
  "CO_LITIGANT",
  "AGENT",
  "WITNESS",
  "OTHER"
]);

export const partyInputSchema = z.object({
  role: partyRoleSchema,
  // v0.5: 具体诉讼地位（按首程序联动）
  standing: litigationStandingSchema.optional(),
  ordinal: z.number().int().min(1).default(1),
  name: z.string().min(1, "当事人姓名/名称必填").max(120),
  idNumber: z.string().max(50).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  legalRep: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal(""))
});

export const matterCreateSchema = z.object({
  title: z.string().min(1, "案件名称必填").max(200),
  category: matterCategorySchema,

  // 案由
  causeId: z.string().cuid().optional().or(z.literal("")),
  causeFreeText: z.string().max(200).optional().or(z.literal("")),

  claimAmount: z.coerce.number().nonnegative().optional(),

  ourStanding: litigationStandingSchema.optional(),
  counterclaimAsPlaintiff: z.boolean().default(false),
  counterclaimAsDefendant: z.boolean().default(false),

  intakeDate: z.coerce.date().optional(),

  // 客户：至少一个，第一个默认 primary
  clientIds: z.array(z.string().cuid()).min(1, "至少选择一个委托方"),

  // 当事人列表（委托方、对方、第三人）
  parties: z.array(partyInputSchema).default([]),

  // 首程序
  firstProcedure: z.object({
    type: procedureTypeSchema,
    customLabel: z.string().max(40).optional().or(z.literal("")),
    caseNumber: z.string().max(80).optional().or(z.literal("")),
    handlingAgency: z.string().max(120).optional().or(z.literal("")),
    acceptedAt: z.coerce.date().optional()
  })
});

export type MatterCreateInput = z.infer<typeof matterCreateSchema>;
export type PartyInput = z.infer<typeof partyInputSchema>;

export const matterListQuerySchema = z.object({
  search: z.string().optional(),
  category: matterCategorySchema.optional(),
  status: matterStatusSchema.optional(),
  statusIn: z.array(matterStatusSchema).optional(),
  statusNotIn: z.array(matterStatusSchema).optional(),
  ownerId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  intakeDateFrom: z.coerce.date().optional(),
  intakeDateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export type MatterListQuery = z.infer<typeof matterListQuerySchema>;
