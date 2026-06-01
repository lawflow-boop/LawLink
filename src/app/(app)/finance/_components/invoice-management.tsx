"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Receipt,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  Download,
  FileCheck2,
  X
} from "lucide-react";
import type { InvoiceRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  invoiceRequestStatusLabel,
  invoiceRequestStatusColor
} from "@/lib/enums";
import { formatCurrency, cn } from "@/lib/utils";
import {
  approveInvoiceRequest,
  rejectInvoiceRequest
} from "@/server/invoices/actions";
import type { InvoiceRequestRow } from "./finance-view";

const STATUS_TABS: { key: InvoiceRequestStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "待处理" },
  { key: "ISSUED", label: "已开具" },
  { key: "REJECTED", label: "已驳回" },
  { key: "ALL", label: "全部" }
];

export function InvoiceManagementSection({
  requests,
  canApprove
}: {
  requests: InvoiceRequestRow[];
  canApprove: boolean;
}) {
  const [filter, setFilter] = useState<InvoiceRequestStatus | "ALL">("PENDING");
  const [processOpen, setProcessOpen] = useState<InvoiceRequestRow | null>(null);
  const [rejectOpen, setRejectOpen] = useState<InvoiceRequestRow | null>(null);

  const filtered = requests.filter((r) => filter === "ALL" || r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        {STATUS_TABS.map((t) => {
          const count =
            t.key === "ALL"
              ? requests.length
              : requests.filter((r) => r.status === t.key).length;
          const active = filter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-popover/50 hover:text-foreground"
              )}
            >
              {t.label}
              <span className="font-mono text-[10px] tabular opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-border bg-muted/30">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            <Receipt className="mx-auto mb-2 h-5 w-5 opacity-50" />
            没有匹配的开票申请
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const color = invoiceRequestStatusColor[r.status];
              const Icon =
                r.status === "PENDING"
                  ? Clock
                  : r.status === "ISSUED" || r.status === "APPROVED"
                    ? CheckCircle2
                    : XCircle;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-popover/30"
                >
                  <span
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium"
                    style={{ borderColor: `${color}50`, color }}
                  >
                    <Icon className="h-3 w-3" />
                    {invoiceRequestStatusLabel[r.status]}
                  </span>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base tabular font-semibold text-foreground">
                        {formatCurrency(Number(r.amount))}
                      </span>
                      {r.title && (
                        <span className="text-sm text-muted-foreground">· {r.title}</span>
                      )}
                    </div>
                    <Link
                      href={`/matters/${r.matter.id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <span className="font-mono">{r.matter.internalCode}</span>
                      <span>·</span>
                      <span className="truncate">{r.matter.title}</span>
                    </Link>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      申请：{r.requestedBy.name} ·{" "}
                      {new Date(r.requestedAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      {r.requestNote && <> · 备注：{r.requestNote}</>}
                    </div>
                    {/* v0.42 开票信息（专票六要素供财务直接开票） */}
                    {(r.buyerName || r.invoiceType) && (
                      <div className="mt-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        <div>
                          <span className="text-foreground/70">
                            {r.invoiceType === "SPECIAL"
                              ? "增值税专用发票"
                              : r.invoiceType === "PLAIN"
                                ? "普通发票"
                                : "发票"}
                          </span>
                          {r.buyerName && <> · 抬头：{r.buyerName}</>}
                          {r.buyerTaxNo && (
                            <> · 税号：<span className="font-mono">{r.buyerTaxNo}</span></>
                          )}
                        </div>
                        {r.invoiceType === "SPECIAL" &&
                          (r.buyerBank ||
                            r.buyerBankAccount ||
                            r.buyerAddress ||
                            r.buyerPhone) && (
                            <div className="mt-0.5">
                              {r.buyerAddress && <>地址：{r.buyerAddress}　</>}
                              {r.buyerPhone && <>电话：{r.buyerPhone}　</>}
                              {r.buyerBank && <>开户行：{r.buyerBank}　</>}
                              {r.buyerBankAccount && (
                                <>账号：<span className="font-mono">{r.buyerBankAccount}</span></>
                              )}
                            </div>
                          )}
                      </div>
                    )}
                    {r.processNote && (
                      <div className="mt-1 text-[11px] text-destructive/80">
                        财务备注：{r.processNote}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.contractScan && (
                      <a
                        href={`/api/documents/${r.contractScan.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <FileCheck2 className="h-3 w-3" />
                        合同
                      </a>
                    )}
                    {r.invoiceFile && (
                      <a
                        href={`/api/documents/${r.invoiceFile.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] text-primary"
                      >
                        <Download className="h-3 w-3" />
                        电子发票
                      </a>
                    )}
                    {canApprove && r.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectOpen(r)}
                          className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                        >
                          驳回
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setProcessOpen(r)}
                          className="h-7"
                        >
                          处理
                        </Button>
                      </>
                    )}
                    {canApprove && r.status === "APPROVED" && (
                      <Button size="sm" onClick={() => setProcessOpen(r)} className="h-7">
                        补传发票
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {processOpen && (
        <ProcessDialog
          request={processOpen}
          open={!!processOpen}
          onOpenChange={(o) => !o && setProcessOpen(null)}
        />
      )}
      {rejectOpen && (
        <RejectDialog
          request={rejectOpen}
          open={!!rejectOpen}
          onOpenChange={(o) => !o && setRejectOpen(null)}
        />
      )}
    </div>
  );
}

function ProcessDialog({
  request,
  open,
  onOpenChange
}: {
  request: InvoiceRequestRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [isPending, startTransition] = useTransition();
  const contractRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if (!contractFile && !invoiceFile && !request.contractScan && !request.invoiceFile) {
      toast.warning("请至少上传扫描件合同或电子发票");
      return;
    }
    if (invoiceFile && !invoiceNo.trim()) {
      toast.warning("上传电子发票时请填写发票号");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("requestId", request.id);
        if (note.trim()) fd.set("processNote", note.trim());
        if (contractFile) fd.set("contractScan", contractFile);
        if (invoiceFile) fd.set("invoiceFile", invoiceFile);
        if (invoiceNo.trim()) fd.set("invoiceNo", invoiceNo.trim());
        const res = await approveInvoiceRequest(fd);
        toast.success(
          res.status === "ISSUED" ? "已开具电子发票" : "已批准，等待补传电子发票"
        );
        onOpenChange(false);
      } catch (err) {
        toast.error("处理失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            处理开票申请
          </DialogTitle>
          <DialogDescription className="text-xs">
            {request.matter.internalCode} · {formatCurrency(Number(request.amount))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <FileSlot
            label="扫描件合同"
            file={contractFile}
            existing={request.contractScan?.name ?? null}
            inputRef={contractRef}
            onPick={setContractFile}
          />
          <FileSlot
            label="电子发票"
            file={invoiceFile}
            existing={request.invoiceFile?.name ?? null}
            inputRef={invoiceRef}
            onPick={setInvoiceFile}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">
              发票号 {invoiceFile && <span className="text-destructive">*</span>}
            </Label>
            <input
              type="text"
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm tabular"
              placeholder="如 24432000000123456789（上传电子发票时必填）"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">备注（可选）</Label>
            <Textarea
              rows={2}
              placeholder="如：发票号、税号等"
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
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileSlot({
  label,
  file,
  existing,
  inputRef,
  onPick
}: {
  label: string;
  file: File | null;
  existing: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="h-9 gap-1"
        >
          <Upload className="h-3.5 w-3.5" />
          {file ? "重新选择" : "选择文件"}
        </Button>
        {file && (
          <>
            <span className="flex-1 truncate text-xs">{file.name}</span>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="text-destructive/70 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {!file && existing && (
          <span className="flex-1 truncate text-[11px] text-muted-foreground">
            已存：{existing}（可重传覆盖）
          </span>
        )}
      </div>
    </div>
  );
}

function RejectDialog({
  request,
  open,
  onOpenChange
}: {
  request: InvoiceRequestRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!reason.trim()) {
      toast.warning("请填写驳回原因");
      return;
    }
    startTransition(async () => {
      try {
        await rejectInvoiceRequest({ requestId: request.id, reason });
        toast.success("已驳回");
        onOpenChange(false);
      } catch (err) {
        toast.error("操作失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>驳回开票申请</DialogTitle>
          <DialogDescription className="text-xs">
            {request.matter.internalCode} · {formatCurrency(Number(request.amount))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">驳回原因 *</Label>
          <Textarea
            rows={3}
            placeholder="如：金额与合同不符 / 抬头信息缺失"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !reason.trim()}
          >
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            确认驳回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
