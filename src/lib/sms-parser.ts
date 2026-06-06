/**
 * v0.9 法院短信解析（TypeScript 实现，对应旧系统 server.py 的 parse_sms_regex）
 *
 * 用法：
 *   const parsed = parseSms(rawText);
 *   parsed.smsType / parsed.caseNumbers / parsed.hearingDate ...
 *
 * 此文件**纯正则 + 纯 helper**，无 node:* / server-only 依赖，client 可 import。
 * AI 增强见 `sms-parser-ai.ts`（server-only）。
 */
import type { SmsType } from "@prisma/client";

export interface SmsPlatformHint {
  keyword: string;
  label: string;
}

const COURT_PLATFORMS: SmsPlatformHint[] = [
  { keyword: "zhixun", label: "智诉服务" },
  { keyword: "hbfy", label: "湖北法院电子送达" },
  { keyword: "hbcourt", label: "湖北法院电子送达" },
  { keyword: "e-court", label: "人民法院电子送达" },
  { keyword: "court.gov.cn", label: "人民法院在线服务" },
  { keyword: "songda", label: "电子送达" },
  { keyword: "12368", label: "12368 诉讼服务" },
  { keyword: "rmfyaj", label: "人民法院案件库" }
];

export interface ParsedSms {
  smsType: SmsType;
  caseNumbers: string[];
  court: string | null;
  // 完整日期时间字符串数组（保留原文格式，UI 友好显示）
  dates: string[];
  // 推测开庭时间（取 SMS 中第一个含时分的日期，开庭通知场景才有意义）
  hearingDate: string | null;
  filingDate: string | null;
  judgmentDate: string | null;
  appealDeadline: string | null; // "15日"
  courtRoom: string | null;
  judge: string | null;
  clerk: string | null;
  phones: string[];
  amounts: string[];
  urls: string[];
  platforms: string[];
  summary: string;
  // v0.9.1 AI 增强字段（aiEnriched=true 时才填）
  aiEnriched?: boolean;
  action?: string | null;       // 律师应采取的动作
  urgency?: "HIGH" | "MEDIUM" | "LOW" | null;
}

// ━━━ 正则模式（与旧系统 SMS_PATTERNS 对齐）━━━
const PAT_CASE_NUMBER = [/[（(]\d{4}[)）][一-龥]{1,4}\d{0,4}[一-龥]{1,4}\d+号/g];

const PAT_COURT = [
  /【([一-龥]{2,12}法院)】/,
  /[一-龥]{2,6}(?:省|市|县|区|自治州|自治县)[一-龥]{0,6}(?:人民法院|高级人民法院|中级人民法院)/,
  /[一-龥]{2,8}(?:人民法院|仲裁委员会|仲裁院)/,
  /[一-龥]{2,8}法院/
];

const PAT_DATETIME = [
  /\d{4}年\d{1,2}月\d{1,2}日\s*(?:上午|下午)?\s*\d{1,2}[:：]\d{2}/g,
  /\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}时\d{0,2}分?/g,
  /\d{4}年\d{1,2}月\d{1,2}日/g,
  /\d{4}-\d{1,2}-\d{1,2}\s*\d{1,2}:\d{2}/g,
  /\d{4}\/\d{1,2}\/\d{1,2}/g
];

const PAT_URLS = [/https?:\/\/[^\s一-龥<>"'）)\]】]+/g];

const PAT_COURT_ROOM = [
  /(?:第?[一二三四五六七八九十百\d]+(?:号)?)(?:法庭|审判庭|调解室)/,
  /[一-龥]{1,6}(?:法庭|审判庭|调解室)/
];

const PAT_JUDGE = [
  /(?:承办法官|主审法官|审判长|审判员)[:：\s]*([一-龥]{2,4})/,
  /法官\s*([一-龥]{2,4})(?:[，。 ]|$)/,
  /([一-龥]{2,4})法官/
];

const PAT_CLERK = [
  /(?:书记员|法官助理|内勤)[:：\s]*([一-龥]{2,4})/,
  /([一-龥]{2,4})(?:书记员|法官助理)/
];

const PAT_PHONE = [/1[3-9]\d{9}/g, /0\d{2,3}-?\d{7,8}/g];

const PAT_FILING_DATE = [
  /立案(?:日期|时间)?[:：\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/,
  /(\d{4}年\d{1,2}月\d{1,2}日)\s*(?:立案|受理)/
];

const PAT_JUDGMENT_DATE = [
  /(?:判决|裁定|宣判)(?:日期|时间)?[:：\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/,
  /(\d{4}年\d{1,2}月\d{1,2}日)\s*(?:作出判决|判决|宣判)/
];

const PAT_APPEAL_DEADLINE = [
  /(\d{1,2})\s*(?:日|天)\s*内[^。]*?(?:上诉|提出上诉)/,
  /上诉(?:期(?:限)?)?[:：\s]*(\d{1,2})\s*(?:日|天)/
];

const PAT_AMOUNT = [/(?:人民币|金额|标的)\s*(\d[\d,]*\.?\d*)\s*元/g, /(\d[\d,]*\.?\d*)\s*元/g];

// 法院前缀噪声词（"日内向 XX 法院" 等剥离）
const PREFIX_NOISE = [
  "日内",
  "可向",
  "应向",
  "应当向",
  "可以向",
  "要向",
  "须向",
  "可",
  "应当",
  "应",
  "须",
  "向",
  "至",
  "到",
  "由",
  "赴",
  "往",
  "去",
  "的"
];

const SMS_TYPE_KEYWORDS: Array<{ type: SmsType; words: string[] }> = [
  { type: "HEARING_NOTICE", words: ["开庭", "庭审", "出庭", "到庭"] },
  { type: "SERVICE_NOTICE", words: ["送达", "领取", "签收", "文书已生成"] },
  { type: "FEE_NOTICE", words: ["缴费", "交费", "诉讼费", "缴纳"] },
  { type: "MEDIATION", words: ["调解", "协商"] },
  { type: "ENFORCEMENT", words: ["执行", "被执行", "履行", "冻结", "查封"] },
  { type: "FILING_NOTICE", words: ["立案", "受理", "案件编号"] },
  { type: "JUDGMENT_NOTICE", words: ["判决", "裁定", "裁判文书"] },
  { type: "EVIDENCE_SUBMIT", words: ["补充材料", "举证期", "证据交换", "提交材料"] }
];

// ━━━ 工具 ━━━
function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function detectPlatform(url: string): string | null {
  const low = url.toLowerCase();
  for (const p of COURT_PLATFORMS) {
    if (low.includes(p.keyword)) return p.label;
  }
  if (url.includes("智诉")) return "智诉服务";
  return null;
}

function stripPrefixNoise(name: string): string {
  let cur = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PREFIX_NOISE) {
      if (cur.startsWith(p)) {
        cur = cur.slice(p.length);
        changed = true;
        break;
      }
    }
  }
  return cur.replace(/^[\s的，。、]+|[\s的，。、]+$/g, "");
}

function classifyType(text: string): SmsType {
  for (const { type, words } of SMS_TYPE_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return type;
  }
  return "OTHER";
}

function pickHearingDate(dates: string[]): string | null {
  // 优先含时分的（开庭场景）
  const withTime = dates.find((d) => /\d{1,2}[:：时]\d{0,2}/.test(d));
  return withTime ?? null;
}

function summarize(text: string): string {
  const lines = text
    .split(/[\n。;；]/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return text.slice(0, 50);
  // 取最长且含关键字的一句作摘要
  const informative = lines.find((l) =>
    /开庭|送达|缴费|调解|执行|立案|判决|举证|裁定/.test(l)
  );
  return (informative ?? lines[0]).slice(0, 80);
}

// ━━━ 主入口 ━━━
export function parseSms(text: string): ParsedSms {
  const result: ParsedSms = {
    smsType: classifyType(text),
    caseNumbers: [],
    court: null,
    dates: [],
    hearingDate: null,
    filingDate: null,
    judgmentDate: null,
    appealDeadline: null,
    courtRoom: null,
    judge: null,
    clerk: null,
    phones: [],
    amounts: [],
    urls: [],
    platforms: [],
    summary: summarize(text)
  };

  // 案号
  for (const pat of PAT_CASE_NUMBER) {
    const ms = text.match(pat);
    if (ms) result.caseNumbers.push(...ms);
  }
  result.caseNumbers = uniq(result.caseNumbers);

  // 法院（按优先级匹配第一个有效）
  for (const pat of PAT_COURT) {
    const m = text.match(pat);
    if (m) {
      const raw = m[1] ?? m[0];
      const cleaned = stripPrefixNoise(raw);
      if (
        cleaned &&
        (cleaned.endsWith("法院") || cleaned.endsWith("仲裁院") || cleaned.endsWith("仲裁委员会"))
      ) {
        result.court = cleaned;
        break;
      }
    }
  }

  // 日期时间
  for (const pat of PAT_DATETIME) {
    const ms = text.match(pat);
    if (ms) result.dates.push(...ms);
  }
  result.dates = uniq(result.dates);
  result.hearingDate = pickHearingDate(result.dates);

  // URL + 平台
  for (const pat of PAT_URLS) {
    const ms = text.match(pat);
    if (ms) result.urls.push(...ms);
  }
  result.urls = uniq(result.urls);
  const plats = new Set<string>();
  for (const u of result.urls) {
    const p = detectPlatform(u);
    if (p) plats.add(p);
  }
  result.platforms = Array.from(plats);

  // 法庭
  for (const pat of PAT_COURT_ROOM) {
    const m = text.match(pat);
    if (m) {
      result.courtRoom = m[0];
      break;
    }
  }

  // 法官
  for (const pat of PAT_JUDGE) {
    const m = text.match(pat);
    if (m) {
      result.judge = m[1] ?? m[0];
      break;
    }
  }

  // 书记员
  for (const pat of PAT_CLERK) {
    const m = text.match(pat);
    if (m) {
      result.clerk = m[1] ?? m[0];
      break;
    }
  }

  // 电话
  for (const pat of PAT_PHONE) {
    const ms = text.match(pat);
    if (ms) result.phones.push(...ms);
  }
  result.phones = uniq(result.phones);

  // 立案日 / 判决日 / 上诉期
  for (const pat of PAT_FILING_DATE) {
    const m = text.match(pat);
    if (m) {
      result.filingDate = m[1];
      break;
    }
  }
  for (const pat of PAT_JUDGMENT_DATE) {
    const m = text.match(pat);
    if (m) {
      result.judgmentDate = m[1];
      break;
    }
  }
  for (const pat of PAT_APPEAL_DEADLINE) {
    const m = text.match(pat);
    if (m) {
      result.appealDeadline = m[1] + "日";
      break;
    }
  }

  // 金额
  for (const pat of PAT_AMOUNT) {
    const ms = text.match(pat);
    if (ms) result.amounts.push(...ms);
  }
  result.amounts = uniq(result.amounts);

  return result;
}

// ━━━ 批量解析（按空行或分隔线拆分多条）━━━
export function splitSmsBatch(text: string): string[] {
  return text
    .split(/\n\s*\n|\n-{3,}\n|\n={3,}\n/)
    .map((m) => m.trim())
    .filter(Boolean);
}

// ━━━ 尝试把短信 dates 解析为 JS Date，方便落到 Hearing/Deadline ━━━
const CN_DIGIT: Record<string, number> = {
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10
};

export function toDate(s: string): Date | null {
  // YYYY-MM-DD HH:MM
  const m = s.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?\s*(?:上午|下午)?\s*(\d{1,2})?[:：时]?(\d{0,2})?/);
  if (m) {
    const y = parseInt(m[1]);
    const mo = parseInt(m[2]) - 1;
    const d = parseInt(m[3]);
    const isPM = s.includes("下午");
    let h = m[4] ? parseInt(m[4]) : 0;
    const mi = m[5] ? parseInt(m[5]) : 0;
    if (isPM && h < 12) h += 12;
    return new Date(y, mo, d, h, mi);
  }
  return null;
}

export { CN_DIGIT };

// AI 增强（enrichWithAi）已迁移至 sms-parser-ai.ts（server-only）
// 该文件保持 client-safe（无 node:* 依赖），sms-paste-dialog 等 client
// 组件可直接 import 这里的 parseSms / splitSmsBatch / toDate。
