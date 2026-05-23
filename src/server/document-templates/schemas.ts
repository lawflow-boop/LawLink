import { z } from "zod";

export const templateListFilterSchema = z.object({
  category: z
    .enum([
      "INTAKE",
      "RETAINER",
      "LITIGATION",
      "HEARING",
      "WORK_PRODUCT",
      "ARCHIVE",
      "CLOSING",
      "BLANK"
    ])
    .optional(),
  matterCategory: z
    .enum([
      "CIVIL_COMMERCIAL",
      "CRIMINAL",
      "ADMINISTRATIVE",
      "NON_LITIGATION",
      "LEGAL_COUNSEL",
      "SPECIAL_PROJECT"
    ])
    .optional(),
  onlyEnabled: z.boolean().default(true)
});

export const templateToggleSchema = z.object({
  id: z.string().cuid(),
  enabled: z.boolean()
});

/**
 * 渲染模板生成文书并归档（段 3 模板引擎实现）。
 * - matterId: 目标案件
 * - templateId: 选定模板
 * - folderId: 目标卷宗（可空 = 散件）
 * - overrides: 行内补全的变量（路径化键值，如 {"client.idNumber": "320..."})；行内补全会回写源表
 */
export const templateRenderSchema = z.object({
  matterId: z.string().cuid(),
  templateId: z.string().cuid(),
  folderId: z.string().cuid().nullable(),
  overrides: z.record(z.string()).default({})
});
