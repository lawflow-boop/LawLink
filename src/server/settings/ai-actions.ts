"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { audit } from "@/server/audit";
import {
  saveAiSettings as saveSettings,
  readPublicAiSettings,
  AI_DEFAULTS
} from "@/lib/ai/settings";
import { aiChat, AiNotConfiguredError } from "@/lib/ai/client";

const saveSchema = z.object({
  apiKey: z.string().optional().or(z.literal("")), // 留空 = 保留原值
  baseUrl: z.string().url().optional().or(z.literal("")),
  textModel: z.string().max(80).optional().or(z.literal("")),
  visionModel: z.string().max(80).optional().or(z.literal(""))
});

const clearSchema = z.object({ confirm: z.literal(true) });

async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("仅管理员可修改 AI 配置");
  }
  return session;
}

export async function getAiSettingsPublic() {
  await requireAdmin();
  return readPublicAiSettings();
}

export async function saveAiSettingsAction(input: z.infer<typeof saveSchema>) {
  const session = await requireAdmin();
  const data = saveSchema.parse(input);

  await saveSettings({
    apiKey: data.apiKey?.trim() || undefined,
    baseUrl: data.baseUrl?.trim() || undefined,
    textModel: data.textModel?.trim() || undefined,
    visionModel: data.visionModel?.trim() || undefined
  });

  await audit({
    userId: session.user.id,
    action: "AI_SETTINGS_SAVE",
    targetType: "SystemSetting",
    targetId: "aiSettings",
    detail: {
      changedKey: !!data.apiKey,
      baseUrl: data.baseUrl || null,
      textModel: data.textModel || null
    }
  });

  return { ok: true };
}

export async function clearAiKeyAction(input: z.infer<typeof clearSchema>) {
  const session = await requireAdmin();
  clearSchema.parse(input);

  await saveSettings({ clearKey: true });

  await audit({
    userId: session.user.id,
    action: "AI_SETTINGS_CLEAR_KEY",
    targetType: "SystemSetting",
    targetId: "aiSettings"
  });

  return { ok: true };
}

/** 测试连接：发一个 ping，验证 base_url + key + text_model 可用 */
export async function testAiConnection() {
  await requireAdmin();
  try {
    const res = await aiChat({
      messages: [
        { role: "system", content: "You are a connectivity probe. Reply only with 'pong'." },
        { role: "user", content: "ping" }
      ],
      maxTokens: 10,
      temperature: 0,
      timeoutMs: 10_000
    });
    const replyTrimmed = (res.content || "").slice(0, 100);
    return { ok: true, reply: replyTrimmed };
  } catch (e) {
    if (e instanceof AiNotConfiguredError) {
      return { ok: false, message: e.message };
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "未知错误"
    };
  }
}
