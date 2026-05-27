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
import { selectReviewPrompt, reviewPromptLabel } from "@/lib/ai/review-prompts";
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

// v0.26: prompt 按 Document.category 分流（src/lib/ai/review-prompts.ts）

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

  // v0.26: 按 Document.category 选 prompt（合同/诉状/证据/裁判 4 套专项 + 通用兜底）
  const systemPrompt = selectReviewPrompt(doc.category);
  const promptLabel = reviewPromptLabel(doc.category);

  let content = "";
  try {
    const res = await aiChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `文书名称：${doc.name}\n审查类型：${promptLabel}\n\n文书正文：\n${text}${truncated ? "\n\n（注：原文较长，已截断前部分内容供审查）" : ""}`
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
