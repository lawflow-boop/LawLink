"use client";

import { useState, useTransition } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, Loader2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveAiSettingsAction,
  clearAiKeyAction,
  testAiConnection
} from "@/server/settings/ai-actions";

type Initial = {
  configured: boolean;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  apiKeyMasked: string;
};

const PROVIDER_PRESETS = [
  {
    name: "通义千问（推荐）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    text: "qwen-turbo",
    vision: "qwen-vl-max",
    apply: "阿里云百炼控制台获取 key",
    link: "https://bailian.console.aliyun.com/"
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    text: "deepseek-chat",
    vision: "deepseek-chat",
    apply: "DeepSeek 平台获取 key",
    link: "https://platform.deepseek.com/api_keys"
  },
  {
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    text: "moonshot-v1-8k",
    vision: "moonshot-v1-8k-vision-preview",
    apply: "Moonshot 平台获取 key",
    link: "https://platform.moonshot.cn/"
  },
  {
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    text: "glm-4-flash",
    vision: "glm-4v",
    apply: "智谱开放平台获取 key",
    link: "https://open.bigmodel.cn/"
  },
  {
    name: "本地 Ollama",
    baseUrl: "http://localhost:11434/v1",
    text: "qwen2.5:7b",
    vision: "llava:7b",
    apply: "本机起 ollama 即用，无需 key",
    link: "https://ollama.com/"
  }
] as const;

export function AiSettingsForm({
  initial,
  defaults
}: {
  initial: Initial;
  defaults: { baseUrl: string; textModel: string; visionModel: string };
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl || defaults.baseUrl);
  const [textModel, setTextModel] = useState(initial.textModel || defaults.textModel);
  const [visionModel, setVisionModel] = useState(initial.visionModel || defaults.visionModel);
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const applyPreset = (p: (typeof PROVIDER_PRESETS)[number]) => {
    setBaseUrl(p.baseUrl);
    setTextModel(p.text);
    setVisionModel(p.vision);
    toast.info(`已应用 ${p.name} 默认配置，请填入对应 API key`);
  };

  const save = () => {
    startTransition(async () => {
      try {
        await saveAiSettingsAction({
          apiKey,
          baseUrl,
          textModel,
          visionModel
        });
        toast.success("配置已保存");
        setApiKey(""); // 不在前端持久 key
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  const clearKey = () => {
    if (!confirm("确认清除已保存的 API key？所有依赖 AI 的功能将停止工作。")) return;
    startTransition(async () => {
      try {
        await clearAiKeyAction({ confirm: true });
        toast.success("API key 已清除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "失败");
      }
    });
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection();
      if (res.ok) {
        setTestResult({ ok: true, msg: `连接成功，模型回复："${res.reply}"` });
      } else {
        setTestResult({ ok: false, msg: res.message ?? "未知错误" });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "网络错误" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="ll-surface rounded-lg border border-border p-5">
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.8} />
          <h2 className="text-lg italic">AI 接入</h2>
          {initial.configured && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> 已配置
            </span>
          )}
        </header>

        <p className="mb-4 text-[12px] text-muted-foreground">
          走 OpenAI 兼容协议，支持任意兼容 endpoint。配置后可启用：
          <span className="text-foreground/85"> 发票 OCR · 法院短信 AI 增强解析</span>
          （后续模块也会复用同一组配置）
        </p>

        {/* Provider 预设 */}
        <div className="mb-4">
          <Label className="text-[11px]">快速预设</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">
              API Key
              {initial.configured && (
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  当前：{initial.apiKeyMasked}（留空保留原值）
                </span>
              )}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial.configured ? "如需更换粘贴新 key" : "粘贴 API key"}
              className="mt-1 font-mono"
              autoComplete="off"
            />
          </div>

          <div>
            <Label className="text-[11px]">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={defaults.baseUrl}
              className="mt-1 font-mono text-[12px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[11px]">文本模型</Label>
              <Input
                value={textModel}
                onChange={(e) => setTextModel(e.target.value)}
                placeholder={defaults.textModel}
                className="mt-1 font-mono text-[12px]"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">用于法院短信 AI 解析等</p>
            </div>
            <div>
              <Label className="text-[11px]">视觉模型</Label>
              <Input
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                placeholder={defaults.visionModel}
                className="mt-1 font-mono text-[12px]"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">用于发票 OCR 等</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            保存配置
          </Button>
          <Button
            variant="outline"
            onClick={runTest}
            disabled={testing || !initial.configured}
            className="gap-1.5"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            测试连接
          </Button>
          {initial.configured && (
            <Button
              variant="ghost"
              onClick={clearKey}
              disabled={pending}
              className="ml-auto gap-1 text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              清除 key
            </Button>
          )}
        </div>

        {testResult && (
          <div
            className={
              "mt-3 flex items-start gap-2 rounded-md border p-3 text-[12px] " +
              (testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                : "border-destructive/30 bg-destructive/10 text-destructive")
            }
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{testResult.msg}</span>
          </div>
        )}
      </section>

      <section className="ll-surface rounded-lg border border-border p-5">
        <h3 className="mb-3 text-base italic">获取 API key</h3>
        <ul className="space-y-2 text-[12px]">
          {PROVIDER_PRESETS.map((p) => (
            <li key={p.name} className="flex items-baseline gap-3">
              <span className="w-28 shrink-0 text-foreground/85">{p.name}</span>
              <span className="text-muted-foreground">{p.apply}</span>
              <a
                href={p.link}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
              >
                打开
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          密钥使用 AES-256-GCM 加密存入 SystemSetting，与文档加密复用同一密钥（
          <span className="font-mono">STORAGE_ENCRYPTION_KEY</span>）。前端永远不显示明文 key。
        </p>
      </section>
    </div>
  );
}
