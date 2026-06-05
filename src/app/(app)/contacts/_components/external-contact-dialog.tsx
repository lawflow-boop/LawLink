"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ExternalContactCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  createExternalContact,
  updateExternalContact
} from "@/server/external-contacts/actions";

const CATEGORY_OPTIONS: { value: ExternalContactCategory; label: string }[] = [
  { value: "COURT", label: "法院" },
  { value: "PROSECUTOR", label: "检察院" },
  { value: "POLICE", label: "公安" },
  { value: "NOTARY", label: "公证处" },
  { value: "ARBITRATION", label: "仲裁" },
  { value: "OTHER_FIRM", label: "他所律师" },
  { value: "EXPERT", label: "鉴定专家" },
  { value: "OTHER", label: "其他" }
];

type Editing = {
  id: string;
  name: string;
  category: ExternalContactCategory;
  organization: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
} | null;

export function ExternalContactDialog({
  open,
  onOpenChange,
  editing
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Editing;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    category: "COURT" as ExternalContactCategory,
    organization: "",
    title: "",
    phone: "",
    email: "",
    wechat: "",
    address: "",
    notes: ""
  });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          category: editing.category,
          organization: editing.organization ?? "",
          title: editing.title ?? "",
          phone: editing.phone ?? "",
          email: editing.email ?? "",
          wechat: editing.wechat ?? "",
          address: editing.address ?? "",
          notes: editing.notes ?? ""
        });
      } else {
        setForm({
          name: "",
          category: "COURT",
          organization: "",
          title: "",
          phone: "",
          email: "",
          wechat: "",
          address: "",
          notes: ""
        });
      }
    }
  }, [open, editing]);

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("姓名必填");
      return;
    }
    startTransition(async () => {
      try {
        const payload = { ...form, tags: editing?.tags ?? [] };
        if (editing) {
          await updateExternalContact({ ...payload, id: editing.id });
          toast.success("已更新");
        } else {
          const created = await createExternalContact(payload);
          toast.success(
            created.status === "PENDING_REVIEW"
              ? "已提交审核，管理员通过后展示"
              : "已添加"
          );
        }
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("保存失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑联系人" : "新增外部联系人"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">姓名 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">类别 *</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: v as ExternalContactCategory })
                }
              >
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">单位 / 机构</Label>
              <Input
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                placeholder="如：上海市浦东新区人民法院"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">职务 / 庭室</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">手机</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">邮箱</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">微信</Label>
              <Input
                value={form.wechat}
                onChange={(e) => setForm({ ...form, wechat: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">地址</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">备注</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editing ? "更新" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
