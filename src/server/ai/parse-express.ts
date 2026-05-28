"use server";

/**
 * v0.27: 快递单号 OCR
 *
 * 律师上传快递单照片 → aiVision 提取快递单号 + 公司名（如能识别）
 * 失败时返回空，让律师手动输入
 */
import { requireSession } from "@/lib/auth/session";
import { aiVision, extractJson, AiNotConfiguredError } from "@/lib/ai/client";

export type ParsedExpressLabel = {
  trackingNo: string | null;
  companyCode: string | null; // 中文公司名（顺丰速运 / 中通快递 等）
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

const PROMPT = `下方图片是一张快递面单 / 快递单照片。请严格返回 JSON：
{"trackingNo": "单号", "companyCode": "中文快递公司名（如：顺丰速运 / 中通快递 / 京东快递）"}
规则：
- trackingNo 是面单上最显眼的运单号，10-30 位字母数字组合
- 找不到任何一项返回 null，不要编造
- 仅 JSON，不要解释`;

export async function parseExpressLabel(form: FormData): Promise<ParsedExpressLabel> {
  await requireSession();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("缺少文件");
  if (!SUPPORTED.has(file.type)) {
    throw new Error(`仅支持图片格式（JPG/PNG/WebP），当前 ${file.type || "未知"}`);
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB");

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;

  try {
    const { content } = await aiVision({
      image: { dataUrl },
      prompt: PROMPT,
      maxTokens: 300
    });
    const parsed = extractJson<ParsedExpressLabel>(content);
    return {
      trackingNo: parsed?.trackingNo?.trim() || null,
      companyCode: parsed?.companyCode?.trim() || null
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw err;
    throw new Error(err instanceof Error ? err.message : "快递单识别失败");
  }
}
