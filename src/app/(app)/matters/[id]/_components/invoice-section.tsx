"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Receipt, Plus, Loader2, FileCheck2, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  createInvoiceRequest,
  listInvoiceRequestsByMatter
} from "@/server/invoices/actions";
import {
  invoiceRequestStatusLabel,
  invoiceRequestStatusColor
} from "@/lib/enums";
import { formatCurrency } from "@/lib/utils";
import type { InvoiceRequestStatus } from "@prisma/client";

type InvoiceRow = {
  id: string;
  amount: { toString(): string };
  title: string | null;
  status: InvoiceRequestStatus;
  requestNote: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  processNote: string | null;
  requestedBy: { id: string; name: string };
  processedBy: { id: string; name: string } | null;
  contractScan: { id: string; name: string } | null;
  invoiceFile: { id: string; name: string } | null;
};

export function InvoiceSection({ matterId }: { matterId: string }) {
  const [requests, setRequests] = useState<InvoiceRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const r = await listInvoiceRequestsByMatter(matterId);
      setRequests(r as InvoiceRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4 text-primary" />
          开票申请
          {requests && (
            <span className="text-xs text-muted-foreground">({requests.length})</span>
          )}
        </h3>
        <Button size="sm" onClick={() => setOpen(true)} className="h-7 gap-1">
          <Plus className="h-3.5 w-3.5" />
          申请开票
        </Button>
      </header>

      {loading ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto h-3 w-3 animate-spin" />
        </p>
      ) : !requests || requests.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          还没有开票申请。客户需要发票时点上方&ldquo;申请开票&rdquo;
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {requests.map((r) => (
            <InvoiceItem key={r.id} row={r} />
          ))}
        </ul>
      )}

      <CreateInvoiceDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reload();
        }}
        matterId={matterId}
      />
    </section>
  );
}

function InvoiceItem({ row }: { row: InvoiceRow }) {
  const color = invoiceRequestStatusColor[row.status];
  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-popover">
      <span
        className="inline-flex h-6 min-w-16 items-center justify-center rounded-md border px-2 text-[10px] font-medium"
        style={{ borderColor: `${color}50`, color }}
      >
        {invoiceRequestStatusLabel[row.status]}
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular text-foreground">
            {formatCurrency(Number(row.amount))}
          </span>
          {row.title && (
            <span className="text-xs text-muted-foreground">· {row.title}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          申请：{row.requestedBy.name} · {new Date(row.requestedAt).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })}
          {row.processedBy && (
            <>
              {" · "}
              {row.status === "REJECTED" ? "驳回" : "处理"}：{row.processedBy.name}
            </>
          )}
        </div>
        {row.requestNote && (
          <div className="mt-1 text-[11px] text-foreground/80">备注：{row.requestNote}</div>
        )}
        {row.processNote && (
          <div className="mt-1 text-[11px] text-destructive/80">
            财务备注：{row.processNote}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.contractScan && (
          <a
            href={`/api/documents/${row.contractScan.id}/download`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            title={row.contractScan.name}
          >
            <FileCheck2 className="h-3 w-3" />
            合同
          </a>
        )}
        {row.invoiceFile && (
          <a
            href={`/api/documents/${row.invoiceFile.id}/download`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary"
            title={row.invoiceFile.name}
          >
            <Download className="h-3 w-3" />
            电子发票
          </a>
        )}
      </div>
    </li>
  );
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  matterId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
}) {
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setAmount("");
    setTitle("");
    setNote("");
  }

  function handleSubmit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.warning("请填写有效的开票金额");
      return;
    }
    startTransition(async () => {
      try {
        await createInvoiceRequest({
          matterId,
          amount: amt,
          title,
          requestNote: note
        });
        toast.success("开票申请已提交，等待财务处理");
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("提交失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            申请开具发票
          </DialogTitle>
          <DialogDescription className="text-xs">
            提交后由财务处理，财务会上传扫描件合同 + 电子发票
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">开票金额（元）*</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              className="font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">抬头 / 备注</Label>
            <Input
              placeholder="如：某某公司 / 阶段款"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">说明（可选）</Label>
            <Textarea
              rows={3}
              placeholder="如：开具增值税专用发票，税号 ..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            提交申请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
