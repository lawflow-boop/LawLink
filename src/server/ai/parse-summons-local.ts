/**
 * Local summons OCR fallback.
 *
 * Uses the host tesseract binary when LawLink AI settings are not configured or
 * the configured vision model fails. This keeps summons upload usable on the
 * local macOS deployment without changing provider credentials.
 */
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { ParsedSummons } from "./parse-summons";

const execFileAsync = promisify(execFile);
const TESSERACT_BIN = existsSync("/opt/homebrew/bin/tesseract") ? "/opt/homebrew/bin/tesseract" : "tesseract";
const PDFTOPPM_BIN = existsSync("/opt/homebrew/bin/pdftoppm") ? "/opt/homebrew/bin/pdftoppm" : "pdftoppm";

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf"
};

export async function parseSummonsWithLocalOcr(file: File): Promise<ParsedSummons & { rawText?: string }> {
  const original = Buffer.from(await file.arrayBuffer());
  const isPdf = isPdfBuffer(original);
  const ext = isPdf ? ".pdf" : IMAGE_EXT_BY_TYPE[file.type];
  if (!ext) throw new Error("本地 OCR 仅支持 JPG/PNG/WebP/HEIC/PDF 文件");

  const dir = await mkdtemp(join(tmpdir(), "lawlink-summons-ocr-"));
  const inputPath = join(dir, `summons${ext}`);
  try {
    await writeFile(inputPath, original);
    const ocrInputPath = isPdf ? await renderPdfFirstPage(inputPath, dir) : inputPath;
    const { stdout } = await execFileAsync(
      TESSERACT_BIN,
      [basename(ocrInputPath), "stdout", "-l", "chi_sim+eng", "--psm", "6"],
      { cwd: dirname(ocrInputPath), timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
    );
    return { ...parseSummonsText(stdout), rawText: stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function renderPdfFirstPage(inputPath: string, dir: string): Promise<string> {
  const prefix = join(dir, "summons-page");
  await execFileAsync(
    PDFTOPPM_BIN,
    ["-f", "1", "-l", "1", "-r", "220", "-png", inputPath, prefix],
    { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
  );
  return `${prefix}-1.png`;
}

export function parseSummonsText(text: string): ParsedSummons {
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/[　 ]+/g, " ")
    .replace(/[：︰]/g, ":")
    .trim();

  return {
    hearingDate: parseChineseDate(normalized),
    hearingTime: parseChineseTime(normalized),
    courtRoom: pickCourtRoom(normalized),
    caseNumber: pickCaseNumber(normalized),
    judge: pickJudge(normalized),
    parties: pickParties(normalized)
  };
}

function parseChineseDate(text: string): string | null {
  const arabic = text.match(/(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})日?/);
  if (arabic) return ymd(arabic[1], arabic[2], arabic[3]);

  const loose = text.match(/(20\d{2})\D{1,4}(\d{1,2})\D{1,4}(\d{1,2})(?=\D)/);
  if (loose) return ymd(loose[1], loose[2], loose[3]);

  const chinese = text.match(/([二〇零○ＯO0一两三四五六七八九十]{4})年([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})日/);
  if (!chinese) return null;
  const year = chinese[1]
    .replace(/[〇○ＯO]/g, "0")
    .replace(/零/g, "0")
    .replace(/一/g, "1")
    .replace(/二/g, "2")
    .replace(/三/g, "3")
    .replace(/四/g, "4")
    .replace(/五/g, "5")
    .replace(/六/g, "6")
    .replace(/七/g, "7")
    .replace(/八/g, "8")
    .replace(/九/g, "9");
  return ymd(year, String(cnNumber(chinese[2])), String(cnNumber(chinese[3])));
}

function parseChineseTime(text: string): string | null {
  const hm = text.match(/(\d{1,2})[:：时点](\d{1,2})分?/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2].padStart(2, "0")}`;

  const m = text.match(/(上午|下午|晚上|午后)?\s*([一二两三四五六七八九十]{1,3})[时点](?:([一二三四五六七八九十]{1,3})分?)?/);
  if (!m) return null;
  let hour = cnNumber(m[2]);
  const minute = m[3] ? cnNumber(m[3]) : 0;
  if ((m[1] === "下午" || m[1] === "晚上" || m[1] === "午后") && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function pickCourtRoom(text: string): string | null {
  const patterns = [
    /(?:在|于|到)([^\n，,。；;]{2,40}(?:法庭|审判庭|仲裁庭|调解室|会议室))/,
    /(?:地点|开庭地点|庭审地点)[:\s]*([^\n，,。；;]{2,60})/,
    /([^\n，,。；;]{0,20}(?:第[一二三四五六七八九十\d]+)?法庭)/
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
}

function pickCaseNumber(text: string): string | null {
  const m = text.match(/[（(]\s*20\d{2}\s*[）)][^\n，,。；;]{2,40}?号/);
  return m ? clean(m[0]) : null;
}

function pickJudge(text: string): string | null {
  const m = text.match(/(?:审判员|承办法官|法官|仲裁员)[:\s]*([\u4e00-\u9fa5·]{2,6})/);
  return m?.[1] ? clean(m[1]) : null;
}

function pickParties(text: string): string[] | null {
  const parties: string[] = [];
  const patterns = [/(?:原告|申请人|上诉人)[:\s]*([^\n，,。；;]{2,40})/g, /(?:被告|被申请人|被上诉人)[:\s]*([^\n，,。；;]{2,40})/g];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const value = clean(m[1]);
      if (value && !parties.includes(value)) parties.push(value);
    }
  }
  return parties.length ? parties : null;
}

function ymd(y: string, m: string, d: string): string | null {
  const yyyy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function cnNumber(input: string): number {
  const s = input.replace(/两/g, "二");
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (digits[s[1]] ?? 0);
  if (s.includes("十")) {
    const [tens, ones] = s.split("十");
    return (digits[tens] ?? 1) * 10 + (digits[ones] ?? 0);
  }
  return digits[s] ?? Number(s) ?? 0;
}

function clean(value: string): string {
  return value.replace(/[\s　]+/g, " ").replace(/[。；;，,]+$/g, "").trim();
}
