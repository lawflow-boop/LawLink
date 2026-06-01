"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { FirmFileCategory } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { uploadFirmFile } from "@/server/firm-files/actions";

const CATEGORY_OPTIONS: { value: FirmFileCategory; label: string }[] = [
  { value: "CONTRACT", label: "合同" },
  { value: "LETTER", label: "函件" },
  { value: "LICENSE", label: "证照" },
  { value: "OTHER_FIRM", label: "其他" },
  { value: "POLICY", label: "制度" },
  { value: "GUIDE", label: "指引" },
  { value: "TEMPLATE", label: "参考模板" },
  { value: "REFERENCE", label: "其他文件" }
];

const NONE_VALUE = "__none__";

type ExistingFile = {
  id: string;
  name: string;
  hasNewerVersion: boolean;
};

export function UploadDialog({
  open,
  onOpenChange,
  existingFiles
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingFiles: ExistingFile[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FirmFileCategory>("CONTRACT");
  const [tags, setTags] = useState("");
  const [supersedesId, setSupersedesId] = useState<string>(NONE_VALUE);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setName("");
    setDescription("");
    setCategory("CONTRACT");
    setTags("");
    setSupersedesId(NONE_VALUE);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFilePick(f: File | null) {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function submit() {
    if (!file) {
      toast.warning("请选择文件");
      return;
    }
    if (!name.trim()) {
      toast.warning("名称必填");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("name", name.trim());
        fd.set("description", description.trim());
        fd.set("category", category);
        fd.set("tags", tags);
        if (supersedesId !== NONE_VALUE) fd.set("supersedesId", supersedesId);
        const res = await uploadFirmFile(fd);
        toast.success(
          supersedesId !== NONE_VALUE
            ? `已上传并替代旧版：${res.name}`
            : `已上传：${res.name}`
        );
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("上传失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  // 可被替代的旧版：仅显示同分类且没有更新版本的
  const replaceableFiles = existingFiles.filter(
    (f) => !f.hasNewerVersion
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-primary" />
            上传律所资料
          </DialogTitle>
          <DialogDescription className="text-xs">
            单文件 ≤ 50MB；全所共享可见
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">文件 *</Label>
            <Input
              ref={fileRef}
              type="file"
              onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
            {file && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)}MB
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">名称 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：员工手册 v2.4"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px]">分类 *</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as FirmFileCategory)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px]">描述（可选）</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短说明用途、适用场景"
              rows={2}
              className="mt-1 resize-none text-sm"
            />
          </div>

          <div>
            <Label className="text-[11px]">标签（逗号 / 空格分隔）</Label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如：合伙人,薪酬,2024"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-[11px]">
              替代哪个旧版？（可选；选了之后旧版会被标&ldquo;旧版&rdquo;）
            </Label>
            <Select value={supersedesId} onValueChange={setSupersedesId}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue placeholder="不替代任何文件（新增）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>不替代任何文件（新增）</SelectItem>
                {replaceableFiles.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={isPending || !file}>
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
