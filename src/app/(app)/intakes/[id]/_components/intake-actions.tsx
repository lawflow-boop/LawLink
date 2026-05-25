"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ArrowRight, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { declineIntake, convertIntakeToMatter } from "@/server/intakes/actions";

export function IntakeActions({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const role = session?.user?.role;
  const canApprove = role === "ADMIN" || role === "PRINCIPAL_LAWYER";

  if (!canApprove) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        等待管理员/主任律师审批
      </div>
    );
  }

  function handleConvert() {
    if (!confirm("确认转为正式案件？将占用一个案件编号。")) return;
    startTransition(async () => {
      try {
        const res = await convertIntakeToMatter(intakeId);
        toast.success(`已转化为案件 ${res.internalCode}`);
        router.push(`/matters/${res.matterId}`);
      } catch (err) {
        toast.error("转化失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handleDecline() {
    if (!declineReason.trim()) {
      toast.warning("请填写不接案原因");
      return;
    }
    startTransition(async () => {
      try {
        await declineIntake({ id: intakeId, reason: declineReason });
        toast.success("已标记为不接案");
        setDeclineOpen(false);
      } catch (err) {
        toast.error("操作失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeclineOpen(true)}
          disabled={isPending}
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          不接案
        </Button>
        <Button
          size="sm"
          onClick={handleConvert}
          disabled={isPending}
          className="gap-1.5"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          转为正式案件
        </Button>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标记不接案</DialogTitle>
            <DialogDescription>
              说明不接案的原因。此操作会冻结这条收案记录，但仍会保留在历史中。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-xs">
              原因 *
            </Label>
            <Textarea
              id="reason"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="如：与已有客户存在阻塞性冲突 / 客户已撤回 / 不在业务范围内 ..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button
              onClick={handleDecline}
              disabled={isPending || !declineReason.trim()}
              variant="destructive"
            >
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              确认不接案
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
