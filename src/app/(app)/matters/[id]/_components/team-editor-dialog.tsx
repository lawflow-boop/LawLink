"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { userRoleLabel } from "@/lib/enums";
import { updateMatterTeam } from "@/server/matters/actions";

type UserOption = { id: string; name: string; role: string };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
  currentOwnerId: string;
  currentMembers: { userId: string; role: "LEAD" | "CO_LEAD" | "ASSISTANT"; name: string }[];
  userOptions: UserOption[];
};

export function TeamEditorDialog({
  open,
  onOpenChange,
  matterId,
  currentOwnerId,
  currentMembers,
  userOptions
}: Props) {
  const [ownerId, setOwnerId] = useState(currentOwnerId);
  const [coLeads, setCoLeads] = useState<string[]>(
    currentMembers.filter((m) => m.role === "CO_LEAD").map((m) => m.userId)
  );
  const [assistants, setAssistants] = useState<string[]>(
    currentMembers.filter((m) => m.role === "ASSISTANT").map((m) => m.userId)
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setOwnerId(currentOwnerId);
      setCoLeads(currentMembers.filter((m) => m.role === "CO_LEAD").map((m) => m.userId));
      setAssistants(currentMembers.filter((m) => m.role === "ASSISTANT").map((m) => m.userId));
    }
  }, [open, currentOwnerId, currentMembers]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateMatterTeam({
          matterId,
          ownerId,
          coLeadIds: coLeads,
          assistantIds: assistants
        });
        toast.success("团队已更新");
        onOpenChange(false);
      } catch (err) {
        toast.error("更新失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑团队</DialogTitle>
          <DialogDescription className="text-xs">
            选择主办律师，添加协办与助理。仅 ADMIN / 主任律师 / 当前主办可改。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">主办律师</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} · {userRoleLabel[u.role as keyof typeof userRoleLabel] ?? u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">协办律师（可多选）</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3">
              {userOptions
                .filter((u) => u.id !== ownerId)
                .map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-popover"
                  >
                    <Checkbox
                      checked={coLeads.includes(u.id)}
                      onCheckedChange={() => toggle(coLeads, setCoLeads, u.id)}
                    />
                    <span>{u.name}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">助理（可多选）</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3">
              {userOptions
                .filter((u) => u.id !== ownerId && !coLeads.includes(u.id))
                .map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-popover"
                  >
                    <Checkbox
                      checked={assistants.includes(u.id)}
                      onCheckedChange={() => toggle(assistants, setAssistants, u.id)}
                    />
                    <span>{u.name}</span>
                  </label>
                ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
