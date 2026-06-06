"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Paperclip, FileText, X, Receipt, Search, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { RadioChips } from "@/components/ui/radio-chips";
import {
  createInvoiceRequest,
  getMatterInvoiceContext,
  searchMattersForInvoice
} from "@/server/finance/actions";
import { uploadDocument } from "@/server/documents/actions";
import { cn } from "@/lib/utils";

type InvoiceType = "PLAIN" | "SPECIAL";
type InvoiceItem = "LAWYER_FEE" | "CONSULTING_FEE" | "AGENCY_FEE" | "OTHER";
type MatterRef = { id: string; internalCode: string; title: string };
type ClientOption = { id: string; name: string; taxNo: string | null; isPrimary: boolean };

const INVOICE_ITEM_OPTIONS: { value: InvoiceItem; label: string }[] = [
  { value: "LAWYER_FEE", label: "律师服务费" },
  { value: "CONSULTING_FEE", label: "法律咨询费" },
  { value: "AGENCY_FEE", label: "代理费" },
  { value: "OTHER", label: "其他法律服务" }
];

export function InvoiceCreateDialog({
  open,
  onOpenChange,
  canCreateUnlinkedInvoice = false
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canCreateUnlinkedInvoice?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 关联模式
  const [noMatter, setNoMatter] = useState(false);
  const [noMatterReason, setNoMatterReason] = useState("");
  const [matterQuery, setMatterQuery] = useState("");
  const [matterResults, setMatterResults] = useState<MatterRef[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<MatterRef | null>(null);
  const [matterLoading, setMatterLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  // 开票字段
  const [amount, setAmount] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType | null>(null);
  const [invoiceItem, setInvoiceItem] = useState<InvoiceItem>("LAWYER_FEE");
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxNo, setBuyerTaxNo] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerBank, setBuyerBank] = useState("");
  const [buyerBankAccount, setBuyerBankAccount] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const matterSearchSeqRef = useRef(0);

  function reset() {
    matterSearchSeqRef.current += 1;
    setNoMatter(false);
    setNoMatterReason("");
    setMatterQuery("");
    setMatterResults([]);
    setSelectedMatter(null);
    setMatterLoading(false);
    setClientOptions([]);
    setAmount("");
    setInvoiceType(null);
    setInvoiceItem("LAWYER_FEE");
    setBuyerName("");
    setBuyerTaxNo("");
    setBuyerAddress("");
    setBuyerPhone("");
    setBuyerBank("");
    setBuyerBankAccount("");
    setRequestNote("");
    setEvidenceFiles([]);
  }

  useEffect(() => {
    if (open) {
      reset();
      loadMatterOptions("");
    }
  }, [open]);

  function loadMatterOptions(q: string) {
    const query = q.trim();
    const seq = matterSearchSeqRef.current + 1;
    matterSearchSeqRef.current = seq;
    setMatterLoading(true);

    searchMattersForInvoice(query)
      .then((items) => {
        if (matterSearchSeqRef.current === seq) setMatterResults(items);
      })
      .catch(() => {
        if (matterSearchSeqRef.current === seq) setMatterResults([]);
      })
      .finally(() => {
        if (matterSearchSeqRef.current === seq) setMatterLoading(false);
      });
  }

  function runSearch(q: string) {
    setMatterQuery(q);
    loadMatterOptions(q);
  }

  function pickMatter(m: MatterRef) {
    setSelectedMatter(m);
    setClientOptions([]);
    setBuyerName("");
    setBuyerTaxNo("");
    getMatterInvoiceContext(m.id)
      .then((ctx) => {
        setClientOptions(ctx.clientOptions);
        if (ctx.clientOptions.length === 1) {
          const only = ctx.clientOptions[0];
          setBuyerName(only.name);
          setBuyerTaxNo(only.taxNo ?? "");
        }
      })
      .catch(() => setClientOptions([]));
  }

  function pickClient(id: string) {
    const c = clientOptions.find((o) => o.id === id);
    if (c) {
      setBuyerName(c.name);
      if (c.taxNo) setBuyerTaxNo(c.taxNo);
    }
  }

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.size <= 20 * 1024 * 1024);
    if (arr.length < list.length) toast.warning("跳过了超过 20MB 的文件");
    setEvidenceFiles((prev) => [...prev, ...arr]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.warning("请填写金额");
    if (!noMatter && !selectedMatter) return toast.warning("请选择关联案件，或勾选「无关联案件」");
    if (noMatter && !noMatterReason.trim()) return toast.warning("无关联案件时请说明原因");
    if (!invoiceType) return toast.warning("请选择开票类型");
    if (!buyerName.trim()) return toast.warning("请填写开票抬头");
    if (invoiceType === "SPECIAL") {
      if (!buyerTaxNo.trim()) return toast.warning("专票必须填写纳税人识别号");
      if (!buyerAddress.trim()) return toast.warning("专票必须填写购方地址");
      if (!buyerPhone.trim()) return toast.warning("专票必须填写购方电话");
      if (!buyerBank.trim()) return toast.warning("专票必须填写开户银行");
      if (!buyerBankAccount.trim()) return toast.warning("专票必须填写银行账号");
    }
    if (!noMatter && evidenceFiles.length === 0) {
      return toast.warning("请上传开票依据（扫描版委托合同等）");
    }

    startTransition(async () => {
      try {
        const isSpecial = invoiceType === "SPECIAL";
        const docIds: string[] = [];
        // 仅关联案件时上传依据（依据须绑定案件）
        if (!noMatter && selectedMatter) {
          for (const file of evidenceFiles) {
            const fd = new FormData();
            fd.set("matterId", selectedMatter.id);
            fd.set("name", file.name);
            fd.set("category", "OTHER");
            fd.set("encrypted", "true");
            fd.set("tags", "开票依据");
            fd.set("file", file);
            const doc = await uploadDocument(fd);
            docIds.push(doc.id);
          }
        }
        await createInvoiceRequest({
          matterId: noMatter ? null : selectedMatter!.id,
          noMatterReason: noMatter ? noMatterReason : null,
          amount: amt,
          invoiceType,
          invoiceItem,
          buyerName,
          buyerTaxNo: isSpecial ? buyerTaxNo : null,
          buyerAddress: isSpecial ? buyerAddress : null,
          buyerPhone: isSpecial ? buyerPhone : null,
          buyerBank: isSpecial ? buyerBank : null,
          buyerBankAccount: isSpecial ? buyerBankAccount : null,
          evidenceDocIds: docIds,
          requestNote
        });
        toast.success("开票申请已提交");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("提交失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[92vw] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            申请开具发票
          </DialogTitle>
          <DialogDescription className="text-xs">
            {canCreateUnlinkedInvoice
              ? "选择本人可关联的案件，或对无关联案件开票（须说明原因）"
              : "选择本人可关联的案件后提交开票申请"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 关联案件 */}
          <Field label="关联案件" required>
            <div className="space-y-2">
              {canCreateUnlinkedInvoice && (
                <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={noMatter}
                    onChange={(e) => {
                      setNoMatter(e.target.checked);
                      if (e.target.checked) {
                        setSelectedMatter(null);
                      } else {
                        loadMatterOptions(matterQuery);
                      }
                    }}
                  />
                  无关联案件（如所务、咨询等非案件收入）
                </label>
              )}

              {canCreateUnlinkedInvoice && noMatter ? (
                <Textarea
                  rows={2}
                  placeholder="请说明无关联案件的具体原因（必填）"
                  value={noMatterReason}
                  onChange={(e) => setNoMatterReason(e.target.value)}
                />
              ) : selectedMatter ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-muted-foreground">{selectedMatter.internalCode}</span>
                    <span className="truncate">{selectedMatter.title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedMatter(null)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={matterQuery}
                      onChange={(e) => runSearch(e.target.value)}
                      placeholder="搜索案件名称 / 系统编号 / 所内案号"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {matterLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      </div>
                    ) : matterResults.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border bg-background py-4 text-center text-xs text-muted-foreground">
                        {matterQuery.trim() ? "无匹配案件" : "暂无可关联案件"}
                      </p>
                    ) : (
                      matterResults.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => pickMatter(m)}
                          className="flex w-full flex-col rounded-sm border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-primary"
                        >
                          <span className="font-mono text-[10.5px] text-muted-foreground">{m.internalCode}</span>
                          <span className="truncate">{m.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </Field>

          {/* 金额 + 类型 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="开票金额（元）" required>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="font-mono"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="开票类型" required>
              <Select value={invoiceType ?? undefined} onValueChange={(v) => setInvoiceType(v as InvoiceType)}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLAIN">普通发票</SelectItem>
                  <SelectItem value="SPECIAL">增值税专用发票</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="开票名目" required>
            <RadioChips items={INVOICE_ITEM_OPTIONS} value={invoiceItem} onChange={(v) => setInvoiceItem(v as InvoiceItem)} />
          </Field>

          {/* 抬头 */}
          <Field label="开票抬头（客户）" required hint={clientOptions.length > 0 ? "选项为所选案件的关联客户" : undefined}>
            {!noMatter && clientOptions.length > 0 ? (
              <Select onValueChange={pickClient}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择开票抬头" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isPrimary ? "（主要客户）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="如：上海某某科技有限公司 / 张三"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            )}
          </Field>

          {/* 专票六要素 */}
          {invoiceType === "SPECIAL" && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <Field label="纳税人识别号" required>
                <Input className="font-mono" value={buyerTaxNo} onChange={(e) => setBuyerTaxNo(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="开户银行" required>
                  <Input value={buyerBank} onChange={(e) => setBuyerBank(e.target.value)} />
                </Field>
                <Field label="银行账号" required>
                  <Input className="font-mono" value={buyerBankAccount} onChange={(e) => setBuyerBankAccount(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="购方地址" required>
                  <Input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
                </Field>
                <Field label="购方电话" required>
                  <Input className="font-mono" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {/* 依据：仅关联案件时必传 */}
          {!noMatter && (
            <Field
              label="开票依据"
              required
              hint="扫描版委托合同等，单文件 ≤ 20MB"
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-7 gap-1.5 px-2 text-[11px]">
                  <Paperclip className="h-3.5 w-3.5" />
                  添加文件
                </Button>
              }
            >
              <div className="space-y-2">
                <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                {evidenceFiles.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background py-3 text-center text-xs text-muted-foreground">未选择任何文件</p>
                ) : (
                  <ul className="space-y-1.5">
                    {evidenceFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <button type="button" onClick={() => setEvidenceFiles((c) => c.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
          )}

          <Field label="申请备注（可选）">
            <Textarea rows={2} value={requestNote} onChange={(e) => setRequestNote(e.target.value)} />
          </Field>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            提交申请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  hint,
  action,
  children
}: {
  label: string;
  required?: boolean;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className={cn("flex items-center gap-1 text-xs")}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
