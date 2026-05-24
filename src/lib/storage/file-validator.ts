/**
 * 上传文件类型校验
 *
 * 三道闸：
 *   1. 文件名扩展名必须在白名单内（不区分大小写）
 *   2. MIME 不为空时也要在白名单内（浏览器可伪造但作为辅助）
 *   3. 文件大小 ≤ maxBytes
 *
 * 故意不读 magic bytes：sniffing 增加复杂度但绕过门槛只是稍微提高，
 * 投入产出比不高。本系统假设是律所内部使用，主要防止意外（误传 .exe）
 * 而非对抗主动攻击。
 */

export type UploadPurpose = "document" | "invoice" | "seal" | "stamp";

const DOC_EXT = [
  "pdf",
  "doc", "docx",
  "xls", "xlsx",
  "ppt", "pptx",
  "txt",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff",
  "zip", "rar", "7z",
  "mp3", "wav", "m4a",
  "mp4", "mov", "avi"
];

// 发票 / 用章场景更窄：仅图片或 PDF
const NARROW_EXT = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff"];

const ALLOWED: Record<UploadPurpose, Set<string>> = {
  document: new Set(DOC_EXT),
  invoice: new Set(NARROW_EXT),
  seal: new Set(DOC_EXT), // 待盖章稿允许 docx/pdf
  stamp: new Set(NARROW_EXT) // 盖章后扫描件只允许图片 / PDF
};

const MIME_PREFIX_OK: Record<UploadPurpose, RegExp> = {
  document: /^(application|image|audio|video|text)\//,
  invoice: /^(image\/|application\/pdf)/,
  seal: /^(application|image)\//,
  stamp: /^(image\/|application\/pdf)/
};

function getExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export interface FileValidationOptions {
  purpose: UploadPurpose;
  maxBytes: number;
}

/**
 * 抛中文异常（前端 toast 直接显示）；通过返回归一化的 ext 给上层用作存储路径或日志。
 */
export function validateUploadedFile(
  file: File,
  opts: FileValidationOptions
): { ext: string } {
  if (file.size === 0) throw new Error("文件为空");
  if (file.size > opts.maxBytes) {
    throw new Error(
      `文件超过 ${Math.round(opts.maxBytes / 1024 / 1024)}MB 限制`
    );
  }
  const ext = getExt(file.name);
  if (!ext) throw new Error(`文件名缺少扩展名：${file.name}`);
  if (!ALLOWED[opts.purpose].has(ext)) {
    throw new Error(
      `不允许的文件类型：.${ext}（${opts.purpose}）`
    );
  }
  if (file.type && !MIME_PREFIX_OK[opts.purpose].test(file.type)) {
    throw new Error(
      `MIME 类型与扩展名不一致或不在白名单：${file.type}`
    );
  }
  return { ext };
}
