"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { writeFile } from "@/lib/storage/local";
import { validateUploadedFile } from "@/lib/storage/file-validator";
import { encryptBuffer, sha256 } from "@/lib/storage/crypto";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function requireFinanceOrApprover(role: string) {
  if (role !== "FINANCE" && role !== "ADMIN" && role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅财务 / 管理员 / 主任律师可处理开票");
  }
}

/** 律师在案件详情提交开票申请 */
const createSchema = z.object({
  matterId: z.string().cuid(),
  amount: z.coerce.number().positive("金额需大于 0"),
  title: z.string().max(120).optional().or(z.literal("")),
  requestNote: z.string().max(500).optional().or(z.literal(""))
});

export async function createInvoiceRequest(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);
  await assertMatterWritable(data.matterId);

  // 申请权限：LEAD / CO_LEAD / ADMIN / PRINCIPAL_LAWYER
  const isAdmin = session.user.role === "ADMIN" || session.user.role === "PRINCIPAL_LAWYER";
  if (!isAdmin) {
    const member = await prisma.matterMember.findUnique({
      where: {
        matterId_userId: { matterId: data.matterId, userId: session.user.id }
      }
    });
    if (!member || (member.role !== "LEAD" && member.role !== "CO_LEAD")) {
      throw new Error("仅案件主办/协办律师或管理员可申请开票");
    }
  }

  const created = await prisma.invoiceRequest.create({
    data: {
      matterId: data.matterId,
      amount: data.amount,
      title: data.title?.trim() || null,
      requestNote: data.requestNote?.trim() || null,
      requestedById: session.user.id,
      status: "PENDING"
    }
  });

  await audit({
    userId: session.user.id,
    action: "INVOICE_REQUEST_CREATE",
    targetType: "InvoiceRequest",
    targetId: created.id,
    detail: { matterId: data.matterId, amount: data.amount }
  });

  revalidatePath(`/matters/${data.matterId}`);
  revalidatePath("/finance");
  return { ok: true, id: created.id };
}

export async function listInvoiceRequests(filter?: { status?: "PENDING" | "ISSUED" | "REJECTED" | "APPROVED" }) {
  await requireSession();
  const where: Prisma.InvoiceRequestWhereInput = filter?.status
    ? { status: filter.status }
    : {};
  return prisma.invoiceRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    include: {
      matter: { select: { id: true, internalCode: true, title: true } },
      requestedBy: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
      contractScan: { select: { id: true, name: true } },
      invoiceFile: { select: { id: true, name: true } }
    }
  });
}

export async function listInvoiceRequestsByMatter(matterId: string) {
  await requireSession();
  return prisma.invoiceRequest.findMany({
    where: { matterId },
    orderBy: { requestedAt: "desc" },
    include: {
      requestedBy: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
      contractScan: { select: { id: true, name: true } },
      invoiceFile: { select: { id: true, name: true } }
    }
  });
}

/**
 * 财务批准 + 上传扫描件合同 + 上传电子发票。FormData：
 *   requestId, processNote?, contractScan(File?), invoiceFile(File?)
 * - 仅 contractScan：状态 APPROVED
 * - contractScan + invoiceFile 都有：状态 ISSUED
 */
export async function approveInvoiceRequest(formData: FormData) {
  const session = await requireSession();
  requireFinanceOrApprover(session.user.role);

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) throw new Error("requestId 缺失");

  const existing = await prisma.invoiceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, matterId: true, status: true }
  });
  if (!existing) throw new Error("申请不存在");
  if (existing.status === "ISSUED") throw new Error("此申请已开具");
  if (existing.status === "REJECTED") throw new Error("此申请已驳回");

  const processNote = formData.get("processNote");
  const contractScan = formData.get("contractScan");
  const invoiceFile = formData.get("invoiceFile");

  let contractScanDocId: string | undefined;
  let invoiceFileDocId: string | undefined;

  // 上传扫描件合同
  if (contractScan instanceof File && contractScan.size > 0) {
    validateUploadedFile(contractScan, { purpose: "invoice", maxBytes: MAX_FILE_SIZE });
    const raw = Buffer.from(await contractScan.arrayBuffer());
    const enc = encryptBuffer(raw);
    const path = await writeFile(`m_${existing.matterId}`, enc.ciphertext);
    const doc = await prisma.document.create({
      data: {
        matterId: existing.matterId,
        name: contractScan.name,
        category: "CONTRACT",
        path,
        mimeType: contractScan.type || "application/octet-stream",
        size: contractScan.size,
        sha256: sha256(raw),
        encrypted: true,
        algorithm: enc.algorithm,
        iv: enc.iv.toString("base64"),
        authTag: enc.authTag.toString("base64"),
        tags: ["发票申请"],
        uploadedById: session.user.id
      }
    });
    contractScanDocId = doc.id;
  }

  // 上传电子发票
  if (invoiceFile instanceof File && invoiceFile.size > 0) {
    validateUploadedFile(invoiceFile, { purpose: "invoice", maxBytes: MAX_FILE_SIZE });
    const raw = Buffer.from(await invoiceFile.arrayBuffer());
    const enc = encryptBuffer(raw);
    const path = await writeFile(`m_${existing.matterId}`, enc.ciphertext);
    const doc = await prisma.document.create({
      data: {
        matterId: existing.matterId,
        name: invoiceFile.name,
        category: "OTHER",
        path,
        mimeType: invoiceFile.type || "application/octet-stream",
        size: invoiceFile.size,
        sha256: sha256(raw),
        encrypted: true,
        algorithm: enc.algorithm,
        iv: enc.iv.toString("base64"),
        authTag: enc.authTag.toString("base64"),
        tags: ["电子发票"],
        uploadedById: session.user.id
      }
    });
    invoiceFileDocId = doc.id;
  }

  const finalStatus = invoiceFileDocId
    ? ("ISSUED" as const)
    : contractScanDocId
      ? ("APPROVED" as const)
      : ("APPROVED" as const);

  await prisma.invoiceRequest.update({
    where: { id: requestId },
    data: {
      status: finalStatus,
      processNote: typeof processNote === "string" ? processNote.trim() || null : null,
      processedById: session.user.id,
      processedAt: new Date(),
      ...(contractScanDocId ? { contractScanId: contractScanDocId } : {}),
      ...(invoiceFileDocId ? { invoiceFileId: invoiceFileDocId } : {})
    }
  });

  await audit({
    userId: session.user.id,
    action: finalStatus === "ISSUED" ? "INVOICE_ISSUED" : "INVOICE_APPROVED",
    targetType: "InvoiceRequest",
    targetId: requestId,
    detail: {
      matterId: existing.matterId,
      hasContract: !!contractScanDocId,
      hasInvoice: !!invoiceFileDocId
    }
  });

  revalidatePath(`/matters/${existing.matterId}`);
  revalidatePath("/finance");
  return { ok: true, status: finalStatus };
}

const rejectSchema = z.object({
  requestId: z.string().cuid(),
  reason: z.string().min(1, "请说明驳回原因").max(500)
});

export async function rejectInvoiceRequest(input: z.infer<typeof rejectSchema>) {
  const session = await requireSession();
  requireFinanceOrApprover(session.user.role);
  const data = rejectSchema.parse(input);

  const existing = await prisma.invoiceRequest.findUnique({
    where: { id: data.requestId },
    select: { matterId: true, status: true }
  });
  if (!existing) throw new Error("申请不存在");
  if (existing.status === "ISSUED") throw new Error("已开具的申请不可驳回");

  await prisma.invoiceRequest.update({
    where: { id: data.requestId },
    data: {
      status: "REJECTED",
      processNote: data.reason,
      processedById: session.user.id,
      processedAt: new Date()
    }
  });

  await audit({
    userId: session.user.id,
    action: "INVOICE_REJECTED",
    targetType: "InvoiceRequest",
    targetId: data.requestId,
    detail: { matterId: existing.matterId, reason: data.reason }
  });

  revalidatePath(`/matters/${existing.matterId}`);
  revalidatePath("/finance");
  return { ok: true };
}

/** 财务页 KPI：本月已开票合计 */
export async function getInvoiceStats() {
  await requireSession();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const issued = await prisma.invoiceRequest.aggregate({
    where: { status: "ISSUED", processedAt: { gte: monthStart } },
    _sum: { amount: true },
    _count: true
  });
  const pendingCount = await prisma.invoiceRequest.count({
    where: { status: "PENDING" }
  });
  return {
    monthlyIssued: Number(issued._sum.amount ?? 0),
    monthlyIssuedCount: issued._count,
    pendingCount
  };
}
