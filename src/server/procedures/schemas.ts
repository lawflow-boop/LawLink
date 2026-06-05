import { z } from "zod";
import { procedureTypeSchema } from "@/server/matters/schemas";

export const procedureEngagementSchema = z.enum(["ENGAGED", "INFORMATIONAL"]);

export const procedureStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "CONCLUDED"]);

export const procedureOutcomeSchema = z.enum([
  "WON",
  "PARTIAL_WON",
  "LOST",
  "MEDIATED",
  "WITHDRAWN",
  "DISMISSED",
  "COMPLETED",
  "TRANSFERRED",
  "OTHER"
]);

export const procedureCreateSchema = z.object({
  matterId: z.string().cuid(),
  type: procedureTypeSchema,
  customLabel: z.string().max(40).optional().or(z.literal("")),
  engagement: procedureEngagementSchema.default("ENGAGED"),
  caseNumber: z.string().max(80).optional().or(z.literal("")),
  jurisdiction: z.string().max(120).optional().or(z.literal("")),
  handlingAgency: z.string().max(120).optional().or(z.literal("")),
  panel: z.string().max(80).optional().or(z.literal("")),
  handler: z.string().max(40).optional().or(z.literal("")),
  acceptedAt: z.string().optional().nullable().transform(v => (!v ? undefined : new Date(v))),
  // v0.44: 主办律师
  leadLawyerId: z.string().cuid().optional().nullable(),
  isExternalLead: z.boolean().default(false)
});

export const procedureUpdateSchema = z.object({
  id: z.string().cuid(),
  type: procedureTypeSchema.optional(),
  customLabel: z.string().max(40).optional().or(z.literal("")),
  caseNumber: z.string().max(80).optional().or(z.literal("")),
  jurisdiction: z.string().max(120).optional().or(z.literal("")),
  handlingAgency: z.string().max(120).optional().or(z.literal("")),
  panel: z.string().max(80).optional().or(z.literal("")),
  handler: z.string().max(40).optional().or(z.literal("")),
  acceptedAt: z.string().optional().nullable().transform(v => (!v ? undefined : new Date(v))),
  concludedAt: z.coerce.date().optional(),
  status: procedureStatusSchema.optional(),
  outcome: procedureOutcomeSchema.optional(),
  outcomeNote: z.string().max(500).optional().or(z.literal(""))
});

export const deadlineCategorySchema = z.enum([
  "LIMITATION",
  "EVIDENCE",
  "APPEAL",
  "PERFORMANCE",
  "RESPONSE",
  "ENFORCEMENT",
  "ARBITRATION_SET_ASIDE",
  "PRESERVATION",
  "CUSTOM"
]);

export const deadlineCreateSchema = z.object({
  procedureId: z.string().cuid(),
  title: z.string().min(1, "期限名称必填").max(100),
  category: deadlineCategorySchema.default("CUSTOM"),
  dueAt: z.coerce.date(),
  basis: z.string().max(200).optional().or(z.literal("")),
  remindDays: z.coerce.number().int().min(0).max(60).default(3)
});

export const hearingCreateSchema = z.object({
  procedureId: z.string().cuid(),
  title: z.string().min(1, "开庭主题必填").max(80),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  room: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  judge: z.string().max(40).optional().or(z.literal("")),
  contact: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal(""))
});

export type ProcedureCreateInput = z.infer<typeof procedureCreateSchema>;
export type ProcedureUpdateInput = z.infer<typeof procedureUpdateSchema>;
export type DeadlineCreateInput = z.infer<typeof deadlineCreateSchema>;
export type HearingCreateInput = z.infer<typeof hearingCreateSchema>;
