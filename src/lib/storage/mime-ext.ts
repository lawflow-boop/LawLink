// MIME → 扩展名映射，用于历史数据没有扩展名时回填，避免下载件无扩展名打不开
const MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/heic": ".heic",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "text/html": ".html",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3"
};

export function ensureExt(name: string, mimeType: string | null | undefined): string {
  if (/\.[A-Za-z0-9]{1,5}$/.test(name)) return name;
  if (!mimeType) return name;
  return name + (MIME_EXT[mimeType.toLowerCase()] ?? "");
}

export function isInlinePreviewable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const m = mimeType.toLowerCase();
  return (
    m === "application/pdf" ||
    m.startsWith("image/") ||
    m === "text/plain" ||
    m === "text/markdown" ||
    m === "text/csv" ||
    m === "text/html"
  );
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";

/**
 * v0.42: 服务端可转 HTML 预览的 Office 文档类型。
 * docx → mammoth；xlsx/xls → exceljs。
 * 老 .doc(application/msword) 无法可靠转换 → 归 null（降级下载）。
 * mime 可能不准，故同时看文件名扩展。
 */
export function officePreviewKind(
  mimeType: string | null | undefined,
  name?: string | null
): "docx" | "xlsx" | null {
  const m = (mimeType ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  if (m === DOCX_MIME || n.endsWith(".docx")) return "docx";
  if (m === XLSX_MIME || m === XLS_MIME || n.endsWith(".xlsx") || n.endsWith(".xls"))
    return "xlsx";
  return null;
}

/** 能在线打开查阅（内嵌 inline 或服务端转 HTML），用于前端决定是否给"打开"入口 */
export function canPreview(
  mimeType: string | null | undefined,
  name?: string | null
): boolean {
  return isInlinePreviewable(mimeType) || officePreviewKind(mimeType, name) !== null;
}
