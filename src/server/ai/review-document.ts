"use server";

/**
 * v0.19: 文书智能审查
 *
 * 从存储读文档 → 抽文本（PDF/DOCX/纯文本）→ 喂 AI → 结构化审查清单。
 * 目前覆盖通用文书（合同、起诉状、申请书、协议、书证等），不分文书类型走同一 prompt。
 */
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { assertCanAccessMatter } from "@/lib/permissions";
import { storage } from "@/lib/storage";
import { decryptBuffer } from "@/lib/storage/crypto";
import { aiChat, AiNotConfiguredError } from "@/lib/ai/client";
import {
  parseReviewItems,
  type ReviewItem,
  type ReviewType,
  type ReviewSeverity
} from "@/lib/ai/review-parser";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export type { ReviewItem, ReviewType, ReviewSeverity };

export type ReviewResult = {
  documentName: string;
  textPreviewChars: number;
  truncated: boolean;
  items: ReviewItem[];
  /** v0.21: 落库后的 ReviewRecord.id；doc 不属于 Matter（如 intake 阶段）则为 null */
  recordId: string | null;
};

const SYSTEM_PROMPT = `你是中国资深执业律师，正在审查一份法律文书（可能是合同、起诉状、申请书、协议、内部备忘、客户提供的书证等）。
请基于文书全文内容，挑出**律师应当关注的问题**，每条按下方分类：

- MISSING（缺失要素）：典型条款 / 必备字段 / 关键事实没有写入（如合同未约定违约责任、起诉状无明确诉讼请求）
- RISK（法律风险）：内容存在违反法律强制性规定 / 显失公平 / 对己方不利的安排
- ISSUE（条款问题）：表述不规范 / 概念混淆 / 逻辑矛盾 / 数字或日期错误
- SUGGESTION（优化建议）：可改进但非必须，仅作律师工作提示

严格按下方 JSON 数组返回（仅 JSON，不要任何解释）：
[
  {"type": "MISSING" | "RISK" | "ISSUE" | "SUGGESTION", "severity": "HIGH" | "MEDIUM" | "LOW", "title": "10 字内简述", "detail": "60 字内具体说明，可引用原文片段"},
  ...
]

规则：
- 总条数控制在 4-10 条，按 severity 从高到低排
- 不要泛泛而谈，必须针对本文书的具体内容
- 找不到值得提的问题时返回空数组 []
- title 写"违约责任缺失"而不是"问题 1"`;

const MAX_CHARS_FOR_AI = 6000;

async function extractDocumentText(
  buf: Buffer,
  mimeType: string | null
): Promise<string> {
  const mt = (mimeType ?? "").toLowerCase();
  if (mt === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (
    mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mt === "application/docx"
  ) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (mt === "application/msword") {
    throw new Error("不支持老 .doc 格式，请另存为 .docx 后重新上传");
  }
  if (mt.startsWith("text/")) {
    return buf.toString("utf8");
  }
  throw new Error(
    `不支持的文档类型 (${mimeType ?? "未知"})，目前仅支持 PDF / DOCX / 纯文本`
  );
}

export async function reviewDocument(input: {
  documentId: string;
}): Promise<ReviewResult> {
  const session = await requireSession();

  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, deletedAt: null }
  });
  if (!doc) throw new Error("材料不存在");

  if (doc.matterId) {
    await assertCanAccessMatter(session.user.id, session.user.role, doc.matterId);
  }

  // 读取 + 解密
  const stored = await storage.readFile(doc.path);
  let buf: Buffer;
  if (doc.encrypted) {
    if (!doc.iv || !doc.authTag) throw new Error("加密元数据损坏");
    buf = decryptBuffer(stored, doc.iv, doc.authTag);
  } else {
    buf = stored;
  }

  const raw = (await extractDocumentText(buf, doc.mimeType)).trim();
  if (raw.length < 20) {
    throw new Error("无可分析文本（可能是扫描件 PDF / 空文档），请用文本层 PDF 或 DOCX");
  }

  const truncated = raw.length > MAX_CHARS_FOR_AI;
  const text = truncated ? raw.slice(0, MAX_CHARS_FOR_AI) : raw;

  let content = "";
  try {
    const res = await aiChat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `文书名称：${doc.name}\n\n文书正文：\n${text}${truncated ? "\n\n（注：原文较长，已截断前部分内容供审查）" : ""}`
        }
      ],
      maxTokens: 2000,
      temperature: 0.2,
      timeoutMs: 45_000
    });
    content = res.content;
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw err;
    throw new Error(err instanceof Error ? err.message : "AI 审查请求失败");
  }

  const items = parseReviewItems(content);

  // v0.21: 写入历史（仅当 doc 属于某个 Matter 才能记录）
  let recordId: string | null = null;
  if (doc.matterId) {
    const rec = await prisma.reviewRecord.create({
      data: {
        matterId: doc.matterId,
        documentId: doc.id,
        reviewedById: session.user.id,
        itemCount: items.length,
        itemsJson: items as unknown as object,
        textPreviewChars: text.length,
        truncated
      },
      select: { id: true }
    });
    recordId = rec.id;
  }

  return {
    documentName: doc.name,
    textPreviewChars: text.length,
    truncated,
    items,
    recordId
  };
}
