"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Package,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Briefcase,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  AlertTriangle
} from "lucide-react";
import type { Prisma, ExpressDirection } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { RadioChips } from "@/components/ui/radio-chips";
import { MatterCombobox } from "@/app/(app)/approvals/seals/_components/matter-combobox";
import { cn } from "@/lib/utils";
import { createExpress, refreshExpress, deleteExpress } from "@/server/express/actions";
import { SUPPORTED_COMPANIES, detectCompany } from "@/lib/express/companies";

type Row = Prisma.ExpressTrackingGetPayload<{
  include: {
    matter: { select: { id: true; internalCode: true; title: true } };
    createdBy: { select: { id: true; name: true } };
  };
}>;
type MatterOption = { id: string; internalCode: string; title: string };
type DirectionFilter = ExpressDirection | "ALL";

const STATE_TONE: Record<string, "danger" | "ok" | "warn" | "muted"> = {
  已签收: "ok",
  在途: "muted",
  在途中: "muted",
  已揽件: "muted",
  揽收: "muted",
  到达派件城市: "muted",
  派件中: "muted",
  疑难件: "danger",
  疑难: "danger",
  退签: "danger",
  退回: "danger",
  暂无信息: "warn",
  未知: "warn"
};

export function ExpressView({
  items,
  matters,
  configured,
  hideHeader
}: {
  items: Row[];
  matters: MatterOption[];
  configured: boolean;
  hideHeader?: boolean;
}) {
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items.filter((e) => {
      if (direction !== "ALL" && e.direction !== direction) return false;
      if (!kw) return true;
      return (
        e.trackingNo.toLowerCase().includes(kw) ||
        (e.purpose ?? "").toLowerCase().includes(kw) ||
        (e.recipient ?? "").toLowerCase().includes(kw) ||
        (e.matter?.title ?? "").toLowerCase().includes(kw) ||
        (e.matter?.internalCode ?? "").toLowerCase().includes(kw)
      );
    });
  }, [items, direction, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {hideHeader ? (
          <div />
        ) : (
          <div>
            <h1 className="flex items-center gap-2 text-2xl">
              <Package className="h-5 w-5 text-primary" />
              快递追踪
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              寄出 / 收到的法院文书、当事人材料统一登记 + 自动刷新物流
            </p>
          </div>
        )}
        <Button onClick={() => setNewOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          新建追踪
        </Button>
      </div>

      {!configured && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            未配置任何快递接入。记录可创建但物流状态拉不到。
            <Link href="/settings/express" className="ml-1 font-medium underline">
              去配置 快递鸟 / 快递100 →
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 sm:min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索单号 / 用途 / 收件人 / 案件"
            className="h-9 border-border bg-card pl-9"
          />
        </div>
        <RadioChips
          size="sm"
          items={[
            { value: "ALL", label: "全部" },
            { value: "OUTBOUND", label: "寄出" },
            { value: "INBOUND", label: "收到" }
          ]}
          value={direction}
          onChange={(v) => setDirection(v as DirectionFilter)}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {filtered.length === 0 ? (
          <div className="ll-surface rounded-lg border border-border p-12 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-6 w-6 opacity-40" />
            {items.length === 0
              ? "暂无快递追踪记录，点上方「新建追踪」开始"
              : "没有匹配的记录"}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((e) => (
              <Card key={e.id} e={e} />
            ))}
          </div>
        )}
      </motion.div>

      <NewExpressDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        matters={matters}
        configured={configured}
      />
    </div>
  );
}

function Card({ e }: { e: Row }) {
  const [pending, startTransition] = useTransition();
  const [tracesOpen, setTracesOpen] = useState(false);
  const traces = (e.tracesJson as { time?: string; desc?: string }[] | null) ?? [];
  const tone = e.lastState ? STATE_TONE[e.lastState] ?? "muted" : "muted";

  const onRefresh = () =>
    startTransition(async () => {
      try {
        const r = await refreshExpress({ id: e.id });
        toast.success(`已更新：${r.state}（${r.provider}）`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刷新失败");
      }
    });

  const onDelete = () => {
    if (!confirm(`确认删除单号 ${e.trackingNo}？`)) return;
    startTransition(async () => {
      try {
        await deleteExpress({ id: e.id });
        toast.success("已删除");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "失败");
      }
    });
  };

  return (
    <div className="ll-surface flex flex-col gap-2 rounded-lg border border-border p-4">
      {/* 行 1：方向 + 公司 + 状态 */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {e.direction === "OUTBOUND" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700">
            <ArrowUpFromLine className="h-3 w-3" />
            寄出
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
            <ArrowDownToLine className="h-3 w-3" />
            收到
          </span>
        )}
        {e.companyCode && (
          <span className="text-muted-foreground">{e.companyCode}</span>
        )}
        {e.lastState && (
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 text-[10px] font-normal",
              tone === "danger" && "border-red-500/40 bg-red-500/10 text-red-700",
              tone === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
              tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-700",
              tone === "muted" && "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {e.lastState}
          </Badge>
        )}
      </div>

      {/* 行 2：单号 + 用途 */}
      <div>
        <div className="font-mono text-[13px] font-medium text-foreground">
          {e.trackingNo}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] text-foreground/85">{e.purpose}</p>
      </div>

      {/* 行 3：收件人 + 案件 */}
      <div className="space-y-1 text-[11px] text-muted-foreground">
        {(e.recipient || e.recipientPhone) && (
          <div>
            收件人：{e.recipient ?? "—"}
            {e.recipientPhone && (
              <span className="ml-1 font-mono text-[10px]">{e.recipientPhone}</span>
            )}
          </div>
        )}
        {e.matter && (
          <Link
            href={`/matters/${e.matter.id}`}
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            <Briefcase className="h-3 w-3" />
            <span className="font-mono text-[10px]">{e.matter.internalCode}</span>
            <span className="truncate">{e.matter.title}</span>
          </Link>
        )}
        {e.lastUpdateAt && (
          <div className="font-mono text-[10px]">
            上次刷新：{new Date(e.lastUpdateAt).toLocaleString("zh-CN")}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 pt-2">
        {traces.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTracesOpen(true)}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <ExternalLink className="h-3 w-3" />
            轨迹 {traces.length}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={pending}
          className="h-7 gap-1 px-2 text-[11px] text-primary"
        >
          <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
          刷新
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={tracesOpen} onOpenChange={setTracesOpen}>
        <DialogContent className="max-h-[80vh] w-[92vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <span className="font-mono">{e.trackingNo}</span> · 物流轨迹
            </DialogTitle>
            <DialogDescription className="text-xs">
              {e.companyCode} · {traces.length} 条
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 border-l border-border pl-4">
            {traces.map((t, i) => (
              <li key={i} className="relative">
                <span
                  className={cn(
                    "absolute -left-[19px] top-1 h-2 w-2 rounded-full",
                    i === 0 ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                />
                <div className="text-[12px] text-foreground/85">{t.desc}</div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {t.time}
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NewExpressDialog({
  open,
  onOpenChange,
  matters,
  configured
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  matters: MatterOption[];
  configured: boolean;
}) {
  const [trackingNo, setTrackingNo] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [direction, setDirection] = useState<ExpressDirection>("OUTBOUND");
  const [matterId, setMatterId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [pending, startTransition] = useTransition();

  // 单号变化时自动识别公司
  const onTrackingChange = (v: string) => {
    setTrackingNo(v);
    if (v && !companyCode) {
      const detected = detectCompany(v);
      if (detected) setCompanyCode(detected);
    }
  };

  const reset = () => {
    setTrackingNo("");
    setCompanyCode("");
    setDirection("OUTBOUND");
    setMatterId("");
    setPurpose("");
    setRecipient("");
    setRecipientPhone("");
  };

  const submit = () => {
    if (!trackingNo.trim()) {
      toast.error("快递单号必填");
      return;
    }
    if (!purpose.trim()) {
      toast.error("用途必填");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createExpress({
          trackingNo: trackingNo.trim(),
          companyCode,
          direction,
          matterId: matterId || null,
          purpose: purpose.trim(),
          recipient: recipient.trim(),
          recipientPhone: recipientPhone.trim()
        });
        if (res.firstState) {
          toast.success(`已创建并查询：${res.firstState}`);
        } else {
          toast.success(configured ? "已创建（首次查询失败，可稍后刷新）" : "已创建（未配置 API，状态稍后手动查）");
        }
        reset();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[88vh] w-[92vw] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建快递追踪</DialogTitle>
          <DialogDescription className="text-xs">
            支持自动识别 顺丰 / 中通 / 圆通 / 韵达 / 申通 / EMS / 京东 / 极兔 等
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">方向 *</Label>
            <RadioChips
              size="sm"
              className="mt-2"
              items={[
                { value: "OUTBOUND", label: "寄出" },
                { value: "INBOUND", label: "收到" }
              ]}
              value={direction}
              onChange={(v) => setDirection(v as ExpressDirection)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px]">快递单号 *</Label>
              <Input
                value={trackingNo}
                onChange={(e) => onTrackingChange(e.target.value)}
                placeholder="如 SF1234567890123"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px]">快递公司</Label>
              <select
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">自动识别 / 未知</option>
                {SUPPORTED_COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-[11px]">用途 *</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={
                direction === "OUTBOUND"
                  ? "如：起诉状寄朝阳区法院立案庭"
                  : "如：法院送达判决书"
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-[11px]">关联案件（可选）</Label>
            <div className="mt-1">
              <MatterCombobox
                matters={matters}
                value={matterId}
                onChange={setMatterId}
                placeholder="搜索案件编号 / 名称"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px]">{direction === "OUTBOUND" ? "收件人" : "寄件人"}</Label>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="姓名或单位"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px]">联系电话</Label>
              <Input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "创建中..." : "创建并查询"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
