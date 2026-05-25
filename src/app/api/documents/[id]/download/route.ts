import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { storage } from "@/lib/storage";
import { decryptBuffer } from "@/lib/storage/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.id, deletedAt: null }
  });
  if (!doc) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  // 权限检查：ADMIN / PRINCIPAL_LAWYER 可读全部；其他角色 —— 案件成员才能读案件材料；收案合同只要登录就可读
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    if (doc.matterId) {
      const member = await prisma.matterMember.findUnique({
        where: { matterId_userId: { matterId: doc.matterId, userId: session.user.id } }
      });
      if (!member) {
        return NextResponse.json({ error: "无权访问" }, { status: 403 });
      }
    }
    // 仅 intakeId 的合同：任何登录用户可读（收案阶段还没有案件成员概念）
  }

  let buf: Buffer;
  try {
    const stored = await storage.readFile(doc.path);
    if (doc.encrypted) {
      if (!doc.iv || !doc.authTag) {
        return NextResponse.json({ error: "加密元数据损坏" }, { status: 500 });
      }
      buf = decryptBuffer(stored, doc.iv, doc.authTag);
    } else {
      buf = stored;
    }
  } catch (err) {
    console.error("[download] 读取失败：", err);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_DOWNLOAD",
    targetType: "Document",
    targetId: doc.id,
    detail: { matterId: doc.matterId, intakeId: doc.intakeId, name: doc.name }
  });

  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType ?? "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`
    }
  });
}
