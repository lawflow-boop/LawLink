/**
 * 冲突检索算法（V2）
 *
 * 与 V1 的关键区别：
 *   - V1 把"客户库同名"也当作冲突命中并标 HIGH，会出现"自己跟自己冲突"
 *     的错觉（系统已有同名客户档案 ≠ 利益冲突）。
 *   - V2 严格把"利益冲突"定义为：候选当事人在过去 Matter 里的角色与本次
 *     候选角色组合构成冲突。命中只落在 Matter 上，不落在 Client。
 *   - 同名客户档案单独走 sameNameClients 提示，不染色、不计入 hits。
 *   - 身份证号一致 → 单独走 idMatchedClients（强提示，可点开人工核对）。
 *
 * 严重度判定：
 *   候选 CLIENT_PARTY  ×  历史 OPPOSING_PARTY  → HIGH        曾经的对手现在要变委托方
 *   候选 OPPOSING_PARTY × 历史 CLIENT_PARTY    → BLOCKING    拟代理的对方曾是我所客户
 *   候选 OPPOSING_PARTY × 历史 OPPOSING_PARTY  → LOW         历史交锋提示，可继续办
 *   候选 CLIENT_PARTY  ×  历史 CLIENT_PARTY    → LOW         熟客户复办
 *   候选 THIRD_PARTY    × 任何                  → MEDIUM
 *   身份证一致 → 在原严重度基础上升 1 级（BLOCKING 顶天）
 */

import type { Prisma, PartyRole, LitigationStanding } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type QueryItem = {
  role: PartyRole;
  name: string;
  idNumber?: string;
};

export type MatterInfoForHit = {
  matterId: string;
  internalCode: string;
  title: string;
  causeText: string | null;
  ownerName: string | null;
  partyRole: PartyRole;
  partyStanding: LitigationStanding | null;
};

export type ConflictHitDraft = {
  hitType: "HISTORICAL_PARTY";
  targetType: "Matter";
  targetId: string;
  matchedName: string;
  matchedField: "name" | "idNumber";
  matchedValue: string;
  matchedRatio: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "BLOCKING";
  reason: string;
  matterInfo: MatterInfoForHit;
};

export type SameNameClient = {
  clientId: string;
  name: string;
};

export type IdMatchedClient = {
  clientId: string;
  name: string;
  idNumber: string;
};

export type ConflictCheckResult = {
  hits: ConflictHitDraft[];
  sameNameClients: SameNameClient[];
  idMatchedClients: IdMatchedClient[];
};

const SEV_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, BLOCKING: 3 } as const;
const SEV_BY_ORDER = ["LOW", "MEDIUM", "HIGH", "BLOCKING"] as const;

function bumpSeverity(s: ConflictHitDraft["severity"]): ConflictHitDraft["severity"] {
  return SEV_BY_ORDER[Math.min(SEV_ORDER[s] + 1, 3)];
}

function pickSeverity(
  candidateRole: PartyRole,
  historyRole: PartyRole
): ConflictHitDraft["severity"] {
  if (candidateRole === "THIRD_PARTY" || historyRole === "THIRD_PARTY") return "MEDIUM";
  if (candidateRole === "OPPOSING_PARTY" && historyRole === "CLIENT_PARTY") return "BLOCKING";
  if (candidateRole === "CLIENT_PARTY" && historyRole === "OPPOSING_PARTY") return "HIGH";
  if (candidateRole === "OPPOSING_PARTY" && historyRole === "OPPOSING_PARTY") return "LOW";
  if (candidateRole === "CLIENT_PARTY" && historyRole === "CLIENT_PARTY") return "LOW";
  return "MEDIUM";
}

export async function runConflictCheck(queries: QueryItem[]): Promise<ConflictCheckResult> {
  const hits: ConflictHitDraft[] = [];
  const sameNameClients = new Map<string, SameNameClient>();
  const idMatchedClients = new Map<string, IdMatchedClient>();

  for (const q of queries) {
    const name = q.name.trim();
    const idNumber = q.idNumber?.trim() || null;
    if (!name && !idNumber) continue;

    // ============ 客户库同名提示（仅候选我方时给出，非冲突） ============
    if (name && q.role === "CLIENT_PARTY") {
      const clients = await prisma.client.findMany({
        where: { deletedAt: null, name },
        select: { id: true, name: true }
      });
      for (const c of clients) {
        if (!sameNameClients.has(c.id)) {
          sameNameClients.set(c.id, { clientId: c.id, name: c.name });
        }
      }
    }

    // ============ 身份证号严格命中 Client（强提示，独立显示） ============
    if (idNumber) {
      const idMatched = await prisma.client.findMany({
        where: { deletedAt: null, idNumber },
        select: { id: true, name: true, idNumber: true }
      });
      for (const c of idMatched) {
        if (c.idNumber && !idMatchedClients.has(c.id)) {
          idMatchedClients.set(c.id, { clientId: c.id, name: c.name, idNumber: c.idNumber });
        }
      }
    }

    // ============ 历史案件 Party 匹配 ============
    const partyWhere: Prisma.PartyWhereInput[] = [];
    if (name) partyWhere.push({ name });
    if (idNumber) partyWhere.push({ idNumber });
    if (partyWhere.length === 0) continue;

    const partiesExact = await prisma.party.findMany({
      where: {
        OR: partyWhere,
        matterId: { not: null },
        matter: { deletedAt: null }
      },
      select: {
        id: true,
        name: true,
        idNumber: true,
        role: true,
        standing: true,
        matter: {
          select: {
            id: true,
            internalCode: true,
            title: true,
            cause: { select: { name: true } },
            causeFreeText: true,
            owner: { select: { name: true } }
          }
        }
      }
    });

    for (const p of partiesExact) {
      if (!p.matter) continue;
      const matterInfo: MatterInfoForHit = {
        matterId: p.matter.id,
        internalCode: p.matter.internalCode,
        title: p.matter.title,
        causeText: p.matter.cause?.name ?? p.matter.causeFreeText ?? null,
        ownerName: p.matter.owner?.name ?? null,
        partyRole: p.role,
        partyStanding: p.standing
      };

      // 身份证一致 → 在基础严重度上升 1 级
      if (idNumber && p.idNumber && p.idNumber === idNumber) {
        const base = pickSeverity(q.role, p.role);
        const sev = bumpSeverity(base);
        hits.push({
          hitType: "HISTORICAL_PARTY",
          targetType: "Matter",
          targetId: p.matter.id,
          matchedName: p.name,
          matchedField: "idNumber",
          matchedValue: idNumber,
          matchedRatio: 1,
          severity: sev,
          reason: `身份证 / 信用代码与案件「${p.matter.internalCode}」中 ${roleLabel(p.role)}「${p.name}」一致`,
          matterInfo
        });
      }
      if (name && p.name === name) {
        const sev = pickSeverity(q.role, p.role);
        hits.push({
          hitType: "HISTORICAL_PARTY",
          targetType: "Matter",
          targetId: p.matter.id,
          matchedName: p.name,
          matchedField: "name",
          matchedValue: name,
          matchedRatio: 1,
          severity: sev,
          reason: `与案件「${p.matter.internalCode}」中 ${roleLabel(p.role)}「${p.name}」同名`,
          matterInfo
        });
      }
    }

    // Party 姓名模糊匹配（限 3 字符以上，避免单字大量误命中）
    if (name && name.length >= 3) {
      const partiesFuzzy = await prisma.party.findMany({
        where: {
          matterId: { not: null },
          matter: { deletedAt: null },
          name: { contains: name, mode: "insensitive" },
          NOT: { name }
        },
        select: {
          id: true,
          name: true,
          role: true,
          standing: true,
          matter: {
            select: {
              id: true,
              internalCode: true,
              title: true,
              cause: { select: { name: true } },
              causeFreeText: true,
              owner: { select: { name: true } }
            }
          }
        },
        take: 20
      });
      for (const p of partiesFuzzy) {
        if (!p.matter) continue;
        hits.push({
          hitType: "HISTORICAL_PARTY",
          targetType: "Matter",
          targetId: p.matter.id,
          matchedName: p.name,
          matchedField: "name",
          matchedValue: name,
          matchedRatio: name.length / p.name.length,
          severity: "LOW",
          reason: `与案件「${p.matter.internalCode}」中 ${roleLabel(p.role)}「${p.name}」名称相似`,
          matterInfo: {
            matterId: p.matter.id,
            internalCode: p.matter.internalCode,
            title: p.matter.title,
            causeText: p.matter.cause?.name ?? p.matter.causeFreeText ?? null,
            ownerName: p.matter.owner?.name ?? null,
            partyRole: p.role,
            partyStanding: p.standing
          }
        });
      }
    }
  }

  // 去重：同一 (targetId,matchedField,matchedValue) 保留最高严重度
  const dedup = new Map<string, ConflictHitDraft>();
  for (const h of hits) {
    const key = `${h.targetId}|${h.matchedField}|${h.matchedValue}`;
    const existing = dedup.get(key);
    if (!existing || SEV_ORDER[h.severity] > SEV_ORDER[existing.severity]) {
      dedup.set(key, h);
    }
  }
  const sortedHits = Array.from(dedup.values()).sort(
    (a, b) => SEV_ORDER[b.severity] - SEV_ORDER[a.severity]
  );

  return {
    hits: sortedHits,
    sameNameClients: Array.from(sameNameClients.values()),
    idMatchedClients: Array.from(idMatchedClients.values())
  };
}

function roleLabel(role: PartyRole) {
  switch (role) {
    case "CLIENT_PARTY":
      return "委托方";
    case "OPPOSING_PARTY":
      return "对方";
    case "THIRD_PARTY":
      return "第三人";
    case "CO_LITIGANT":
      return "共同诉讼人";
    case "AGENT":
      return "代理人";
    case "WITNESS":
      return "证人";
    default:
      return "当事人";
  }
}
