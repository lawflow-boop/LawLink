/**
 * v0.9.4 归档 ZIP 导出
 *
 * 结构：
 *   {archiveNo}/
 *     README.md                 — 归档说明 + 结构索引
 *     manifest.json             — 结构化全量数据（matter + parties + procedures + ...）
 *     封皮和目录/
 *       卷宗封皮.docx
 *       卷宗目录.docx
 *     材料/
 *       {category}/
 *         {N}_{原文件名}
 */
import PizZip from "pizzip";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { decryptBuffer, sha256 } from "@/lib/storage/crypto";

interface ZipResult {
  buffer: Buffer;
  fileName: string;
  checksum: string;
  size: number;
}

const CATEGORY_DIR: Record<string, string> = {
  EVIDENCE: "证据",
  PLEADING: "诉讼文书",
  PROCEDURE: "程序文书",
  JUDGMENT: "裁判文书",
  CONTRACT: "合同",
  OTHER: "其他"
};

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

async function readDocumentBuffer(doc: {
  path: string;
  encrypted: boolean;
  iv: string | null;
  authTag: string | null;
}): Promise<Buffer> {
  const raw = await storage.readFile(doc.path);
  if (!doc.encrypted) return raw;
  if (!doc.iv || !doc.authTag) throw new Error("加密元数据损坏");
  return decryptBuffer(raw, doc.iv, doc.authTag);
}

export async function buildArchiveZip(matterId: string): Promise<ZipResult> {
  const matter = await prisma.matter.findUnique({
    where: { id: matterId },
    include: {
      primaryClient: true,
      cause: { select: { name: true, code: true } },
      parties: { orderBy: [{ role: "asc" }, { ordinal: "asc" }] },
      procedures: { orderBy: { order: "asc" } },
      timelineEvents: { orderBy: { occurredAt: "asc" } },
      preservations: { orderBy: { startDate: "asc" } },
      notes: { where: { deletedAt: null }, orderBy: { occurredAt: "asc" } },
      billings: true,
      feeEntries: { orderBy: { occurredAt: "asc" } },
      archiveRecords: { orderBy: { archivedAt: "desc" }, take: 1 },
      owner: { select: { id: true, name: true } }
    }
  });
  if (!matter) throw new Error("案件不存在");
  if (matter.archiveRecords.length === 0) throw new Error("案件尚未归档，无法导出");

  const archive = matter.archiveRecords[0];
  const docs = await prisma.document.findMany({
    where: { matterId, deletedAt: null },
    select: {
      id: true,
      name: true,
      category: true,
      path: true,
      encrypted: true,
      iv: true,
      authTag: true,
      mimeType: true,
      size: true,
      createdAt: true,
      tags: true
    },
    orderBy: { createdAt: "asc" }
  });

  const zip = new PizZip();
  const root = safeName(archive.archiveNo);

  // ===== manifest.json：结构化数据快照（脱敏：密码、apiKey、authTag 等不导出）
  const manifest = {
    archiveNo: archive.archiveNo,
    archivedAt: archive.archivedAt.toISOString(),
    archivedBy: archive.archivedBy,
    closedReason: archive.closedReason,
    completedAt: archive.completedAt?.toISOString() ?? null,
    summary: archive.summary,
    judgmentSummary: archive.judgmentSummary,
    checklist: archive.checklistJson,
    missingItems: archive.missingItems,
    matter: {
      id: matter.id,
      internalCode: matter.internalCode,
      title: matter.title,
      category: matter.category,
      status: matter.status,
      cause: matter.cause,
      causeFreeText: matter.causeFreeText,
      claimAmount: matter.claimAmount?.toString() ?? null,
      ourStanding: matter.ourStanding,
      intakeDate: matter.intakeDate?.toISOString() ?? null,
      firstAcceptedAt: matter.firstAcceptedAt?.toISOString() ?? null,
      closedAt: matter.closedAt?.toISOString() ?? null,
      archivedAt: matter.archivedAt?.toISOString() ?? null,
      owner: matter.owner,
      primaryClient: matter.primaryClient
        ? {
            id: matter.primaryClient.id,
            name: matter.primaryClient.name,
            type: matter.primaryClient.type,
            idNumber: matter.primaryClient.idNumber,
            phone: matter.primaryClient.phone,
            email: matter.primaryClient.email,
            address: matter.primaryClient.address
          }
        : null
    },
    parties: matter.parties.map((p) => ({
      role: p.role,
      standing: p.standing,
      ordinal: p.ordinal,
      name: p.name,
      idNumber: p.idNumber,
      phone: p.phone,
      address: p.address,
      legalRep: p.legalRep,
      notes: p.notes
    })),
    procedures: matter.procedures.map((p) => ({
      order: p.order,
      type: p.type,
      customLabel: p.customLabel,
      engagement: p.engagement,
      caseNumber: p.caseNumber,
      handlingAgency: p.handlingAgency,
      panel: p.panel,
      handler: p.handler,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
      status: p.status,
      outcome: p.outcome,
      concludedAt: p.concludedAt?.toISOString() ?? null
    })),
    timelineEvents: matter.timelineEvents.map((e) => ({
      occurredAt: e.occurredAt.toISOString(),
      eventType: e.eventType,
      title: e.title,
      content: e.content,
      refType: e.refType,
      refId: e.refId
    })),
    preservations: matter.preservations.map((p) => ({
      type: p.type,
      propertyType: p.propertyType,
      amount: p.amount?.toString() ?? null,
      respondent: p.respondent,
      court: p.court,
      rulingNumber: p.rulingNumber,
      startDate: p.startDate.toISOString(),
      expiryDate: p.expiryDate.toISOString(),
      status: p.status,
      note: p.note
    })),
    notes: matter.notes.map((n) => ({
      channel: n.channel,
      withWhom: n.withWhom,
      occurredAt: n.occurredAt.toISOString(),
      content: n.content,
      tags: n.tags
    })),
    billings: matter.billings.map((b) => ({
      title: b.title,
      contractAmount: b.contractAmount.toString(),
      status: b.status,
      signedAt: b.signedAt?.toISOString() ?? null
    })),
    feeEntries: matter.feeEntries.map((f) => ({
      type: f.type,
      amount: f.amount.toString(),
      occurredAt: f.occurredAt.toISOString(),
      invoiceNo: f.invoiceNo,
      payerOrPayee: f.payerOrPayee,
      method: f.method,
      note: f.note
    })),
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      size: d.size,
      createdAt: d.createdAt.toISOString(),
      tags: d.tags
    }))
  };
  zip.file(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));

  // ===== README.md
  const md = [
    `# ${matter.title}`,
    "",
    `归档编号：**${archive.archiveNo}**  `,
    `案件编号：${matter.internalCode}  `,
    `归档日期：${archive.archivedAt.toISOString().slice(0, 10)}  `,
    `归档人：${archive.archivedBy}  `,
    archive.completedAt ? `结案日期：${archive.completedAt.toISOString().slice(0, 10)}` : "",
    "",
    "## 结案小结",
    "",
    archive.summary,
    "",
    archive.judgmentSummary ? "## 裁判结果\n\n" + archive.judgmentSummary + "\n" : "",
    "## 目录",
    "",
    "- `manifest.json` — 案件全量结构化数据（JSON 格式）",
    "- `封皮和目录/` — 自动生成的卷宗封皮与卷宗目录",
    "- `材料/` — 全部上传材料按类别分目录归档",
    "",
    archive.missingItems.length > 0
      ? `⚠️ 归档时存在缺项：${archive.missingItems.length} 项（详见 manifest.json）`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
  zip.file(`${root}/README.md`, md);

  // ===== 封皮和目录
  if (archive.coverDocId) {
    const cover = docs.find((d) => d.id === archive.coverDocId);
    if (cover) {
      const buf = await readDocumentBuffer(cover);
      zip.file(`${root}/封皮和目录/卷宗封皮.docx`, buf);
    }
  }
  if (archive.catalogDocId) {
    const catalog = docs.find((d) => d.id === archive.catalogDocId);
    if (catalog) {
      const buf = await readDocumentBuffer(catalog);
      zip.file(`${root}/封皮和目录/卷宗目录.docx`, buf);
    }
  }

  // ===== 材料：跳过已经放进"封皮和目录"的两份
  const skipIds = new Set(
    [archive.coverDocId, archive.catalogDocId].filter((x): x is string => !!x)
  );
  const seqByCategory: Record<string, number> = {};
  for (const d of docs) {
    if (skipIds.has(d.id)) continue;
    const dir = CATEGORY_DIR[d.category] ?? "其他";
    const n = (seqByCategory[dir] ?? 0) + 1;
    seqByCategory[dir] = n;
    try {
      const buf = await readDocumentBuffer(d);
      const seq = String(n).padStart(3, "0");
      zip.file(`${root}/材料/${dir}/${seq}_${safeName(d.name)}`, buf);
    } catch (err) {
      console.error(`[archive-export] 材料读取失败：${d.id}`, err);
      // 单文件失败不阻断；写一条说明
      zip.file(
        `${root}/材料/${dir}/_读取失败_${safeName(d.name)}.txt`,
        `该文件读取失败：${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const buffer = zip.generate({ type: "nodebuffer" }) as Buffer;
  return {
    buffer,
    fileName: `${root}.zip`,
    checksum: sha256(buffer),
    size: buffer.length
  };
}
