"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [authError, setAuthError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCsrfToken() {
    const res = await fetch("/api/auth/csrf", { cache: "no-store" });
    const data = await res.json() as { csrfToken?: string };
    const token = data.csrfToken ?? "";
    if (token) setCsrfToken(token);
    return token;
  }

  useEffect(() => {
    loadCsrfToken().catch((err: unknown) => {
      console.error("[auth] 获取 CSRF token 失败:", err);
    });
  }, []);

  async function doLogin(form: HTMLFormElement) {
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(form);
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");

      if (!email || !password) {
        setAuthError("请填写邮箱和密码");
        return;
      }

      const token = csrfToken || await loadCsrfToken();
      const res = await fetch(`/api/auth/callback/credentials?callbackUrl=${encodeURIComponent(callbackUrl)}`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          csrfToken: token,
          email,
          password
        })
      });

      if (res.ok || res.redirected || res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        window.location.href = callbackUrl;
        return;
      }

      setAuthError("邮箱或密码错误");
    } catch (err) {
      console.error("[auth] 登录请求失败:", err);
      setAuthError("登录请求失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      id="lawlink-login-form"
      action={`/api/auth/callback/credentials?callbackUrl=${encodeURIComponent(callbackUrl)}`}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        void doLogin(event.currentTarget);
      }}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {authError ? (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">密码</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        id="lawlink-login-button"
        type="button"
        onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) void doLogin(form);
        }}
        disabled={isSubmitting}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {isSubmitting ? "登录中..." : "登录"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        忘记密码？联系系统管理员重置
      </p>
    </form>
  );
}
