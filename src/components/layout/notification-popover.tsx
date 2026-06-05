"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/server/notifications/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";

const typeIcons: Record<string, string> = {
  PRESERVATION_EXPIRY: "🛡️",
  HEARING_REMINDER: "⚖️",
  DEADLINE_REMINDER: "⏰",
  SEAL_STATUS_CHANGE: "🔖",
  SMS_ARRIVAL: "📩",
  TASK_ASSIGNED: "🔔",
  SYSTEM: "🔔",
  ARCHIVE_APPROVED: "📦",
  ARCHIVE_REJECTED: "📦",
};

const typeLabels: Record<string, string> = {
  PRESERVATION_EXPIRY: "保全到期",
  HEARING_REMINDER: "庭审",
  DEADLINE_REMINDER: "期限",
  SEAL_STATUS_CHANGE: "用章",
  SMS_ARRIVAL: "短信",
  TASK_ASSIGNED: "系统",
  SYSTEM: "系统",
  ARCHIVE_APPROVED: "归档",
  ARCHIVE_REJECTED: "归档",
};

const priorityColors: Record<string, string> = {
  URGENT: "text-red-600",
  HIGH: "text-orange-600",
  NORMAL: "",
  LOW: "text-muted-foreground",
};

export function NotificationPopover() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof getNotifications>>>([]);
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const router = useRouter();

  // 已弹过桌面通知的 id（含挂载时已存在的，避免刷新页面就刷屏）
  const seenIds = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  // 轮询：刷新未读数 + 对新到的未读通知弹浏览器桌面通知
  const poll = useCallback(async () => {
    try {
      const [count, list] = await Promise.all([
        getUnreadCount(),
        getNotifications({ limit: 20 })
      ]);
      setUnread(count);
      setNotifications(list);

      const unreadList = list.filter((n) => !n.read);
      if (!seededRef.current) {
        // 首次轮询：只记录现有 id，不弹（否则每次进站都炸一堆系统通知）
        unreadList.forEach((n) => seenIds.current.add(n.id));
        seededRef.current = true;
        return;
      }
      const canNotify =
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted";
      for (const n of unreadList) {
        if (seenIds.current.has(n.id)) continue;
        seenIds.current.add(n.id);
        if (canNotify) {
          const notif = new Notification(n.title, {
            body: n.content ?? undefined,
            tag: n.id,
            icon: "/favicon.ico"
          });
          if (n.href) {
            notif.onclick = () => {
              window.focus();
              router.push(n.href as string);
              notif.close();
            };
          }
        }
      }
    } catch {}
  }, [router]);

  useEffect(() => {
    // 请求桌面通知授权（用户可拒绝；拒绝后仅站内铃铛生效）
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    poll();
    const timer = setInterval(poll, 60_000);
    return () => clearInterval(timer);
  }, [poll]);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const list = await getNotifications({ limit: 20 });
      setNotifications(list);
    }
  };

  const handleMarkRead = async (id: string, href?: string | null) => {
    await markNotificationRead(id);
    setUnread((prev) => Math.max(0, prev - 1));
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true, readAt: new Date() } : n));
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date() })));
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-md border border-border",
            "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          )}
          aria-label="通知"
        >
          <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-medium text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">通知</span>
          {unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              全部已读
            </button>
          )}
        </div>
        {(() => {
          const presentTypes = Array.from(new Set(notifications.map((n) => n.type)));
          if (presentTypes.length <= 1) return null;
          return (
            <div className="flex flex-wrap gap-1 border-b px-3 py-1.5">
              <button
                onClick={() => setTypeFilter(null)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  typeFilter === null
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-input"
                )}
              >
                全部
              </button>
              {presentTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t === typeFilter ? null : t)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                    typeFilter === t
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-input"
                  )}
                >
                  {typeIcons[t] ?? "🔔"} {typeLabels[t] ?? t}
                </button>
              ))}
            </div>
          );
        })()}
        <div className="max-h-80 overflow-y-auto">
          {(() => {
            const list = typeFilter
              ? notifications.filter((n) => n.type === typeFilter)
              : notifications;
            if (list.length === 0) {
              return (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {typeFilter ? `没有「${typeLabels[typeFilter] ?? typeFilter}」类通知` : "暂无通知"}
                </div>
              );
            }
            return list.map((n) => (
              <button
                key={n.id}
                onClick={() => handleMarkRead(n.id, n.href)}
                className={cn(
                  "flex w-full gap-2.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted",
                  !n.read && "bg-primary/5"
                )}
              >
                <span className="mt-0.5 text-sm">{typeIcons[n.type] ?? "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[13px] leading-snug", !n.read && "font-medium", priorityColors[n.priority])}>
                    {n.title}
                  </div>
                  {n.content && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {n.content}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted-foreground/60">
                    {formatTime(n.createdAt)}
                  </div>
                </div>
                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            ));
          })()}
        </div>
        {notifications.length > 0 && (
          <div className="border-t px-3 py-2">
            <Link href="/notifications" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
              查看全部通知
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function formatTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
