"use server";

/**
 * v0.44: 法院传票 OCR
 *
 * 律师上传传票图片 → aiVision 提取开庭日期、时间、法庭、案号、法官、当事人
 * 失败时返回 null 字段，让律师手动填写
 */
import { requireSession } from "@/lib/auth/session";
import { aiVision, extractJson, AiNotConfiguredError } from "@/lib/ai/client";
import { parseSummonsWithLocalOcr } from "./parse-summons-local";

export type ParsedSummons = {
  hearingDate: string | null;   // YYYY-MM-DD
  hearingTime: string | null;   // HH:mm
  courtRoom: string | null;     // 法庭（如：第三法庭）
  caseNumber: string | null;    // 案号（如：(2024)京0105民初1234号）
  judge: string | null;         // 法官姓名
  parties: string[] | null;     // 当事人列表
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

const PROMPT = `下方图片是一张中国法院传票（开庭传票）。请严格返回 JSON：
{
  "hearingDate": "开庭日期（YYYY-MM-DD）",
  "hearingTime": "开庭时间（HH:mm，24小时制）",
  "courtRoom": "开庭地点/法庭（如：本院第三法庭）",
  "caseNumber": "案号（如：(2024)京0105民初1234号）",
  "judge": "审判员/法官姓名",
  "parties": ["原告/上诉人名称", "被告/被上诉人名称"]
}
规则：
- 严格按照传票上的内容提取，不确定的字段返回 null
- hearingDate 格式必须为 YYYY-MM-DD，如原始日期为"二〇二四年六月十五日"则转为 2024-06-15
- hearingTime 格式为 HH:mm，如"上午九时三十分"转为 09:30
- parties 为数组，包含传票上列明的当事人
- 仅 JSON，不要解释`;

export async function parseSummons(form: FormData): Promise<ParsedSummons> {
  await requireSession();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("缺少文件");
  if (!SUPPORTED.has(file.type)) {
    throw new Error(`仅支持图片（JPG/PNG/WebP/HEIC）或 PDF 格式，当前 ${file.type || "未知"}`);
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB");

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;

  try {
    const { content } = await aiVision({
      image: { dataUrl },
      prompt: PROMPT,
      maxTokens: 500
    });
    const parsed = extractJson<ParsedSummons>(content);
    return {
      hearingDate: parsed?.hearingDate?.trim() || null,
      hearingTime: parsed?.hearingTime?.trim() || null,
      courtRoom: parsed?.courtRoom?.trim() || null,
      caseNumber: parsed?.caseNumber?.trim() || null,
      judge: parsed?.judge?.trim() || null,
      parties: Array.isArray(parsed?.parties) ? parsed.parties.filter(Boolean) : null
    };
  } catch (err) {
    try {
      const fallback = await parseSummonsWithLocalOcr(file);
      return {
        hearingDate: fallback.hearingDate,
        hearingTime: fallback.hearingTime,
        courtRoom: fallback.courtRoom,
        caseNumber: fallback.caseNumber,
        judge: fallback.judge,
        parties: fallback.parties
      };
    } catch (fallbackErr) {
      if (err instanceof AiNotConfiguredError) {
        throw new Error(fallbackErr instanceof Error ? `AI 未配置，本地 OCR 也失败：${fallbackErr.message}` : "AI 未配置，本地 OCR 也失败");
      }
      const primary = err instanceof Error ? err.message : "AI 识别失败";
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : "本地 OCR 失败";
      throw new Error(`${primary}；本地 OCR 也失败：${fallbackMessage}`);
    }
  }
}
