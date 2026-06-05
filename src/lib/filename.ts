export function normalizeUploadedFilename(name: string) {
  if (!name) return name;
  if (!/[ÃÂÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßà-ÿ�]/.test(name)) return name;

  try {
    const bytes = Uint8Array.from(Array.from(name, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return scoreFilename(decoded) > scoreFilename(name) ? decoded : name;
  } catch {
    return name;
  }
}

function scoreFilename(name: string) {
  const cjk = (name.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const mojibake = (name.match(/[ÃÂÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßà-ÿ�]/g) ?? []).length;
  return cjk * 3 - mojibake;
}
