"use client";

import { useState, useMemo, useTransition } from "react";
import { Inbox, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { parseSms, splitSmsBatch } from "@/lib/sms-parser";
import { parseAndSaveSms } from "@/server/sms/actions";
import { SMS_TYPE_CN, SMS_TYPE_ACCENT } from "./sms-types";

export function SmsPasteDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [batch, setBatch] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [pending, startTransition] = useTransition();

  // 实时预览
  const preview = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const messages = batch ? splitSmsBatch(trimmed) : [trimmed];
    return messages.slice(0, 5).map((m) => ({ raw: m, parsed: parseSms(m) }));
  }, [text, batch]);

  const submit = () => {
    if (!text.trim()) {
      toast.error("请粘贴短信内容");
      return;
    }
    startTransition(async () => {
      try {
        const res = await parseAndSaveSms({ rawText: text, batch, useAi });
        const aiHint = useAi && res.aiEnrichedCount > 0 ? `，AI 增强 ${res.aiEnrichedCount} 条` : "";
        toast.success(`已解析 ${res.count} 条${aiHint}`);
        setText("");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) setText("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            粘贴法院短信
          </DialogTitle>
          <DialogDescription className="text-xs">
            将 12368 / 法院 / 电子送达短信粘贴进来。多条短信用空行分隔，勾选&ldquo;批量&rdquo;逐条解析。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="原文粘贴在此..."
            rows={8}
            className="text-[12px] leading-relaxed"
            autoFocus
          />

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Checkbox
                checked={batch}
                onCheckedChange={(v) => setBatch(v === true)}
              />
              <span>多条短信（按空行分隔）—— 一次提交，逐条解析与匹配</span>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Checkbox
                checked={useAi}
                onCheckedChange={(v) => setUseAi(v === true)}
              />
              <span>
                用 AI 增强解析 <Sparkles className="inline h-3 w-3 text-primary" /> ——
                补 <span className="text-foreground/80">摘要 / 律师动作 / 紧急程度</span>
                （需先到 设置 → AI 接入 配置）
              </span>
            </label>
          </div>

          {preview.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                解析预览（前 {preview.length} 条）
              </div>
              <ul className="space-y-2">
                {preview.map((p, i) => {
                  const accent = SMS_TYPE_ACCENT[p.parsed.smsType];
                  return (
                    <li
                      key={i}
                      className="rounded border border-border bg-background p-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{ background: `${accent}1A`, color: accent }}
                        >
                          {SMS_TYPE_CN[p.parsed.smsType]}
                        </span>
                        {p.parsed.court && (
                          <span className="text-foreground/80">{p.parsed.court}</span>
                        )}
                        {p.parsed.caseNumbers.length > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {p.parsed.caseNumbers.join("、")}
                          </span>
                        )}
                      </div>
                      {p.parsed.summary && (
                        <p className="mt-1 line-clamp-2 text-muted-foreground">
                          {p.parsed.summary}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground/80">
                        {p.parsed.hearingDate && <span>开庭：{p.parsed.hearingDate}</span>}
                        {p.parsed.courtRoom && <span>{p.parsed.courtRoom}</span>}
                        {p.parsed.judge && <span>法官：{p.parsed.judge}</span>}
                        {p.parsed.urls.length > 0 && (
                          <span>{p.parsed.urls.length} 个链接</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || !text.trim()}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            解析并保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
