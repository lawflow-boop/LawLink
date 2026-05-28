"use client";

/**
 * v0.27: 程序下"案件材料"区
 *
 * - 替代原 "案卷材料" 全局 tab
 * - 每个程序（一审/二审/再审/执行 等）独立呈现自己关联的 Document
 * - 上传时必选 category（起诉状/答辩状/证据/判决书 等映射 DocumentCategory）
 * - 复用 server/documents/actions 的 uploadDocument，传 procedureId 绑定
 */
import { useRef, useState, useTransition } from "react";
import {
  File as FileIcon,
  FileImage,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Loader2,
  Plus,
  Trash2,
  Download
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
import { uploadDocument, deleteDocument } from "@/server/documents/actions";
import { cn, formatDate } from "@/lib/utils";

const categoryLabel: Record<DocumentCategory, string> = {
  EVIDENCE: "证据材料",
  PLEADING: "起诉状 / 答辩状 / 申请书",
  PROCEDURE: "程序文书（含财产保全等）",
  JUDGMENT: "裁判文书",
  CONTRACT: "合同 / 协议",
  OTHER: "其他"
};
const CATEGORY_OPTIONS: DocumentCategory[] = [
  "PLEADING",
  "EVIDENCE",
  "PROCEDURE",
  "JUDGMENT",
  "CONTRACT",
  "OTHER"
];

type DocItem = {
  id: string;
  name: string;
  category: DocumentCategory;
  mimeType: string | null;
  size: number | null;
  createdAt: Date;
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

export function ProcedureDocumentsSection({
  matterId,
  procedureId,
  documents
}: {
  matterId: string;
  procedureId: string;
  documents: DocItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("PLEADING");
  const [customName, setCustomName] = useState("");
  const [isPending, startTransition] = useTransition();

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
        if (customName.trim()) fd.set("name", customName.trim());
        await uploadDocument(fd);
        toast.success("上传成功");
        setOpen(false);
        setPicked(null);
        setCustomName("");
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
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">案件材料</h3>
          <p className="text-[11px] text-muted-foreground">
            共 {documents.length} 份 · 上传时按类别归档（起诉状 / 证据 / 保全 等）
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          上传
        </Button>
      </header>

      {documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-background py-6 text-center text-xs text-muted-foreground">
          本程序还没有材料，点击上方上传按钮添加
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((d) => {
            const Icon = iconFor(d.mimeType);
            return (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{d.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {categoryLabel[d.category]} · {formatDate(d.createdAt)}
                    {d.size && ` · ${(d.size / 1024).toFixed(0)} KB`}
                  </div>
                </div>
                <a
                  href={`/api/documents/${d.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                  title="下载"
                >
                  <Download className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(d.id, d.name)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive hover:text-destructive"
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
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
