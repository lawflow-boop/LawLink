"use client";

/**
 * v0.27: 程序下"案件材料"区
 * v0.42: 分类切换 tab + 来源方 + 一行两列 + docx/xlsx 在线预览
 *
 * - 每个程序独立呈现自己关联的 Document
 * - 上传时必选 category；诉辩/证据类可标注来源方（取本案当事人）
 * - 预览：pdf/图片/文本走 download?inline=1；docx/xlsx 走 /preview 转 HTML
 */
import { useMemo, useRef, useState, useTransition } from "react";
import {
  File as FileIcon,
  FileImage,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Loader2,
  Plus,
  Trash2,
  Download,
  Eye
} from "lucide-react";
import type { DocumentCategory } from "@prisma/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { uploadDocument, deleteDocument } from "@/server/documents/actions";
import { canPreview, officePreviewKind } from "@/lib/storage/mime-ext";
import { cn, formatDate } from "@/lib/utils";

// v0.42: 类别标签按律师习惯改名
const categoryLabel: Record<DocumentCategory, string> = {
  PLEADING: "诉辩文件",
  EVIDENCE: "证据文件",
  PROCEDURE: "程序文件",
  JUDGMENT: "裁判文件",
  CONTRACT: "合同 / 协议",
  OTHER: "其他文件"
};
const CATEGORY_OPTIONS: DocumentCategory[] = [
  "PLEADING",
  "EVIDENCE",
  "PROCEDURE",
  "JUDGMENT",
  "CONTRACT",
  "OTHER"
];
// 需要标注来源方的类别（诉辩 / 证据）
const SOURCE_CATEGORIES: DocumentCategory[] = ["PLEADING", "EVIDENCE"];

const ROLE_LABEL: Record<string, string> = {
  CLIENT_PARTY: "我方",
  OPPOSING_PARTY: "对方",
  THIRD_PARTY: "第三人",
  CO_LITIGANT: "共同当事人",
  AGENT: "代理人",
  WITNESS: "证人",
  OTHER: "其他"
};

type Party = { id: string; name: string; role: string };

type DocItem = {
  id: string;
  name: string;
  category: DocumentCategory;
  mimeType: string | null;
  size: number | null;
  createdAt: Date;
  sourceParty: string | null;
  path: string;
};

function iconFor(mimeType: string | null) {
  if (!mimeType) return FileIcon;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.startsWith("text/"))
    return FileText;
  if (mimeType.includes("zip") || mimeType.includes("rar")) return FileArchive;
  return FileIcon;
}

// 预览 URL：office 文档走转 HTML，其余走 inline
function previewUrl(d: DocItem): string | null {
  if (officePreviewKind(d.mimeType, d.name)) {
    return `/api/documents/${d.id}/preview`;
  }
  if (canPreview(d.mimeType, d.name)) {
    return `/api/documents/${d.id}/download?inline=1`;
  }
  return null;
}

export function ProcedureDocumentsSection({
  matterId,
  procedureId,
  documents,
  parties
}: {
  matterId: string;
  procedureId: string;
  documents: DocItem[];
  parties: Party[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("PLEADING");
  const [sourceParty, setSourceParty] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [isPending, startTransition] = useTransition();
  // 当前分类筛选（全部 = null）
  const [filter, setFilter] = useState<DocumentCategory | null>(null);

  // 来源方选项：本案当事人（角色·名称）
  const sourceOptions = useMemo(
    () =>
      parties
        .filter((p) => p.name?.trim())
        .map((p) => `${ROLE_LABEL[p.role] ?? "其他"}·${p.name}`),
    [parties]
  );

  const filtered = useMemo(
    () => (filter ? documents.filter((d) => d.category === filter) : documents),
    [documents, filter]
  );

  // 各类别计数（给 tab 显示）
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of documents) c[d.category] = (c[d.category] ?? 0) + 1;
    return c;
  }, [documents]);

  function handleSubmit() {
    if (!picked) {
      toast.error("请先选择文件");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("matterId", matterId);
        fd.set("procedureId", procedureId);
        fd.set("file", picked);
        fd.set("category", category);
        if (SOURCE_CATEGORIES.includes(category) && sourceParty) {
          fd.set("sourceParty", sourceParty);
        }
        fd.set("name", customName.trim() || picked.name);
        await uploadDocument(fd);
        toast.success("上传成功");
        setOpen(false);
        setPicked(null);
        setCustomName("");
        setSourceParty("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err) {
        toast.error("上传失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`删除材料"${name}"？`)) return;
    startTransition(async () => {
      try {
        await deleteDocument(id);
        toast.success("已删除");
        router.refresh();
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <section className="h-full rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap">
            案件材料
            <span className="ml-1 font-mono text-[11px] text-muted-foreground tabular">
              {documents.length}
            </span>
          </span>
          {/* 分类按钮组（参考用印审批） */}
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] transition-colors",
                filter === null
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              全部
            </button>
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(filter === c ? null : c)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  filter === c
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {categoryLabel[c]}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="h-6 gap-0.5 px-2 text-[11px] shrink-0">
          <Plus className="h-2.5 w-2.5" />
          上传
        </Button>
      </header>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          {filter ? "该分类下暂无材料" : "本程序还没有材料，点击上方上传按钮添加"}
        </p>
      ) : (
        // 紧凑列表，无外框
        <ul className="divide-y divide-border px-4">
          {filtered.map((d) => {
            const Icon = iconFor(d.mimeType);
            const pUrl = previewUrl(d);
            return (
              <li
                key={d.id}
                className="group flex items-center gap-2 py-1.5"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  {pUrl ? (
                    <a
                      href={pUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs hover:text-primary hover:underline"
                      title="点击打开查看"
                    >
                      {d.name}
                    </a>
                  ) : (
                    <span className="truncate text-xs" title={d.name}>
                      {d.name}
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDate(d.createdAt)}
                    {d.size ? ` · ${(d.size / 1024).toFixed(0)}KB` : ""}
                    {d.sourceParty ? ` · ${d.sourceParty}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {pUrl && (
                    <a
                      href={pUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 text-muted-foreground hover:text-primary"
                      title="预览"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <a
                    href={`/api/documents/${d.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="下载"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id, d.name)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>上传案件材料</DialogTitle>
            <DialogDescription className="text-xs">
              文件 ≤ 20MB · 自动关联到当前程序
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">材料类别 *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {categoryLabel[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* v0.42 来源方：诉辩/证据类才出现，选项=本案当事人 */}
            {SOURCE_CATEGORIES.includes(category) && sourceOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">来源方（可选）</Label>
                <Select
                  value={sourceParty || "__none__"}
                  onValueChange={(v) => setSourceParty(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="选择来源方" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不标注</SelectItem>
                    {sourceOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">文件 *</Label>
              <Input
                ref={fileRef}
                type="file"
                onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
              />
              {picked && (
                <p className="text-[10px] text-muted-foreground">
                  已选 {picked.name}（{(picked.size / 1024).toFixed(0)} KB）
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">显示名（可选，留空用文件名）</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="如：原告起诉状-定稿"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !picked}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
