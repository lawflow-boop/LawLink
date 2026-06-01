import { z } from "zod";

const presTypes = ["PRE_LITIGATION", "LITIGATION", "ENFORCEMENT"] as const;
const propertyTypes = ["BANK_DEPOSIT", "REAL_ESTATE", "VEHICLE", "EQUITY", "IP", "OTHER"] as const;
const guaranteeTypes = ["CASH_DEPOSIT", "GUARANTEE_LETTER", "PROPERTY", "NONE"] as const;

// ── Case ──

export const caseCreateSchema = z.object({
  matterId: z.string().cuid().optional().nullable(),
  type: z.enum(presTypes),
  court: z.string().max(80).optional().or(z.literal("")),
  rulingNumber: z.string().max(80).optional().or(z.literal("")),
  guaranteeType: z.enum(guaranteeTypes).optional().nullable(),
  appliedAt: z.coerce.date().optional().nullable(),
  note: z.string().max(500).optional().or(z.literal("")),
  ownerId: z.string().cuid().optional().nullable(),
  remindDays: z.array(z.coerce.number().int().positive()).default([30, 15, 7, 3, 1]),
  // inline first target + property for convenience
  firstTarget: z.string().max(200).optional().or(z.literal("")),
  firstPropertyType: z.enum(propertyTypes).optional(),
  firstPropertyDetail: z.string().max(500).optional().or(z.literal("")),
  firstAmount: z.coerce.number().nonnegative().optional().nullable(),
  firstStartDate: z.coerce.date().optional(),
  firstDuration: z.coerce.number().int().positive().max(3650).optional(),
  firstExpiryDate: z.coerce.date().optional(),
});

export const caseUpdateSchema = z.object({
  id: z.string().cuid(),
  matterId: z.string().cuid().optional().nullable(),
  type: z.enum(presTypes).optional(),
  court: z.string().max(80).optional().or(z.literal("")),
  rulingNumber: z.string().max(80).optional().or(z.literal("")),
  guaranteeType: z.enum(guaranteeTypes).optional().nullable(),
  appliedAt: z.coerce.date().optional().nullable(),
  note: z.string().max(500).optional().or(z.literal("")),
  ownerId: z.string().cuid().optional().nullable(),
  remindDays: z.array(z.coerce.number().int().positive()).optional(),
  status: z.enum(["ACTIVE", "RENEWED", "EXPIRED", "LIFTED"]).optional(),
});

// ── Target ──

export const targetCreateSchema = z.object({
  caseId: z.string().cuid(),
  name: z.string().min(1, "被保全人名称必填").max(200),
  note: z.string().max(300).optional().or(z.literal("")),
});

export const targetUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(200).optional(),
  note: z.string().max(300).optional().or(z.literal("")),
});

// ── Property ──

export const propertyCreateSchema = z.object({
  targetId: z.string().cuid(),
  propertyType: z.enum(propertyTypes),
  propertyDetail: z.string().max(500).optional().or(z.literal("")),
  amount: z.coerce.number().nonnegative().optional().nullable(),
  startDate: z.coerce.date(),
  duration: z.coerce.number().int().positive().max(3650),
  expiryDate: z.coerce.date(),
});

export const propertyUpdateSchema = z.object({
  id: z.string().cuid(),
  propertyType: z.enum(propertyTypes).optional(),
  propertyDetail: z.string().max(500).optional().or(z.literal("")),
  amount: z.coerce.number().nonnegative().optional().nullable(),
  startDate: z.coerce.date().optional(),
  duration: z.coerce.number().int().positive().max(3650).optional(),
  expiryDate: z.coerce.date().optional(),
  status: z.enum(["ACTIVE", "RENEWED", "EXPIRED", "LIFTED"]).optional(),
});

export const propertyRenewSchema = z.object({
  propertyId: z.string().cuid(),
  newExpiryDate: z.coerce.date(),
  renewalDuration: z.coerce.number().int().positive(),
  note: z.string().max(300).optional().or(z.literal("")),
});

// ── List filter ──

export const caseListFilterSchema = z.object({
  status: z.enum(["ACTIVE", "RENEWED", "EXPIRED", "LIFTED", "ALL"]).default("ALL"),
  matterId: z.string().cuid().optional(),
  search: z.string().max(80).optional().or(z.literal(""))
});

// ── Delete ──

export const deleteSchema = z.object({ id: z.string().cuid() });

export type CaseCreateInput = z.infer<typeof caseCreateSchema>;
export type CaseUpdateInput = z.infer<typeof caseUpdateSchema>;
export type TargetCreateInput = z.infer<typeof targetCreateSchema>;
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;
export type PropertyRenewInput = z.infer<typeof propertyRenewSchema>;
