"use client";

import { useState, useTransition } from "react";
import { Loader2, Paperclip, FileText, AlertOctagon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSealRequest,
  rejectSealRequest,
  stampSealRequest,
  cancelSealRequest
} from "@/server/seals/actions";
import { type SealRequestRow, SEAL_TYPE_CN } from "./seal-types";

type Action = "approve" | "reject" | "stamp" | "cancel";

export function SealActionsDialogs({
  target,
  onClose
}: {
  target: { row: SealRequestRow; action: Action };
  onClose: () => void;
}) {
  const { row, action } = target;

  if (action === "approve" || action === "reject") {
    return <ApprovalDialog row={row} action={action} onClose={onClose} />;
  }
  if (action === "stamp") {
    return <StampDialog row={row} onClose={onClose} />;
  }
  return <CancelDialog row={row} onClose={onClose} />;
}

function ApprovalDialog({
  row,
  action,
  onClose
}: {
  row: SealRequestRow;
  action: "approve" | "reject";
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">(action);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (mode === "reject" && !note.trim()) {
      toast.error("驳回需要写明原因");
      return;
    }
    startTransition(async () => {
      try {
        if (mode === "approve") {
          await approveSealRequest({ id: row.id, note: note.trim() });
          toast.success("已批准");
        } else {
          await rejectSealRequest({ id: row.id, reason: note.trim() });
          toast.success("已驳回");
        }
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>审批用章申请</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 rounded border border-border bg-muted/20 p-3 text-[12px]">
          <Field k="流水号" v={row.code} mono />
          <Field k="章种类" v={SEAL_TYPE_CN[row.sealType] ?? row.sealType} />
          <Field k="申请人" v={row.requestedBy.name} />
          {row.matter && (
            <Field k="关联案件" v={`${row.matter.internalCode} ${row.matter.title}`} />
          )}
          <Field k="文件标题" v={row.documentTitle} />
          <Field k="事由" v={row.purpose} />
          <Field k="页数 / 份数" v={`${row.pageCount} 页 × ${row.copies} 份`} />
          {row.requireCrossPageSeal && <Field k="骑缝章" v="是" />}
          {row.urgency === "URGENT" && (
            <p className="flex items-center gap-1 text-destructive">
              <AlertOctagon className="h-3 w-3" />
              紧急
            </p>
          )}
          {row.draftDoc && (
            <a
              href={`/api/documents/${row.draftDoc.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              下载待盖章稿 ({row.draftDoc.name})
            </a>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant={mode === "approve" ? "default" : "outline"}
            onClick={() => setMode("approve")}
            className="flex-1"
          >
            通过
          </Button>
          <Button
            size="sm"
            variant={mode === "reject" ? "destructive" : "outline"}
            onClick={() => setMode("reject")}
            className="flex-1"
          >
            驳回
          </Button>
        </div>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === "approve" ? "审批意见 (可选)" : "驳回原因 (必填)"}
          rows={2}
          className="mt-2 text-[12px]"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StampDialog({ row, onClose }: { row: SealRequestRow; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!file) {
      toast.error("请上传盖章后扫描件");
      return;
    }
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("stampedDoc", file);
    startTransition(async () => {
      try {
        await stampSealRequest(fd);
        toast.success("已完成");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "提交失败");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>回填盖章后扫描件</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          {row.code} · {SEAL_TYPE_CN[row.sealType]} · {row.documentTitle}
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded border border-dashed border-border px-3 py-4 text-[12px] text-muted-foreground hover:bg-muted/30">
          <Paperclip className="h-3.5 w-3.5" />
          {file ? (
            <span className="flex items-center gap-1 text-foreground">
              <FileText className="h-3 w-3" />
              {file.name}
            </span>
          ) : (
            "选择 PDF / 图片"
          )}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || !file}>
            {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ row, onClose }: { row: SealRequestRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const submit = () => {
    startTransition(async () => {
      try {
        await cancelSealRequest({ id: row.id });
        toast.success("已撤销");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "撤销失败");
      }
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>撤销用章申请</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">确定撤销 {row.code} ？</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            确定撤销
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <p className="flex items-baseline gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono text-foreground" : "text-foreground"}>{v}</span>
    </p>
  );
}
