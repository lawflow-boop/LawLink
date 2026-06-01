"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FolderArchive,
  Search,
  Upload,
  Download,
  Trash2,
  History,
  X,
  Tag,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import type { FirmFileCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFirmFile } from "@/server/firm-files/actions";
import { cn } from "@/lib/utils";
import { UploadDialog } from "./upload-dialog";
import { PreviewDialog } from "./preview-dialog";

type FileEntry = {
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

const CATEGORY_META: Record<FirmFileCategory, { label: string; color: string }> = {
  POLICY: { label: "制度", color: "#9B7BF7" },
  GUIDE: { label: "指引", color: "#5B8DEF" },
  TEMPLATE: { label: "参考模板", color: "#48BB78" },
  REFERENCE: { label: "其他文件", color: "#F5A742" },
  CONTRACT: { label: "合同", color: "#5B8DEF" },
  LETTER: { label: "函件", color: "#48BB78" },
  LICENSE: { label: "证照", color: "#F5A742" },
  OTHER_FIRM: { label: "其他", color: "#9B7BF7" }
};

/** 律所文书页展示的分类 */
const FIRM_DOC_CATEGORIES: FirmFileCategory[] = ["CONTRACT", "LETTER", "LICENSE", "OTHER_FIRM"];
/** 旧分类（兼容已有数据） */
const LEGACY_CATEGORIES: FirmFileCategory[] = ["POLICY", "GUIDE", "TEMPLATE", "REFERENCE"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function FirmFilesView({
  files,
  canUpload,
  currentCategory,
  currentSearch,
  includeSuperseded,
  basePath = "/firm-resources",
  preservedParams = [],
  hideHeader,
  hideCategoryNav,
  headerTitle,
  headerSubtitle,
  headerIcon,
  categorySet
}: {
  files: FileEntry[];
  canUpload: boolean;
  currentCategory?: FirmFileCategory;
  currentSearch: string;
  includeSuperseded: boolean;
  /** v0.27: 让 service-center 复用同一组件且保留 ?tab= */
  basePath?: string;
  preservedParams?: string[];
  /** v0.37: 应用页内嵌——隐藏标题/介绍（tab 已标注）*/
  hideHeader?: boolean;
  /** v0.37: 隐藏分类筛选条（如「制度规范」tab 只列 POLICY）*/
  hideCategoryNav?: boolean;
  /** v0.44: 覆盖默认标题/副标题/图标 */
  headerTitle?: string;
  headerSubtitle?: string;
  headerIcon?: React.ReactNode;
  /** v0.44: 分类集合（"firm"=律所文书新分类，默认旧分类） */
  categorySet?: "firm" | "legacy";
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [search, setSearch] = useState(currentSearch);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCategories = categorySet === "firm" ? FIRM_DOC_CATEGORIES : LEGACY_CATEGORIES;

  function navigate(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    // 保留指定的 query（如 tab=firm-files）
    for (const k of preservedParams) {
      const v = sp.get(k);
      if (v) next.set(k, v);
    }
    // 合并目前的 firm-file 相关 query（category / q / includeOld）
    for (const k of ["category", "q", "includeOld"]) {
      const v = sp.get(k);
      if (v) next.set(k, v);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: search.trim() || undefined });
  }

  function handleDelete(f: FileEntry) {
    if (!confirm(`确认删除「${f.name}」？\n（软删除，可在数据库找回）`)) return;
    setPendingId(f.id);
    startTransition(async () => {
      try {
        await deleteFirmFile({ id: f.id });
        toast.success("已删除");
        router.refresh();
      } catch (err) {
        toast.error("删除失败", { description: err instanceof Error ? err.message : "" });
      } finally {
        setPendingId(null);
      }
    });
  }

  const counts = activeCategories.reduce<Record<FirmFileCategory, number>>(
    (acc, c) => {
      acc[c] = files.filter((f) => f.category === c).length;
      return acc;
    },
    // Initialize all to 0
    [...FIRM_DOC_CATEGORIES, ...LEGACY_CATEGORIES].reduce((acc, c) => { acc[c] = 0; return acc; }, {} as Record<FirmFileCategory, number>)
  );

  return (
    <div className="space-y-4">
      {!hideHeader ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl">
              {headerIcon ?? <FolderArchive className="h-5 w-5 text-primary" strokeWidth={1.8} />}
              {headerTitle ?? "律所文书"}
            </h1>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {headerSubtitle ?? (
                <>
                  合同 · 函件 · 证照 · 其他。全所共享，
                  {canUpload ? "管理员可上传与版本替代" : "管理员上传"}
                </>
              )}
            </p>
          </div>
          {canUpload && (
            <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              上传资料
            </Button>
          )}
        </header>
      ) : (
        canUpload && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              上传资料
            </Button>
          </div>
        )
      )}

      {/* 筛选条 */}
      <div className="space-y-3">
        {!hideCategoryNav && (
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryChip
            label="全部"
            color="#5B8DEF"
            count={files.length}
            active={!currentCategory}
            onClick={() => navigate({ category: undefined })}
          />
          {activeCategories.map((c) => (
            <CategoryChip
              key={c}
              label={CATEGORY_META[c].label}
              color={CATEGORY_META[c].color}
              count={counts[c]}
              active={currentCategory === c}
              onClick={() => navigate({ category: c })}
            />
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={includeSuperseded}
              onChange={(e) =>
                navigate({ includeOld: e.target.checked ? "1" : undefined })
              }
              className="h-3.5 w-3.5 accent-primary"
            />
            包含旧版
          </label>
        </div>
        )}

        <form onSubmit={handleSearch} className="flex items-center gap-1.5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按名称 / 描述 / 标签搜索"
              className="pl-8 text-xs"
            />
            {currentSearch && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  navigate({ q: undefined });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" variant="outline">
            搜索
          </Button>
        </form>
      </div>

      {/* 列表 */}
      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <FolderArchive className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {currentSearch
              ? `没有匹配「${currentSearch}」的资料`
              : currentCategory
                ? `没有「${CATEGORY_META[currentCategory].label}」类资料`
                : "还没有上传任何资料"}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => {
            const meta = CATEGORY_META[f.category];
            return (
              <li
                key={f.id}
                className={cn(
                  "group rounded-xl border bg-card p-3",
                  f.hasNewerVersion
                    ? "border-amber-300 bg-amber-50/30"
                    : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 overflow-hidden">
                    {/* 第一行：文件名 + 标签 + 大小 / 时间 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(f)}
                        className="truncate text-left text-sm font-medium text-foreground transition-colors hover:text-primary hover:underline"
                        title="点击预览"
                      >
                        {f.name}
                      </button>
                      <span
                        className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]"
                        style={{
                          borderColor: `${meta.color}40`,
                          color: meta.color,
                          backgroundColor: `${meta.color}10`
                        }}
                      >
                        {meta.label}
                      </span>
                      {f.hasNewerVersion && (
                        <span className="shrink-0 rounded border border-amber-400 bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                          旧版
                        </span>
                      )}
                      {f.supersedesCount > 0 && (
                        <span
                          className="shrink-0 inline-flex items-center gap-0.5 rounded border border-violet-300 bg-violet-50 px-1 py-0.5 text-[9px] text-violet-700"
                          title={`已替代 ${f.supersedesCount} 个旧版`}
                        >
                          <History className="h-2.5 w-2.5" />v{f.supersedesCount + 1}
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular">{formatBytes(f.size)}</span>
                        <span className="opacity-50">·</span>
                        <span>{new Date(f.createdAt).toLocaleDateString("zh-CN")}</span>
                        <span className="opacity-50">·</span>
                        <span>{f.uploadedBy.name}</span>
                        {f.tags.length > 0 && (
                          <>
                            <span className="opacity-50">·</span>
                            <span className="flex items-center gap-0.5">
                              <Tag className="h-2.5 w-2.5" />
                              {f.tags.join(" / ")}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    {/* 第二行：简介；没填时给个 placeholder，避免视觉空缺 */}
                    <p
                      className={cn(
                        "mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed",
                        f.description ? "text-muted-foreground" : "text-muted-foreground/50"
                      )}
                    >
                      {f.description || "（未填写简介）"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/api/firm-files/${f.id}/download`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-popover hover:text-primary"
                      title="下载"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {canUpload && (
                      <button
                        type="button"
                        onClick={() => handleDelete(f)}
                        disabled={pendingId === f.id || isPending}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-popover hover:text-destructive group-hover:opacity-100"
                        title="删除"
                      >
                        {pendingId === f.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canUpload && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          existingFiles={files}
        />
      )}

      <PreviewDialog
        open={!!previewFile}
        file={previewFile}
        onOpenChange={(o) => {
          if (!o) setPreviewFile(null);
        }}
      />
    </div>
  );
}

function CategoryChip({
  label,
  color,
  count,
  active,
  onClick
}: {
  label: string;
  color: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-input"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="font-mono text-[10px] tabular opacity-70">{count}</span>
    </button>
  );
}
