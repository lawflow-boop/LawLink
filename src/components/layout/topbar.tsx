"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Search,
  ChevronDown,
  Plus,
  LogOut,
  User,
  Settings as SettingsIcon,
  Menu,
  LayoutGrid,
  Calculator,
  Package,
  FolderArchive,
  Contact,
  Compass,
  Megaphone,
  BookText,
  Bell
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  ADMIN: "系统管理员",
  PRINCIPAL_LAWYER: "主办律师",
  LAWYER: "经办律师",
  ASSISTANT: "助理",
  FINANCE: "财务"
};

const APP_ITEMS = [
  { label: "实务工具", href: "/tools/calc", icon: Calculator, external: false },
  { label: "快递跟踪", href: "/express", icon: Package, external: false },
  { label: "律所文书", href: "/firm-resources", icon: FolderArchive, external: false },
  { label: "法律导航", href: "https://yesen.cn", icon: Compass, external: false },
  { label: "公告指引", href: "/announcements", icon: Megaphone, external: false },
  { label: "制度规范", href: "/policy", icon: BookText, external: false },
  { label: "通讯录", href: "/contacts", icon: Contact, external: false }
] as const;

export function Topbar({ onMobileMenuToggle, userAvatar }: { onMobileMenuToggle?: () => void; userAvatar?: string | null }) {
  const { data: session } = useSession();
  const user = session?.user;
  const displayName = user?.name ?? "";
  const roleLabel = user?.role ? (roleLabels[user.role] ?? user.role) : "";
  const initial = displayName ? displayName.charAt(0) : "?";

  useEffect(() => {
    const navigate = (event: PointerEvent | MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-lawlink-href]") : null;
      const href = target?.dataset.lawlinkHref;
      if (!href) return;
      event.preventDefault();
      window.location.assign(href);
    };

    document.addEventListener("pointerdown", navigate, true);
    document.addEventListener("click", navigate, true);
    return () => {
      document.removeEventListener("pointerdown", navigate, true);
      document.removeEventListener("click", navigate, true);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-border bg-background px-4 sm:px-6">
      {onMobileMenuToggle && (
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label="打开菜单"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* 主用平台稳定性优先：搜索使用原生 GET 表单，避免 Radix/React hydration 异常导致右上角不可点。 */}
      <form action="/matters" method="get" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-left sm:w-64 sm:flex-initial">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <input
          name="search"
          aria-label="全局搜索"
          placeholder="搜索案件、客户、材料..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">
          搜索
        </button>
      </form>

      <div className="flex-1 hidden sm:block" />

      <div className="flex items-center gap-1.5">
        <nav
          aria-label="应用快捷入口"
          className="hidden items-center gap-1 rounded-md border border-border bg-card/60 px-1 py-0.5 lg:flex"
        >
          <span className="inline-flex h-7 items-center gap-1 px-1 text-[12px] text-muted-foreground">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
            应用
          </span>
          {APP_ITEMS.map((it) => {
            const shortLabel = it.label
              .replace("实务工具", "工具")
              .replace("快递跟踪", "快递")
              .replace("律所文书", "文书")
              .replace("法律导航", "导航")
              .replace("公告指引", "公告")
              .replace("制度规范", "制度");
            const go = () => window.location.assign(it.href);

            return (
              <button
                key={it.label}
                type="button"
                title={it.label}
                data-lawlink-href={it.href}
                onPointerDown={(event) => {
                  event.preventDefault();
                  go();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  go();
                }}
                className="pointer-events-auto inline-flex h-7 items-center gap-1 rounded px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <it.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                <span>{shortLabel}</span>
              </button>
            );
          })}
        </nav>

        <Link
          href="/matters?tab=intake&new=1"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">新建收案</span>
        </Link>

        <div className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

        <Link
          href="/notifications"
          aria-label="通知"
          title="通知"
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
      </div>

      <details className="group relative">
        <summary
          className={cn(
            "flex h-8 cursor-pointer list-none items-center gap-2 rounded-md border border-border pl-1 pr-2.5",
            "transition-colors hover:bg-muted"
          )}
          aria-label="用户菜单"
        >
          <Avatar className="h-6 w-6">
            {userAvatar ? <AvatarImage src={userAvatar} alt={displayName} /> : null}
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-[13px] font-medium sm:inline">{displayName || "..."}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-open:rotate-180" strokeWidth={2} />
        </summary>
        <div className="absolute right-0 z-50 mt-2 hidden w-52 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md group-open:block">
          <div className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
            {displayName ? `${displayName} · ${roleLabel}` : "加载中..."}
          </div>
          <div className="my-1 h-px bg-border" />
          <Link href="/settings/profile" className="flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
            <User className="mr-2 h-4 w-4" />
            个人信息
          </Link>
          <Link href="/settings" className="flex items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
            <SettingsIcon className="mr-2 h-4 w-4" />
            偏好设置
          </Link>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/api/auth/signout?callbackUrl=/login"
            className="flex items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-muted"
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </Link>
        </div>
      </details>
    </header>
  );
}
