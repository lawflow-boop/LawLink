import Link from "next/link";
import { Lock, FileText, Calendar, User, Download } from "lucide-react";
import { listArchivedMatters } from "@/server/archive/actions";
import { CLOSED_REASON_CN } from "@/server/archive/schemas";
import { Badge } from "@/components/ui/badge";

const CATEGORY_CN: Record<string, string> = {
  CIVIL_COMMERCIAL: "民商",
  CRIMINAL: "刑事",
  ADMINISTRATIVE: "行政",
  NON_LITIGATION: "非诉",
  LEGAL_COUNSEL: "顾问",
  SPECIAL_PROJECT: "专项"
};

export default async function ArchivePage() {
  const items = await listArchivedMatters();

  return (
    <div className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-medium flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#9B7BF7]" />
            归档总览
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            已归档的案件按归档日期降序排列。点击进入案件详情可查看卷宗封皮与目录，或导出归档包。
          </p>
        </div>
        <span className="text-xs text-muted-foreground">共 {items.length} 件</span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground">
          暂无已归档案件。在案件详情顶部&ldquo;状态 → 归档&rdquo;完成归档流程后，会出现在这里。
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-normal w-32">归档号</th>
                <th className="px-3 py-2 text-left font-normal">案件</th>
                <th className="px-3 py-2 text-left font-normal w-20">类别</th>
                <th className="px-3 py-2 text-left font-normal w-24">委托方</th>
                <th className="px-3 py-2 text-left font-normal w-20">结案方式</th>
                <th className="px-3 py-2 text-left font-normal w-28">结案日期</th>
                <th className="px-3 py-2 text-left font-normal w-28">归档日期</th>
                <th className="px-3 py-2 text-left font-normal w-20">归档人</th>
                <th className="px-3 py-2 text-left font-normal w-16">缺项</th>
                <th className="px-3 py-2 text-left font-normal w-16">导出</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((rec) => (
                <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-[#9B7BF7]">
                    {rec.archiveNo}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/matters/${rec.matter.id}`}
                      className="hover:text-[#5B8DEF] transition-colors line-clamp-1"
                    >
                      <FileText className="h-3 w-3 inline mr-1 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {rec.matter.internalCode}
                      </span>
                      {rec.matter.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {CATEGORY_CN[rec.matter.category] ?? rec.matter.category}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <User className="h-3 w-3 inline mr-1 text-muted-foreground" />
                    {rec.matter.primaryClient?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {rec.closedReason ? CLOSED_REASON_CN[rec.closedReason] : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    {rec.completedAt ? rec.completedAt.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {rec.archivedAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{rec.archivedBy}</td>
                  <td className="px-3 py-2.5">
                    {rec.missingItems.length > 0 ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
                        {rec.missingItems.length} 项
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">齐</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a
                      href={`/api/archive/${rec.matter.id}/export`}
                      className="inline-flex items-center gap-1 text-xs text-[#5B8DEF] hover:text-[#5B8DEF]/80"
                      title="导出归档 ZIP"
                    >
                      <Download className="h-3 w-3" />
                      ZIP
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
