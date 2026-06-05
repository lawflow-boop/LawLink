"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { CustomFieldDef } from "@prisma/client";
import { Pencil, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { saveMatterCustomValues } from "@/server/custom-fields/actions";

type FieldDef = Pick<
  CustomFieldDef,
  "id" | "key" | "label" | "fieldType" | "options" | "required"
>;

export function CustomFieldsPanel({
  matterId,
  defs,
  values,
  canEdit
}: {
  matterId: string;
  defs: FieldDef[];
  values: Record<string, string>;
  canEdit: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  if (defs.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          自定义信息
        </span>
        {canEdit && (
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3" />
            编辑
          </Button>
        )}
      </header>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
        {defs.map((d) => (
          <div key={d.id} className="flex items-baseline gap-2">
            <dt className="shrink-0 text-muted-foreground">{d.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-foreground/90">
              {values[d.key]?.trim() ? values[d.key] : <span className="text-muted-foreground/50">—</span>}
            </dd>
          </div>
        ))}
      </dl>

      {canEdit && (
        <EditDialog
          key={editOpen ? "open" : "closed"}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          matterId={matterId}
          defs={defs}
          values={values}
        />
      )}
    </section>
  );
}

function EditDialog({
  open,
  onClose,
  matterId,
  defs,
  values
}: {
  open: boolean;
  onClose: () => void;
  matterId: string;
  defs: FieldDef[];
  values: Record<string, string>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({ ...values });
  const [pending, startTransition] = useTransition();

  function set(key: string, v: string) {
    setDraft((prev) => ({ ...prev, [key]: v }));
  }

  function submit() {
    startTransition(async () => {
      try {
        await saveMatterCustomValues(matterId, draft);
        toast.success("已保存");
        onClose();
      } catch (err) {
        toast.error("保存失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑自定义信息</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {defs.map((d) => (
            <div key={d.id} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {d.label}
                {d.required && <span className="ml-0.5 text-destructive">*</span>}
              </label>
              {d.fieldType === "SELECT" ? (
                <Select value={draft[d.key] ?? ""} onValueChange={(v) => set(d.key, v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {d.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={d.fieldType === "NUMBER" ? "number" : d.fieldType === "DATE" ? "date" : "text"}
                  value={draft[d.key] ?? ""}
                  onChange={(e) => set(d.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
