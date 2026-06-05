"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import { assertMatterWritable } from "@/lib/archive/guard";
import { assertCanAccessMatter, assertCanLeadMatter } from "@/lib/permissions";
import {
  folderCreateSchema,
  folderRenameSchema,
  folderDeleteSchema,
  folderReorderSchema,
  moveDocumentToFolderSchema
} from "./schemas";

/** 判断当前用户是否能编辑该案件的卷宗结构（仅本案 LEAD / CO_LEAD） */
async function requireFolderEditor(matterId: string, session: { user: { id: string; role: string } }) {
  await assertCanLeadMatter(session.user.id, matterId, "仅案件主办/协办可管理卷宗");
}

export async function listFoldersByMatter(matterId: string) {
  const session = await requireSession();
  await assertCanAccessMatter(session.user.id, session.user.role, matterId);
  return prisma.documentFolder.findMany({
    where: { matterId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { documents: true } }
    }
  });
}

export async function createFolder(input: z.infer<typeof folderCreateSchema>) {
  const session = await requireSession();
  const data = folderCreateSchema.parse(input);
  await requireFolderEditor(data.matterId, session);
  await assertMatterWritable(data.matterId);

  // 计算 orderIndex（追加到末尾）
  const last = await prisma.documentFolder.findFirst({
    where: { matterId: data.matterId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true }
  });
  const orderIndex = (last?.orderIndex ?? -1) + 1;

  let created;
  try {
    created = await prisma.documentFolder.create({
      data: {
        matterId: data.matterId,
        name: data.name.trim(),
        orderIndex,
        isDefault: false
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(`已有同名卷宗「${data.name.trim()}」`);
    }
    throw e;
  }

  await audit({
    userId: session.user.id,
    action: "FOLDER_CREATE",
    targetType: "DocumentFolder",
    targetId: created.id,
    detail: { matterId: data.matterId, name: data.name }
  });

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true, id: created.id };
}

export async function renameFolder(input: z.infer<typeof folderRenameSchema>) {
  const session = await requireSession();
  const data = folderRenameSchema.parse(input);

  const folder = await prisma.documentFolder.findUnique({
    where: { id: data.id },
    select: { id: true, matterId: true }
  });
  if (!folder) throw new Error("卷宗不存在");
  await requireFolderEditor(folder.matterId, session);
  await assertMatterWritable(folder.matterId);

  try {
    await prisma.documentFolder.update({
      where: { id: data.id },
      data: { name: data.name.trim() }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(`已有同名卷宗「${data.name.trim()}」`);
    }
    throw e;
  }

  await audit({
    userId: session.user.id,
    action: "FOLDER_RENAME",
    targetType: "DocumentFolder",
    targetId: data.id,
    detail: { name: data.name }
  });

  revalidatePath(`/matters/${folder.matterId}`);
  return { ok: true };
}

export async function deleteFolder(input: z.infer<typeof folderDeleteSchema>) {
  const session = await requireSession();
  const data = folderDeleteSchema.parse(input);

  const folder = await prisma.documentFolder.findUnique({
    where: { id: data.id },
    select: { id: true, matterId: true, isDefault: true, _count: { select: { documents: true } } }
  });
  if (!folder) throw new Error("卷宗不存在");
  if (folder.isDefault) throw new Error("默认卷宗不可删除，只能改名");
  await requireFolderEditor(folder.matterId, session);
  await assertMatterWritable(folder.matterId);

  // 卷宗内的文档不删，移到"散件"（folderId = null）
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { folderId: data.id },
      data: { folderId: null }
    }),
    prisma.documentFolder.delete({ where: { id: data.id } })
  ]);

  await audit({
    userId: session.user.id,
    action: "FOLDER_DELETE",
    targetType: "DocumentFolder",
    targetId: data.id,
    detail: { matterId: folder.matterId, documentsReleased: folder._count.documents }
  });

  revalidatePath(`/matters/${folder.matterId}`);
  return { ok: true };
}

export async function reorderFolders(input: z.infer<typeof folderReorderSchema>) {
  const session = await requireSession();
  const data = folderReorderSchema.parse(input);
  await requireFolderEditor(data.matterId, session);
  await assertMatterWritable(data.matterId);

  await prisma.$transaction(
    data.orderedIds.map((id, i) =>
      prisma.documentFolder.update({
        where: { id },
        data: { orderIndex: i }
      })
    )
  );

  revalidatePath(`/matters/${data.matterId}`);
  return { ok: true };
}

export async function moveDocumentToFolder(input: z.infer<typeof moveDocumentToFolderSchema>) {
  const session = await requireSession();
  const data = moveDocumentToFolderSchema.parse(input);

  const doc = await prisma.document.findUnique({
    where: { id: data.documentId },
    select: { id: true, matterId: true }
  });
  if (!doc || !doc.matterId) throw new Error("文档不存在或未归属案件");

  // 校验目标卷宗与文档同案件
  if (data.folderId) {
    const folder = await prisma.documentFolder.findUnique({
      where: { id: data.folderId },
      select: { matterId: true }
    });
    if (!folder || folder.matterId !== doc.matterId) {
      throw new Error("目标卷宗与文档不属于同一案件");
    }
  }
  await requireFolderEditor(doc.matterId, session);
  await assertMatterWritable(doc.matterId);

  await prisma.document.update({
    where: { id: data.documentId },
    data: { folderId: data.folderId }
  });

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_MOVE_FOLDER",
    targetType: "Document",
    targetId: data.documentId,
    detail: { folderId: data.folderId }
  });

  revalidatePath(`/matters/${doc.matterId}`);
  return { ok: true };
}
