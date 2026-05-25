"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Search,
  ChevronDown,
  Plus,
  LogOut,
  User,
  Settings as SettingsIcon,
  ShieldCheck,
  Menu
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ConflictDialog } from "@/components/conflict-dialog";
import { NotificationPopover } from "@/components/layout/notification-popover";
import { SearchDialog } from "@/components/layout/search-dialog";
import { cn } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  ADMIN: "系统管理员",
  PRINCIPAL_LAWYER: "主办律师",
  LAWYER: "经办律师",
  ASSISTANT: "助理",
  FINANCE: "财务"
};

export function Topbar({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const user = session?.user;
  const displayName = user?.name ?? "";
  const roleLabel = user?.role ? (roleLabels[user.role] ?? user.role) : "";
  const initial = displayName ? displayName.charAt(0) : "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-border bg-background px-4 sm:px-6">
      {/* 移动端汉堡菜单 */}
      {onMobileMenuToggle && (
        <button
          onClick={onMobileMenuToggle}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label="打开菜单"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      {/* 搜索 */}
      <button
        onClick={() => setSearchOpen(true)}
        className={cn(
          "flex h-8 w-48 items-center gap-2 rounded-md border border-border bg-card px-3 text-left sm:w-72",
          "text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
        )}
        aria-label="全局搜索 (Cmd+K)"
      >
        <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span className="flex-1 truncate">搜索案件、客户、材料...</span>
        <kbd className="hidden h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* 工具按钮组 */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConflictOpen(true)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px]",
            "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          )}
          title="利益冲突检索"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
          利益冲突
        </button>

        <Button
          size="sm"
          onClick={() => router.push("/matters?tab=intake&new=1")}
          className="h-8 gap-1.5 px-3 text-[13px]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          新建收案
        </Button>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <NotificationPopover />
      </div>

      {/* 用户 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex h-8 items-center gap-2 rounded-md border border-border pl-1 pr-2.5",
              "transition-colors hover:bg-muted"
            )}
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-[13px] font-medium">{displayName || "..."}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {displayName ? `${displayName} · ${roleLabel}` : "加载中..."}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings/profile" className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              个人信息
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
              <SettingsIcon className="mr-2 h-4 w-4" />
              偏好设置
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              signOut({ callbackUrl: "/login" });
            }}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
