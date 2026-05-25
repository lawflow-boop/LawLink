"use client";

import { useState, useTransition } from "react";
import { Package, CheckCircle2, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveExpressSettingsAction } from "@/server/express/actions";

type Initial = {
  kdniao: { ebusinessId: string; configured: boolean; appKeyMasked: string };
  kuaidi100: { customer: string; configured: boolean; keyMasked: string };
};

export function ExpressSettingsForm({ initial }: { initial: Initial }) {
  const [kdEbId, setKdEbId] = useState(initial.kdniao.ebusinessId);
  const [kdAppKey, setKdAppKey] = useState("");
  const [k100Customer, setK100Customer] = useState(initial.kuaidi100.customer);
  const [k100Key, setK100Key] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      try {
        await saveExpressSettingsAction({
          kdniaoEbusinessId: kdEbId,
          kdniaoAppKey: kdAppKey,
          kuaidi100Customer: k100Customer,
          kuaidi100Key: k100Key
        });
        toast.success("配置已保存");
        setKdAppKey("");
        setK100Key("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  const clearKdniao = () => {
    if (!confirm("清除快递鸟密钥？")) return;
    startTransition(async () => {
      try {
        await saveExpressSettingsAction({ kdniaoClearKey: true });
        toast.success("已清除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  const clearKd100 = () => {
    if (!confirm("清除快递100密钥？")) return;
    startTransition(async () => {
      try {
        await saveExpressSettingsAction({ kuaidi100ClearKey: true });
        toast.success("已清除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="ll-surface rounded-lg border border-border p-5">
        <header className="mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-lg italic">快递接入</h2>
        </header>
        <p className="mb-4 text-[12px] text-muted-foreground">
          双 provider：优先 <span className="text-foreground/85">快递鸟</span>（500 条/日免费），
          失败时降级到 <span className="text-foreground/85">快递100</span>。
          配置任一即可使用。
        </p>

        {/* 快递鸟 */}
        <div className="mb-5 rounded-md border border-border bg-muted/20 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[13px] font-medium">快递鸟（主，推荐）</h3>
            {initial.kdniao.configured && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                已配置
              </span>
            )}
            <a
              href="https://www.kdniao.com/"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              申请
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px]">EBusinessID（用户 ID）</Label>
              <Input
                value={kdEbId}
                onChange={(e) => setKdEbId(e.target.value)}
                placeholder="数字 ID"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px]">
                AppKey
                {initial.kdniao.configured && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    当前 {initial.kdniao.appKeyMasked}（留空保留）
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={kdAppKey}
                onChange={(e) => setKdAppKey(e.target.value)}
                placeholder={initial.kdniao.configured ? "如需更换请粘贴新 AppKey" : "AppKey"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
          </div>
          {initial.kdniao.configured && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={clearKdniao}
                className="inline-flex items-center gap-1 text-[10px] text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                清除 AppKey
              </button>
            </div>
          )}
        </div>

        {/* 快递100 */}
        <div className="rounded-md border border-border bg-muted/20 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[13px] font-medium">快递100（备用）</h3>
            {initial.kuaidi100.configured && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                已配置
              </span>
            )}
            <a
              href="https://api.kuaidi100.com/"
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              申请
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px]">Customer（授权码）</Label>
              <Input
                value={k100Customer}
                onChange={(e) => setK100Customer(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px]">
                Key
                {initial.kuaidi100.configured && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    当前 {initial.kuaidi100.keyMasked}（留空保留）
                  </span>
                )}
              </Label>
              <Input
                type="password"
                value={k100Key}
                onChange={(e) => setK100Key(e.target.value)}
                placeholder={initial.kuaidi100.configured ? "如需更换请粘贴新 key" : "key"}
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
          </div>
          {initial.kuaidi100.configured && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={clearKd100}
                className="inline-flex items-center gap-1 text-[10px] text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                清除 Key
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            保存配置
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          密钥使用 AES-256-GCM 加密存入 SystemSetting，与文档加密复用同一密钥（
          <span className="font-mono">STORAGE_ENCRYPTION_KEY</span>）。前端永远不显示明文。
        </p>
      </section>
    </div>
  );
}
