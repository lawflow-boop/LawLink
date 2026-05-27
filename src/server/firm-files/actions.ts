"use server";

/**
 * v0.22: 律所资料库（FirmFile）
 *
 * 全所共享：所有 active 用户可读；admin / PRINCIPAL_LAWYER 可上传 / 替代 / 删除。
 * 4 分类：制度 / 指引 / 参考模板 / 其他文件。
 * 版本：supersededById 链接旧→新；列表默认只显示"最新"。
 * 搜索：ILIKE name + description + tags 多字段模糊匹配（不用 tsvector）。
 */
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { storage } from "@/lib/storage";
import { sha256 } from "@/lib/storage/crypto";
import { ensureExt } from "@/lib/storage/mime-ext";
import { audit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import type { FirmFileCategory, Prisma } from "@prisma/client";

const FIRM_FILE_MAX_BYTES = 50 * 1024 * 1024;

export type FirmFileEntry = {
  id: string;
  name: string;
  description: string | null;
  category: FirmFileCategory;
  tags: string[];
  mimeType: string | null;
  size: number;
  uploadedBy: { id: string; name: string };
  createdAt: Date;
  hasNewerVersion: boolean;
  supersedesCount: number;
};

async function requireUploader() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    throw new Error("仅管理员 / 主任律师可管理律所资料");
  }
  return session;
}

const CATEGORY_VALUES: FirmFileCategory[] = ["POLICY", "GUIDE", "TEMPLATE", "REFERENCE"];

function parseCategory(raw: unknown): FirmFileCategory {
  if (typeof raw !== "string") throw new Error("分类必填");
  if ((CATEGORY_VALUES as string[]).includes(raw)) return raw as FirmFileCategory;
  throw new Error(`无效分类：${raw}`);
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function listFirmFiles(input: {
  category?: FirmFileCategory;
  search?: string;
  includeSuperseded?: boolean;
}): Promise<FirmFileEntry[]> {
  await requireSession();

  const where: Prisma.FirmFileWhereInput = {
    archivedAt: null
  };
  if (input.category) where.category = input.category;
  if (!input.includeSuperseded) where.supersedes = { none: {} };

  if (input.search?.trim()) {
    const q = input.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q } }
    ];
  }

  const rows = await prisma.firmFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      mimeType: true,
      size: true,
      createdAt: true,
      supersededById: true,
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { supersedes: true } }
    }
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    tags: r.tags,
    mimeType: r.mimeType,
    size: r.size,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt,
    hasNewerVersion: !!r.supersededById,
    supersedesCount: r._count.supersedes
  }));
}

export async function getFirmFileVersionHistory(input: { id: string }) {
  await requireSession();
  // 沿着 supersedes 链向旧版深挖（理论是树，业务上单链）
  type Node = {
    id: string;
    name: string;
    createdAt: Date;
    uploadedBy: { name: string };
    supersedes: { id: string }[];
  };
  const chain: Omit<Node, "supersedes">[] = [];
  let cursorId: string | null = input.id;
  while (cursorId) {
    const node: Node | null = await prisma.firmFile.findUnique({
      where: { id: cursorId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
        supersedes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true }
        }
      }
    });
    if (!node) break;
    chain.push({
      id: node.id,
      name: node.name,
      createdAt: node.createdAt,
      uploadedBy: node.uploadedBy
    });
    cursorId = node.supersedes[0]?.id ?? null;
  }
  return chain;
}

export async function uploadFirmFile(formData: FormData): Promise<{
  ok: true;
  id: string;
  name: string;
}> {
  const session = await requireUploader();

  const file = formData.get("file");
  const name = formData.get("name");
  const description = formData.get("description");
  const category = parseCategory(formData.get("category"));
  const tags = parseTags(formData.get("tags"));
  const supersedesRaw = formData.get("supersedesId");

  if (!(file instanceof File)) throw new Error("缺少文件");
  if (file.size === 0) throw new Error("空文件");
  if (file.size > FIRM_FILE_MAX_BYTES)
    throw new Error(`文件超过 ${Math.round(FIRM_FILE_MAX_BYTES / 1024 / 1024)}MB`);
  if (typeof name !== "string" || !name.trim()) throw new Error("名称必填");

  const supersedesId =
    typeof supersedesRaw === "string" && supersedesRaw ? supersedesRaw : null;

  // 替代旧版的合法性
  if (supersedesId) {
    const old = await prisma.firmFile.findUnique({
      where: { id: supersedesId },
      select: { id: true, supersededById: true, archivedAt: true }
    });
    if (!old) throw new Error("被替代的旧版不存在");
    if (old.supersededById) throw new Error("该旧版已被其他新版替代");
    if (old.archivedAt) throw new Error("该旧版已删除，无法被替代");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = await storage.writeFile("firm-files", buf);
  const hash = sha256(buf);

  // 用户填的 name 可能不含扩展名（如"员工手册 v2.4"），下载时浏览器要靠扩展名识别程序，
  // 这里优先取原始文件名的扩展名兜底，其次用 mimeType 推断
  const trimmedName = name.trim().slice(0, 200);
  const userHasExt = /\.[A-Za-z0-9]{1,5}$/.test(trimmedName);
  let nameWithFileExt = trimmedName;
  if (!userHasExt) {
    const m = file.name.match(/\.[A-Za-z0-9]{1,5}$/);
    nameWithFileExt = m ? trimmedName + m[0] : ensureExt(trimmedName, file.type || null);
  }

  const created = await prisma.$transaction(async (tx) => {
    const doc = await tx.firmFile.create({
      data: {
        name: nameWithFileExt,
        description:
          typeof description === "string" && description.trim()
            ? description.trim().slice(0, 1000)
            : null,
        category,
        tags,
        path,
        mimeType: file.type || null,
        size: file.size,
        sha256: hash,
        uploadedById: session.user.id
      },
      select: { id: true, name: true }
    });
    if (supersedesId) {
      await tx.firmFile.update({
        where: { id: supersedesId },
        data: { supersededById: doc.id }
      });
    }
    return doc;
  });

  await audit({
    userId: session.user.id,
    action: supersedesId ? "FIRM_FILE_REPLACE" : "FIRM_FILE_UPLOAD",
    targetType: "FirmFile",
    targetId: created.id,
    detail: { name: created.name, category, supersededId: supersedesId }
  });

  revalidatePath("/firm-resources");
  return { ok: true, id: created.id, name: created.name };
}

export async function updateFirmFile(input: {
  id: string;
  name?: string;
  description?: string | null;
  tags?: string[];
  category?: FirmFileCategory;
}) {
  const session = await requireUploader();
  const existing = await prisma.firmFile.findUnique({
    where: { id: input.id },
    select: { id: true, archivedAt: true }
  });
  if (!existing) throw new Error("资料不存在");
  if (existing.archivedAt) throw new Error("已删除的资料不可编辑");

  const data: Prisma.FirmFileUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim().slice(0, 200);
  if (input.description !== undefined) {
    data.description = input.description?.trim().slice(0, 1000) || null;
  }
  if (input.tags !== undefined) data.tags = input.tags.slice(0, 20);
  if (input.category !== undefined) data.category = input.category;

  await prisma.firmFile.update({ where: { id: input.id }, data });
  await audit({
    userId: session.user.id,
    action: "FIRM_FILE_UPDATE",
    targetType: "FirmFile",
    targetId: input.id,
    detail: input
  });
  revalidatePath("/firm-resources");
  return { ok: true };
}

export async function deleteFirmFile(input: { id: string }) {
  const session = await requireUploader();
  await prisma.firmFile.update({
    where: { id: input.id },
    data: { archivedAt: new Date() }
  });
  await audit({
    userId: session.user.id,
    action: "FIRM_FILE_DELETE",
    targetType: "FirmFile",
    targetId: input.id,
    detail: {}
  });
  revalidatePath("/firm-resources");
  return { ok: true };
}
