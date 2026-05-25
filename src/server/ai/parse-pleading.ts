"use server";

/**
 * v0.11: 起诉状 / 申请书 OCR 骨架
 *
 * 仅支持图片格式（jpg/png/webp）。PDF 暂未支持（需要服务端 pdf→image 转换）。
 * 我方为被告 / 被申请人 / 第三人时使用，自动抽取对方信息回填收案表单。
 */
import { requireSession } from "@/lib/auth/session";
import { aiVision, extractJson, AiNotConfiguredError } from "@/lib/ai/client";

export type PleadingPartyHint = {
  name: string;
  idNumber?: string;
  address?: string;
  legalRep?: string;
  phone?: string;
};

export type ParsedPleading = {
  plaintiffs: PleadingPartyHint[]; // 起诉方/申请方
  thirdParties: PleadingPartyHint[]; // 第三人
  cause?: string;
  claimAmount?: number;
  claimDescription?: string;
  court?: string;
};

const SUPPORTED_MIME = ["image/jpeg", "image/png", "image/webp"];

const SYSTEM_PROMPT = `你是法律文书解析助手。下方图片是一份起诉状 / 申请书 / 仲裁申请书。
请严格按以下 JSON 模式返回（仅 JSON，不要任何解释）：
{
  "plaintiffs": [{"name": "全名", "idNumber": "身份证或统一社会信用代码（可选）", "address": "可选", "legalRep": "法定代表人（公司适用，可选）", "phone": "可选"}],
  "thirdParties": [{"name": "全名", "idNumber": "可选", "address": "可选"}],
  "cause": "案由（如：买卖合同纠纷）",
  "claimAmount": 数字（元，仅金钱标的；非金钱填 null）,
  "claimDescription": "诉讼请求/申请事项要点",
  "court": "管辖法院/仲裁机构全称"
}
规则：
- 找不到的字段返回空数组 [] 或 null，不要编造
- 起诉方包含原告 / 申请人 / 申请执行人 / 上诉人，统一放 plaintiffs
- 不要返回被告 / 被申请人 / 被上诉人（那是用户自己）
- 金额单位统一为人民币元`;

export async function parsePleading(form: FormData): Promise<ParsedPleading> {
  await requireSession();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("缺少文件");
  if (!SUPPORTED_MIME.includes(file.type)) {
    throw new Error(`仅支持 JPG / PNG / WebP 图片，当前 ${file.type || "未知"}（PDF 暂未支持）`);
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB");

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;

  let result: ParsedPleading;
  try {
    const { content } = await aiVision({
      image: { dataUrl },
      prompt: SYSTEM_PROMPT,
      maxTokens: 1500
    });
    const parsed = extractJson<ParsedPleading>(content);
    if (!parsed) throw new Error("AI 返回结果无法解析为 JSON");
    result = {
      plaintiffs: Array.isArray(parsed.plaintiffs) ? parsed.plaintiffs : [],
      thirdParties: Array.isArray(parsed.thirdParties) ? parsed.thirdParties : [],
      cause: parsed.cause ?? undefined,
      claimAmount: typeof parsed.claimAmount === "number" ? parsed.claimAmount : undefined,
      claimDescription: parsed.claimDescription ?? undefined,
      court: parsed.court ?? undefined
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw err;
    throw new Error(err instanceof Error ? err.message : "OCR 识别失败");
  }

  return result;
}
