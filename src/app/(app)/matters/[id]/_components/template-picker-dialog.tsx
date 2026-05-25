"use client";

import { useState, useMemo, useTransition } from "react";
import { Sparkles, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { renderTemplate } from "@/server/document-templates/actions";
import {
  type TemplateSummary,
  type FolderPayload,
  TEMPLATE_CATEGORY_CN,
  VARIABLE_LABEL_CN
} from "./folder-types";

function describeMissing(paths: string[]): string {
  if (paths.length === 0) return "";
  const labels = paths.slice(0, 4).map((p) => VARIABLE_LABEL_CN[p] ?? p);
  const more = paths.length > 4 ? ` 等 ${paths.length} 项` : "";
  return labels.join("、") + more;
}

// 哪些变量允许行内补全（即写即存源表）—— 与 template-engine.ts applyOverrides 对齐
const EDITABLE_OVERRIDES = new Set([
  "client.idNumber",
  "client.address",
  "client.phone",
  "opposing.idNumber",
  "opposing.address",
  "opposing.phone"
]);

export function TemplatePickerDialog({
  open,
  onOpenChange,
  matterId,
  matterCategory,
  folders,
  templates
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
  matterCategory: string;
  folders: FolderPayload[];
  templates: TemplateSummary[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>("auto");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // 适用本案件类别的模板（含未限定类别的）
  const applicable = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.applicableCategories.length === 0 ||
          t.applicableCategories.includes(matterCategory)
      ),
    [templates, matterCategory]
  );

  const grouped = useMemo(() => {
    const m = new Map<TemplateSummary["category"], TemplateSummary[]>();
    for (const t of applicable) {
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    return Array.from(m.entries());
  }, [applicable]);

  const selected = applicable.find((t) => t.id === selectedId) ?? null;

  // 列出该模板的可编辑变量（白名单内的）
  const editableVars = selected
    ? selected.variables.filter((v) => EDITABLE_OVERRIDES.has(v))
    : [];

  const reset = () => {
    setSelectedId(null);
    setTargetFolderId("auto");
    setOverrides({});
  };

  const submit = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        const res = await renderTemplate({
          matterId,
          templateId: selected.id,
          folderId: targetFolderId === "auto" ? null : targetFolderId,
          overrides
        });
        if (res.missing.length > 0) {
          toast.warning(`已生成「${res.fileName}」，但以下字段为空需手动补：${describeMissing(res.missing)}`);
        } else {
          toast.success(`已生成「${res.fileName}」并归档`);
        }
        // 触发下载
        window.open(`/api/documents/${res.documentId}/download`, "_blank");
        reset();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "生成失败");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            从模板新建文书
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: 选模板 */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              1 · 选模板
            </Label>
            <div className="mt-2 max-h-[280px] overflow-y-auto rounded border border-border">
              {grouped.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  该案件类型暂无可用模板
                </p>
              ) : (
                grouped.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="sticky top-0 bg-muted/40 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {TEMPLATE_CATEGORY_CN[cat]}
                    </div>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={cn(
                          "flex w-full items-start gap-3 border-t border-border px-3 py-2 text-left transition-colors",
                          selectedId === t.id
                            ? "bg-primary/10"
                            : "hover:bg-muted/40"
                        )}
                      >
                        <FileText
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            selectedId === t.id ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium">{t.name}</p>
                          {t.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                        </div>
                        {selectedId === t.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Step 2: 行内补全 */}
          {selected && editableVars.length > 0 && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                2 · 补全可能缺失的字段
              </Label>
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                这些字段会即时写入源表（委托人/对方资料），下次自动带出
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {editableVars.map((path) => (
                  <div key={path}>
                    <Label className="text-[11px]">{VARIABLE_LABEL_CN[path] ?? path}</Label>
                    <Input
                      value={overrides[path] ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [path]: e.target.value }))
                      }
                      placeholder="如已存在 DB 留空即可"
                      className="h-8 text-[12px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: 选卷宗 */}
          {selected && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {editableVars.length > 0 ? "3" : "2"} · 归档到哪个卷宗
              </Label>
              <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动（按模板大类推荐）</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.isDefault && (
                        <span className="ml-1 text-[10px] text-muted-foreground">· 默认</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={!selected || pending}>
            {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            生成并下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
