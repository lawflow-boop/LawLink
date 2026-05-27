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
