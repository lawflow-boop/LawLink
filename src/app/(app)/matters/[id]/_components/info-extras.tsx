"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Download,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Loader2,
  ScanLine
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createExpress } from "@/server/express/actions";
import { parseExpressLabel } from "@/server/ai/parse-express";

type DocLite = { id: string; name: string; size: number | null; createdAt: Date };

export type SealContractItem = {
  id: string;
  code: string;
  documentTitle: string;
  status: string;
  createdAt: Date;
  draftDoc: DocLite;
  stampedDoc: DocLite | null;
};

type ContractRow = {
  kind: "intake" | "draft" | "stamped";
  label: string;
  doc: DocLite;
  sealCode?: string;
};

export function ContractsCard({
  intakeContracts,
  sealContracts
}: {
  intakeContracts: DocLite[];
  sealContracts: SealContractItem[];
}) {
  const rows: ContractRow[] = [
    ...intakeContracts.map((d) => ({
      kind: "intake" as const,
      label: "收案时上传",
      doc: d
    })),
    ...sealContracts.flatMap((sr): ContractRow[] => {
      const arr: ContractRow[] = [
        {
          kind: "draft",
          label: "用印申请",
          doc: sr.draftDoc,
          sealCode: sr.code
        }
      ];
      if (sr.stampedDoc) {
        arr.push({
          kind: "stamped",
          label: "盖章后扫描",
          doc: sr.stampedDoc,
          sealCode: sr.code
        });
      }
      return arr;
    })
  ];

  return (
    <section className="ll-surface rounded-lg border border-border p-4">
      <header className="mb-3 flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
        <span className="text-[15px]">委托合同 / 附件</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular">
          {rows.length}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          暂无合同或用印附件
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={`${r.kind}-${r.doc.id}`}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-sm px-2 text-[10px] font-medium",
                  r.kind === "intake"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : r.kind === "draft"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-primary/10 text-primary"
                )}
              >
                {r.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.82rem] font-medium">{r.doc.name}</div>
                <div className="font-mono text-[10px] tabular text-muted-foreground">
                  {r.sealCode ? `${r.sealCode} · ` : ""}
                  {r.doc.size ? `${(r.doc.size / 1024).toFixed(0)} KB · ` : ""}
                  {new Date(r.doc.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
              <a
                href={`/api/documents/${r.doc.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground transition-colors hover:text-primary"
                aria-label="下载"
              >
                <Download className="h-4 w-4" strokeWidth={1.6} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type ExpressItem = {
  id: string;
  trackingNo: string;
  companyCode: string | null;
  direction: "OUTBOUND" | "INBOUND";
  purpose: string;
  lastState: string | null;
  lastUpdateAt: Date | null;
  createdAt: Date;
};

export function ExpressMiniCard({
  expresses,
  matterId
}: {
  expresses: ExpressItem[];
  matterId?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <section className="ll-surface h-full rounded-lg border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          <Package className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
          快递记录
          <span className="ml-1 font-mono text-[11px] text-muted-foreground tabular">
            {expresses.length}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {matterId && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="h-6 gap-0.5 px-2 text-[11px]">
              <Plus className="h-2.5 w-2.5" />
              添加
            </Button>
          )}
          <Link
            href="/express"
            className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
          >
            全部 →
          </Link>
        </div>
      </header>
      {expresses.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">暂无快递记录</p>
      ) : (
        <ul className="space-y-1.5">
          {expresses.slice(0, 6).map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              {e.direction === "OUTBOUND" ? (
                <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 text-orange-600" strokeWidth={1.8} />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.8} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.82rem]">{e.purpose}</div>
                <div className="font-mono text-[10px] tabular text-muted-foreground">
                  {e.companyCode ?? "—"} · {e.trackingNo}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-foreground/80">{e.lastState ?? "—"}</div>
                <div className="font-mono text-[10px] tabular text-muted-foreground">
                  {e.lastUpdateAt
                    ? new Date(e.lastUpdateAt).toLocaleDateString("zh-CN")
                    : new Date(e.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {matterId && (
        <AddExpressDialog open={addOpen} onOpenChange={setAddOpen} matterId={matterId} />
      )}
    </section>
  );
}

/**
 * v0.27: 添加快递记录 dialog
 *
 * - 单号：可手动输入 / 上传单号照片 OCR 自动填
 * - 用途必填；方向默认 OUTBOUND；matter 已绑定
 * - 提交后调 createExpress（内部自动 detectCompany + trackExpress 拉取首条轨迹）
 */
function AddExpressDialog({
  open,
  onOpenChange,
  matterId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matterId: string;
}) {
  const router = useRouter();
  const [trackingNo, setTrackingNo] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [purpose, setPurpose] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [submitting, startSubmit] = useTransition();
  const [ocrPending, startOcr] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTrackingNo("");
    setCompanyCode("");
    setDirection("OUTBOUND");
    setPurpose("");
    setRecipient("");
    setRecipientPhone("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOcr(file: File) {
    startOcr(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await parseExpressLabel(fd);
        if (r.trackingNo) {
          setTrackingNo(r.trackingNo);
          toast.success(`已识别单号：${r.trackingNo}`);
        } else {
          toast.warning("未识别到单号，请手动输入");
        }
        if (r.companyCode) setCompanyCode(r.companyCode);
      } catch (err) {
        toast.error("识别失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handleSubmit() {
    if (!trackingNo.trim()) {
      toast.error("请填写或识别快递单号");
      return;
    }
    if (!purpose.trim()) {
      toast.error("请填写用途");
      return;
    }
    startSubmit(async () => {
      try {
        await createExpress({
          trackingNo: trackingNo.trim(),
          companyCode: companyCode.trim(),
          direction,
          matterId,
          purpose: purpose.trim(),
          recipient: recipient.trim(),
          recipientPhone: recipientPhone.trim()
        });
        toast.success("快递记录已创建");
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("创建失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加快递记录</DialogTitle>
          <DialogDescription className="text-xs">
            可上传快递单照片自动识别单号，也可手动输入。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">单号</Label>
            <div className="flex gap-1">
              <Input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="可手动输入或上传图片识别"
                className="font-mono"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleOcr(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={ocrPending}
                className="h-9 shrink-0 gap-1"
                title="上传快递单照片，AI 自动识别单号 + 快递公司"
              >
                {ocrPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ScanLine className="h-3 w-3" />
                )}
                识别
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">快递公司</Label>
              <Input
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder="留空则自动识别"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">方向</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as "OUTBOUND" | "INBOUND")}
              >
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTBOUND">寄出（我方→外）</SelectItem>
                  <SelectItem value="INBOUND">收件（外→我方）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">用途 *</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="如：起诉状寄朝阳法院"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">收件人 / 单位</Label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">收件电话</Label>
              <Input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            保存并跟踪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
