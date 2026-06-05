"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Layers,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Save
} from "lucide-react";
import type { ProcedureType, StageTemplate } from "@prisma/client";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { upsertStageTemplate } from "@/server/settings/actions";
import { procedureTypeLabel } from "@/lib/enums";

const ALL_PROCEDURE_TYPES: ProcedureType[] = [
  "FIRST_INSTANCE",
  "SECOND_INSTANCE",
  "RETRIAL_REVIEW",
  "RETRIAL",
  "REMAND_FIRST",
  "REMAND_SECOND",
  "PROSECUTORIAL_SUPERVISION",
  "COMMERCIAL_ARBITRATION",
  "LABOR_ARBITRATION",
  "ARBITRATION_SET_ASIDE",
  "ARBITRATION_ENFORCEMENT_REVIEW",
  "ENFORCEMENT",
  "ENFORCEMENT_OBJECTION",
  "INVESTIGATION",
  "PROSECUTION_REVIEW",
  "DEATH_PENALTY_REVIEW",
  "CRIMINAL_ENFORCEMENT",
  "COMMUTATION_PAROLE_REVIEW",
  "ADMIN_RECONSIDERATION",
  "ADMIN_NON_LITIGATION_ENFORCEMENT",
  "NON_LITIGATION_PHASE",
  "CUSTOM"
];

type Step = { name: string; order: number; defaultTasks?: string[] };

export function TemplatesView({ templates }: { templates: StageTemplate[] }) {
  const [selected, setSelected] = useState<ProcedureType>(
    (templates[0]?.procedureType as ProcedureType) ?? "FIRST_INSTANCE"
  );
  const [editing, setEditing] = useState(false);

  const current = templates.find((t) => t.procedureType === selected);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Layers className="h-4 w-4 text-primary" />
          阶段模板
        </h2>
        <Select value={selected} onValueChange={(v) => setSelected(v as ProcedureType)}>
          <SelectTrigger className="h-9 w-48 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_PROCEDURE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {procedureTypeLabel[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">
              {procedureTypeLabel[selected]} — {current?.name ?? "未配置"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              新建程序时将自动套用此模板的阶段
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {current ? "编辑" : "新建模板"}
          </Button>
        </div>

        {!current ? (
          <div className="rounded-md border border-dashed border-border bg-background py-8 text-center text-sm text-muted-foreground">
            该程序类型还没有默认模板
          </div>
        ) : (
          <ol className="space-y-2">
            {((current.steps ?? []) as unknown as Step[])
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s, idx) => (
                <li
                  key={idx}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {s.order}
                    </span>
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                </li>
              ))}
          </ol>
        )}
      </section>

      {editing && (
        <EditTemplateDialog
          procedureType={selected}
          existing={current}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function EditTemplateDialog({
  procedureType,
  existing,
  onClose
}: {
  procedureType: ProcedureType;
  existing: StageTemplate | undefined;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(existing?.name ?? `${procedureTypeLabel[procedureType]}模板`);
  const [steps, setSteps] = useState<Step[]>(() => {
    if (existing) {
      return ((existing.steps ?? []) as unknown as Step[])
        .slice()
        .sort((a, b) => a.order - b.order);
    }
    return [{ name: "", order: 1, defaultTasks: [] }];
  });

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps([
      ...steps,
      { name: "", order: steps.length + 1, defaultTasks: [] }
    ]);
  }

  function removeStep(idx: number) {
    const next = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(next);
  }

  function handleSave() {
    const cleaned = steps
      .filter((s) => s.name.trim())
      .map((s, i) => ({ name: s.name.trim(), order: i + 1, defaultTasks: [] }));
    if (cleaned.length === 0) {
      toast.warning("至少需要一个阶段");
      return;
    }
    startTransition(async () => {
      try {
        await upsertStageTemplate({
          procedureType,
          name,
          steps: cleaned
        });
        toast.success("模板已保存");
        onClose();
      } catch (err) {
        toast.error("保存失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑模板 — {procedureTypeLabel[procedureType]}</DialogTitle>
          <DialogDescription>
            修改后只影响 <span className="text-foreground">新创建</span> 的程序，已有程序的阶段不受影响
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">模板名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs">阶段流程</Label>
            <Button variant="outline" size="sm" onClick={addStep} className="h-7 gap-1">
              <Plus className="h-3.5 w-3.5" />
              添加阶段
            </Button>
          </div>
          <ol className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {steps.map((s, idx) => (
              <li key={idx} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground tabular">
                    {idx + 1}
                  </span>
                  <Input
                    value={s.name}
                    onChange={(e) => updateStep(idx, { name: e.target.value })}
                    placeholder="阶段名称"
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(idx)}
                    className="h-8 w-8 p-0 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存模板
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
