import { z } from "zod";

export const clientTypeSchema = z.enum(["INDIVIDUAL", "COMPANY", "ORGANIZATION"]);
export const cooperationStatusSchema = z.enum([
  "POTENTIAL",
  "NEGOTIATING",
  "SIGNED",
  "TERMINATED"
]);
export const clientGenderSchema = z.enum(["MALE", "FEMALE"]);

export const contactInputSchema = z.object({
  name: z.string().min(1, "联系人姓名必填").max(40),
  title: z.string().max(40).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("邮箱格式不正确").optional().or(z.literal("")),
  wechat: z.string().max(40).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(500).optional().or(z.literal(""))
});

export const clientCreateSchema = z.object({
  name: z.string().min(1, "客户名称必填").max(120),
  type: clientTypeSchema,
  idNumber: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  legalRep: z.string().max(40).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("邮箱格式不正确").optional().or(z.literal("")),
  source: z.string().max(80).optional().or(z.literal("")),
  // v0.39: 案件云式补充字段（internalCode 系统生成，不收用户输入）
  cooperationStatus: cooperationStatusSchema.default("SIGNED"),
  industry: z.string().max(60).optional().or(z.literal("")),
  gender: clientGenderSchema.optional().or(z.literal("")),
  ethnicity: z.string().max(30).optional().or(z.literal("")),
  tags: z.array(z.string().max(20)).default([]),
  notes: z.string().max(1000).optional().or(z.literal("")),
  contacts: z.array(contactInputSchema).default([])
});

export const clientUpdateSchema = clientCreateSchema.extend({
  id: z.string().cuid()
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;

export const clientListQuerySchema = z.object({
  search: z.string().optional(),
  type: clientTypeSchema.optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;
