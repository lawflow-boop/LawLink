"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  FolderClosed,
  FolderOpen,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Download,
  Sparkles,
  Upload,
  Stamp
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createFolder,
  renameFolder,
  deleteFolder
} from "@/server/document-folders/actions";
import type { TemplateSummary, FolderPayload, FolderDocument } from "./folder-types";
import { TemplatePickerDialog } from "./template-picker-dialog";

export function FoldersPanel({
  matterId,
  matterCategory,
  folders,
  documents,
  templates
}: {
  matterId: string;
  matterCategory: string;
  folders: FolderPayload[];
  documents: FolderDocument[];
  templates: TemplateSummary[];
}) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(
    folders[0]?.id ?? null
  );
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderPayload | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const byFolderId = new Map<string | null, FolderDocument[]>();
  byFolderId.set(null, []);
  for (const f of folders) byFolderId.set(f.id, []);
  for (const d of documents) {
    const k = d.folderId ?? null;
    if (!byFolderId.has(k)) byFolderId.set(k, []);
    byFolderId.get(k)!.push(d);
  }
  const loose = byFolderId.get(null) ?? [];

  const activeDocs = activeFolderId
    ? byFolderId.get(activeFolderId) ?? []
    : loose;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 顶部操作栏 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg italic">卷宗</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setTemplateOpen(true)}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            从模板新建
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.info("上传文件功能 v0.8.1 接入")}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            上传文件
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNewFolderOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            新建卷宗
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左侧卷宗树 */}
        <aside className="col-span-3 ll-surface rounded-lg p-2">
          <ul className="space-y-0.5">
            {folders.map((f) => (
              <FolderItem
                key={f.id}
                folder={f}
                active={f.id === activeFolderId}
                count={(byFolderId.get(f.id) ?? []).length}
                onClick={() => setActiveFolderId(f.id)}
                onRename={() => setRenameTarget(f)}
              />
            ))}
            {loose.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setActiveFolderId(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] italic transition-colors",
                    activeFolderId === null
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <FolderClosed className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <span className="flex-1 truncate">散件</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {loose.length}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </aside>

        {/* 右侧文档列表 */}
        <section className="col-span-9">
          {activeDocs.length === 0 ? (
            <div className="ll-surface rounded-lg p-10 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-2 h-6 w-6 opacity-40" />
              此卷宗暂无文档。点右上「从模板新建」生成首份文书。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {activeDocs.map((d) => (
                <DocCard key={d.id} doc={d} matterId={matterId} />
              ))}
            </div>
          )}
        </section>
      </div>

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        matterId={matterId}
      />
      {renameTarget && (
        <RenameFolderDialog
          folder={renameTarget}
          open={!!renameTarget}
          onOpenChange={(o) => !o && setRenameTarget(null)}
        />
      )}
      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        matterId={matterId}
        matterCategory={matterCategory}
        folders={folders}
        templates={templates}
      />
    </motion.div>
  );
}

function FolderItem({
  folder,
  active,
  count,
  onClick,
  onRename
}: {
  folder: FolderPayload;
  active: boolean;
  count: number;
  onClick: () => void;
  onRename: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    if (folder.isDefault) {
      toast.error("默认卷宗不可删除，可改名");
      return;
    }
    if (!confirm(`确定删除卷宗「${folder.name}」？内含文档将归为散件。`)) return;
    startTransition(async () => {
      try {
        await deleteFolder({ id: folder.id });
        toast.success("已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    });
  };

  return (
    <li className="group">
      <div
        className={cn(
          "flex items-center gap-2 rounded px-2 py-1.5 text-[13px] italic transition-colors",
          active ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted/40"
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex flex-1 items-center gap-2 truncate text-left"
        >
          {active ? (
            <FolderOpen className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />
          ) : (
            <FolderClosed className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
          <span className="truncate">{folder.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
        </button>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onRename}
            title="重命名"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {!folder.isDefault && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              title="删除"
              className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function DocCard({ doc, matterId }: { doc: FolderDocument; matterId: string }) {
  const sizeLabel =
    doc.size && doc.size > 1024 * 1024
      ? `${(doc.size / 1024 / 1024).toFixed(1)} MB`
      : doc.size
        ? `${Math.round(doc.size / 1024)} KB`
        : "—";
  const dateLabel = new Date(doc.createdAt).toLocaleDateString("zh-CN");

  return (
    <div className="ll-surface rounded-lg border border-border p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={doc.name}>
            {doc.name}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {sizeLabel} · {dateLabel}
            {doc.templateId && <span className="ml-1 text-primary">· 模板生成</span>}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <a
          href={`/api/documents/${doc.id}/download`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          title="下载"
        >
          <Download className="h-3 w-3" />
          下载
        </a>
        <button
          type="button"
          onClick={() => {
            // 段 5 + 段 6 联动：跳转 /seals?new=1&draftDocId=...&matterId=...
            const url = new URL("/approvals/seals", window.location.origin);
            url.searchParams.set("new", "1");
            url.searchParams.set("draftDocId", doc.id);
            url.searchParams.set("matterId", matterId);
            url.searchParams.set("documentTitle", doc.name);
            window.location.href = url.toString();
          }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          title="提交用章审批"
        >
          <Stamp className="h-3 w-3" />
          提交用章
        </button>
      </div>
    </div>
  );
}

function NewFolderDialog({
  open,
  onOpenChange,
  matterId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createFolder({ matterId, name: name.trim() });
        toast.success("已新建");
        setName("");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新建失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建卷宗</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="卷宗名（最多 40 字）"
          autoFocus
          maxLength={40}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            新建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameFolderDialog({
  folder,
  open,
  onOpenChange
}: {
  folder: FolderPayload;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim() || name === folder.name) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameFolder({ id: folder.id, name: name.trim() });
        toast.success("已更新");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名卷宗</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
