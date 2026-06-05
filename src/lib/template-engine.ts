/**
 * v0.8 文档模板引擎
 *
 * 流程：
 *   1. buildContext(matterId, userId, overrides?) 从 DB 拼装变量上下文
 *   2. renderDocxBuffer(templateBuffer, context) 用 docxtemplater 渲染
 *   3. 渲染前 detectMissing(variables, context) 找出未填写的变量，由 UI 弹窗补全
 *
 * 模板变量使用双大括号语法：{{firm.name}} / {{client.idNumber}}。
 */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { prisma } from "./prisma";

const FIRM_NAME_KEY = "firmName";
const FIRM_ADDRESS_KEY = "firmAddress";
const FIRM_PHONE_KEY = "firmPhone";

export interface PartySnapshot {
  name: string;
  idNumber: string;
  phone: string;
  address: string;
  legalRep: string;
}

export interface RenderContext {
  firm: { name: string; address: string; phone: string };
  today: string; // YYYY-MM-DD
  todayCN: string; // 二〇二六年五月二十三日
  lawyer: { name: string; phone: string };
  matter: {
    code: string;
    title: string;
    category: string;
    causeText: string;
    intakeDate: string;
    claimAmount: string; // 中文金额 / "—"
    ourStanding: string;
  };
  client: PartySnapshot;
  opposing: PartySnapshot; // 第一个对方
  third: PartySnapshot; // 第一个第三人
  proceeding: { type: string; caseNo: string; court: string };
  // 数组循环用
  plaintiffs: PartySnapshot[];
  defendants: PartySnapshot[];
  thirds: PartySnapshot[];
  [extra: string]: unknown;
}

const EMPTY_PARTY: PartySnapshot = {
  name: "",
  idNumber: "",
  phone: "",
  address: "",
  legalRep: ""
};

const STANDING_CN: Record<string, string> = {
  PLAINTIFF: "原告",
  JOINT_PLAINTIFF: "共同原告",
  DEFENDANT: "被告",
  JOINT_DEFENDANT: "共同被告",
  THIRD_PARTY: "第三人",
  APPELLANT: "上诉人",
  APPELLEE: "被上诉人",
  RETRIAL_APPLICANT: "再审申请人",
  RETRIAL_RESPONDENT: "再审被申请人",
  ENFORCEMENT_APPLICANT: "申请执行人",
  EXECUTED_PERSON: "被执行人",
  COUNTERCLAIM_PLAINTIFF: "反诉原告",
  COUNTERCLAIM_DEFENDANT: "反诉被告",
  CRIMINAL_DEFENDANT: "被告人",
  CRIMINAL_VICTIM: "被害人",
  PRIVATE_PROSECUTOR: "自诉人",
  CRIMINAL_INCIDENTAL_PLAINTIFF: "附带民事诉讼原告人",
  ARBITRATION_CLAIMANT: "仲裁申请人",
  ARBITRATION_RESPONDENT: "仲裁被申请人",
  ADMIN_PLAINTIFF: "行政诉讼原告",
  ADMIN_DEFENDANT: "行政诉讼被告",
  ADMIN_RECONSIDERATION_APPLICANT: "行政复议申请人",
  ADMIN_RECONSIDERATION_RESPONDENT: "行政复议被申请人",
  NON_LITIGATION_PARTY: "项目当事人"
};

const CATEGORY_CN: Record<string, string> = {
  CIVIL_COMMERCIAL: "民商事",
  CRIMINAL: "刑事",
  ADMINISTRATIVE: "行政",
  NON_LITIGATION: "非诉",
  LEGAL_COUNSEL: "法律顾问",
  SPECIAL_PROJECT: "专项法律服务"
};

function toCNDate(d: Date): string {
  const cnDigits = "〇一二三四五六七八九";
  const y = String(d.getFullYear()).split("").map((c) => cnDigits[+c]).join("");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const cnNum = (n: number) => {
    if (n <= 10) return ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][n];
    if (n < 20) return "十" + cnDigits[n - 10];
    if (n < 30) return "二十" + (n === 20 ? "" : cnDigits[n - 20]);
    return "三十" + (n === 30 ? "" : cnDigits[n - 30]);
  };
  return `${y}年${cnNum(m)}月${cnNum(day)}日`;
}

function partyToSnapshot(p: {
  name: string;
  idNumber: string | null;
  phone: string | null;
  address: string | null;
  legalRep: string | null;
}): PartySnapshot {
  return {
    name: p.name,
    idNumber: p.idNumber ?? "",
    phone: p.phone ?? "",
    address: p.address ?? "",
    legalRep: p.legalRep ?? ""
  };
}

async function getFirmInfo(): Promise<{ name: string; address: string; phone: string }> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [FIRM_NAME_KEY, FIRM_ADDRESS_KEY, FIRM_PHONE_KEY] } }
  });
  const dict = new Map(rows.map((r) => [r.key, (r.value as { value?: string })?.value ?? ""]));
  return {
    name: dict.get(FIRM_NAME_KEY) || "LawLink 律师事务所",
    address: dict.get(FIRM_ADDRESS_KEY) || "",
    phone: dict.get(FIRM_PHONE_KEY) || ""
  };
}

/**
 * 应用 overrides（来自 UI 的行内补全），路径键如 "client.idNumber" 写回源表。
 * 注意：只回写 v0.8 高频缺失字段（client.idNumber / client.address / opposing.idNumber 等）。
 * 其他字段一律忽略，避免误操作。
 */
async function applyOverrides(matterId: string | undefined, overrides: Record<string, string>) {
  if (!matterId) return;
  const matter = await prisma.matter.findUnique({
    where: { id: matterId },
    select: { primaryClientId: true }
  });
  if (!matter) return;

  // client.* → Client 表
  if (matter.primaryClientId) {
    const clientPatch: Record<string, string> = {};
    if (overrides["client.idNumber"]) clientPatch.idNumber = overrides["client.idNumber"];
    if (overrides["client.address"]) clientPatch.address = overrides["client.address"];
    if (overrides["client.phone"]) clientPatch.phone = overrides["client.phone"];
    if (Object.keys(clientPatch).length > 0) {
      await prisma.client.update({
        where: { id: matter.primaryClientId },
        data: clientPatch
      });
    }
  }

  // opposing.* → 第一个 OPPOSING_PARTY
  const opposingPatch: Record<string, string> = {};
  if (overrides["opposing.idNumber"]) opposingPatch.idNumber = overrides["opposing.idNumber"];
  if (overrides["opposing.address"]) opposingPatch.address = overrides["opposing.address"];
  if (overrides["opposing.phone"]) opposingPatch.phone = overrides["opposing.phone"];
  if (Object.keys(opposingPatch).length > 0) {
    const opp = await prisma.party.findFirst({
      where: { matterId, role: "OPPOSING_PARTY" },
      orderBy: { ordinal: "asc" },
      select: { id: true }
    });
    if (opp) {
      await prisma.party.update({ where: { id: opp.id }, data: opposingPatch });
    }
  }
}

export async function buildContext(opts: {
  matterId?: string;
  userId: string;
  overrides?: Record<string, string>;
}): Promise<RenderContext> {
  if (opts.matterId && opts.overrides && Object.keys(opts.overrides).length > 0) {
    await applyOverrides(opts.matterId, opts.overrides);
  }

  const today = new Date();
  const firm = await getFirmInfo();
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { name: true, phone: true }
  });

  if (!opts.matterId) {
    return {
      firm,
      today: today.toISOString().slice(0, 10),
      todayCN: toCNDate(today),
      lawyer: { name: user?.name ?? "", phone: user?.phone ?? "" },
      matter: {
        code: "",
        title: "",
        category: "",
        causeText: "",
        intakeDate: "",
        claimAmount: "—",
        ourStanding: ""
      },
      client: EMPTY_PARTY,
      opposing: EMPTY_PARTY,
      third: EMPTY_PARTY,
      proceeding: { type: "", caseNo: "", court: "" },
      plaintiffs: [],
      defendants: [],
      thirds: []
    };
  }

  const matter = await prisma.matter.findUnique({
    where: { id: opts.matterId },
    include: {
      cause: { select: { name: true } },
      primaryClient: true,
      parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
      procedures: { orderBy: { order: "asc" }, where: { engagement: "ENGAGED" }, take: 1 }
    }
  });
  if (!matter) throw new Error("案件不存在");

  const causeText = matter.cause?.name ?? matter.causeFreeText ?? "";
  const clientParty = matter.primaryClient
    ? {
        name: matter.primaryClient.name,
        idNumber: matter.primaryClient.idNumber ?? "",
        phone: matter.primaryClient.phone ?? "",
        address: matter.primaryClient.address ?? "",
        legalRep: ""
      }
    : EMPTY_PARTY;

  const opposingParties = matter.parties
    .filter((p) => p.role === "OPPOSING_PARTY")
    .map(partyToSnapshot);
  const thirdParties = matter.parties
    .filter((p) => p.role === "THIRD_PARTY")
    .map(partyToSnapshot);
  const clientPartiesFromParty = matter.parties
    .filter((p) => p.role === "CLIENT_PARTY")
    .map(partyToSnapshot);

  // 根据 standing 区分 plaintiff / defendant（兜底按 role）
  const plaintiffs = clientPartiesFromParty.length > 0 ? clientPartiesFromParty : [clientParty];
  const defendants = opposingParties;

  const firstProc = matter.procedures[0];

  return {
    firm,
    today: today.toISOString().slice(0, 10),
    todayCN: toCNDate(today),
    lawyer: { name: user?.name ?? "", phone: user?.phone ?? "" },
    matter: {
      code: matter.internalCode,
      title: matter.title,
      category: CATEGORY_CN[matter.category] ?? matter.category,
      causeText,
      intakeDate: matter.intakeDate ? matter.intakeDate.toISOString().slice(0, 10) : "",
      claimAmount: matter.claimAmount ? `${matter.claimAmount} 元` : "—",
      ourStanding: matter.ourStanding ? STANDING_CN[matter.ourStanding] ?? matter.ourStanding : ""
    },
    client: clientParty,
    opposing: opposingParties[0] ?? EMPTY_PARTY,
    third: thirdParties[0] ?? EMPTY_PARTY,
    proceeding: {
      type: firstProc?.type ?? "",
      caseNo: firstProc?.caseNumber ?? "",
      court: firstProc?.handlingAgency ?? ""
    },
    plaintiffs,
    defendants,
    thirds: thirdParties
  };
}

/**
 * docxtemplater 错误结构（Errors[].properties.explanation 含具体 tag）。
 * 用类型断言读取，避免引入额外依赖。
 */
interface DocxTagError {
  message?: string;
  properties?: {
    id?: string;
    explanation?: string;
    xtag?: string;
    file?: string;
  };
}

interface DocxMultiError extends Error {
  properties?: {
    errors?: DocxTagError[];
    id?: string;
    explanation?: string;
  };
}

function formatDocxError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as DocxMultiError;
  const items = e.properties?.errors ?? [e as unknown as DocxTagError];
  const lines: string[] = [];
  for (const it of items) {
    const tag = it.properties?.xtag ?? it.properties?.id ?? "?";
    const reason = it.properties?.explanation ?? it.message ?? "未知";
    lines.push(`[${tag}] ${reason}`);
  }
  return lines.join("\n");
}

/**
 * 渲染 docx：传入模板 Buffer + 上下文 → 返回填充后的 Buffer。
 * 模板用 {{var}} 语法（双大括号），避免与 docx 内嵌 "{" 冲突。
 *
 * 出错时抛出含具体 tag / 原因的中文异常，方便律师定位是哪个模板字段坏了。
 */
export function renderDocxBuffer(
  templateBuffer: Buffer,
  context: RenderContext
): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(templateBuffer);
  } catch (err) {
    throw new Error(`模板文件损坏，无法解压：${err instanceof Error ? err.message : String(err)}`);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" }
  });

  try {
    doc.render(context as unknown as Record<string, unknown>);
  } catch (err) {
    throw new Error(`模板渲染失败：\n${formatDocxError(err)}`);
  }

  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

/**
 * 检查上下文中哪些变量为空，返回缺失变量路径列表（UI 弹窗用）。
 * @param required 模板声明的变量清单（DocumentTemplate.variables）
 */
export function detectMissing(required: string[], context: RenderContext): string[] {
  const missing: string[] = [];
  for (const path of required) {
    const val = readPath(context, path);
    if (val === undefined || val === null || String(val).trim() === "") {
      missing.push(path);
    }
  }
  return missing;
}

function readPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}
