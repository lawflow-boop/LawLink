import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { audit } from "@/server/audit";
import {
  buildMattersExportWorkbook,
  resolveMattersExportParams
} from "@/server/matters/export-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = resolveMattersExportParams(url.searchParams);

  let result: Awaited<ReturnType<typeof buildMattersExportWorkbook>>;
  try {
    result = await buildMattersExportWorkbook(params, {
      id: session.user.id,
      role: session.user.role
    });
  } catch (err) {
    console.error("[matters/export] 生成失败：", err);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }

  await audit({
    userId: session.user.id,
    action: "MATTERS_EXPORT",
    targetType: "MatterList",
    targetId: params.tab,
    detail: {
      tab: params.tab,
      tabLabel: result.tabLabel,
      total: result.total,
      filters: params,
      bytes: result.buffer.byteLength
    }
  });

  const arr = result.buffer.buffer.slice(
    result.buffer.byteOffset,
    result.buffer.byteOffset + result.buffer.byteLength
  ) as ArrayBuffer;

  return new NextResponse(arr, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(result.buffer.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`
    }
  });
}
