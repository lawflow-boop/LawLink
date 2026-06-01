import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { storage } from "@/lib/storage";
import { decryptBuffer } from "@/lib/storage/crypto";
import { officePreviewKind } from "@/lib/storage/mime-ext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v0.42: 案件材料在线预览。
 * - docx → mammoth 转 HTML
 * - xlsx/xls → exceljs 读单元格转 HTML 表
 * 返回完整 HTML 文档，前端 <iframe> 内嵌。
 * pdf/图片/文本等浏览器原生可预览的走 download?inline=1（本路由不处理）。
 */
function htmlShell(title: string, body: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px 28px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a1a1a; line-height: 1.7; background: #fff; }
  .doc { max-width: 820px; margin: 0 auto; }
  .doc img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  td, th { border: 1px solid #d4d4d4; padding: 4px 8px; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  .sheet-name { margin: 18px 0 6px; font-weight: 600; font-size: 14px; color: #444; }
  p { margin: 0.4em 0; }
</style></head>
<body><div class="doc">${body}</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const doc = await prisma.document.findFirst({
    where: { id: params.id, deletedAt: null }
  });
  if (!doc) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  // 权限：与 download 路由一致（ADMIN/主任全看；案件成员看本案；收案合同限相关人）
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    if (doc.matterId) {
      const member = await prisma.matterMember.findUnique({
        where: { matterId_userId: { matterId: doc.matterId, userId: session.user.id } }
      });
      if (!member) return NextResponse.json({ error: "无权访问" }, { status: 403 });
    } else if (doc.intakeId) {
      const intake = await prisma.intake.findUnique({
        where: { id: doc.intakeId },
        select: { createdById: true, ownerUserId: true, coUserIds: true }
      });
      const uid = session.user.id;
      const allowed =
        !!intake &&
        (intake.createdById === uid ||
          intake.ownerUserId === uid ||
          intake.coUserIds.includes(uid));
      if (!allowed) return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
  }

  const kind = officePreviewKind(doc.mimeType, doc.name);
  if (!kind) {
    return NextResponse.json(
      { error: "该类型不支持在线预览，请下载查看" },
      { status: 415 }
    );
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
    console.error("[preview] 读取失败：", err);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }

  let html: string;
  try {
    if (kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.convertToHtml({ buffer: buf });
      html = htmlShell(doc.name, result.value || "<p>（空文档）</p>");
    } else {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        parts.push(`<div class="sheet-name">${escapeHtml(ws.name)}</div>`);
        const rows: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            const v = cell.value;
            let text = "";
            if (v == null) text = "";
            else if (typeof v === "object" && "text" in (v as object))
              text = String((v as { text: unknown }).text ?? "");
            else if (typeof v === "object" && "result" in (v as object))
              text = String((v as { result: unknown }).result ?? "");
            else text = String(v);
            cells.push(`<td>${escapeHtml(text)}</td>`);
          });
          rows.push(`<tr>${cells.join("")}</tr>`);
        });
        parts.push(`<table>${rows.join("")}</table>`);
      });
      html = htmlShell(doc.name, parts.join("") || "<p>（空表格）</p>");
    }
  } catch (err) {
    console.error("[preview] 转换失败：", err);
    return NextResponse.json({ error: "文档转换失败，请下载查看" }, { status: 500 });
  }

  await audit({
    userId: session.user.id,
    action: "DOCUMENT_PREVIEW",
    targetType: "Document",
    targetId: doc.id,
    detail: { matterId: doc.matterId, name: doc.name, kind }
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
