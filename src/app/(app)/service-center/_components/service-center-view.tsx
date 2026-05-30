"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Megaphone,
  FolderArchive,
  BookUser,
  Pin,
  Plus,
  Pencil,
  Archive,
  Calculator,
  Package,
  Compass,
  BookText
} from "lucide-react";
import type { FirmFileCategory, ExternalContactCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { FirmFilesView } from "@/app/(app)/firm-resources/_components/firm-files-view";
import { CalcView } from "@/app/(app)/tools/calc/_components/calc-view";
import { ExpressView } from "@/app/(app)/express/_components/express-view";
import { AnnouncementDialog } from "./announcement-dialog";
import { ExternalContactDialog } from "./external-contact-dialog";
import { archiveAnnouncement } from "@/server/announcements/actions";
import { archiveExternalContact } from "@/server/external-contacts/actions";
import { toast } from "sonner";

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  publishedAt: Date;
  expiresAt: Date | null;
  archivedAt: Date | null;
  author: { id: string; name: string };
};

type FirmFileItem = {
  id: string;
  name: string;
  description: string | null;
  category: FirmFileCategory;
  tags: string[];
  mimeType: string | null;
  size: number;
  uploadedBy: { id: string; name: string };
  createdAt: Date;
  hasNewerVersion: boolean;
  supersedesCount: number;
};

type ColleagueItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

type ExternalContactItem = {
  id: string;
  name: string;
  category: ExternalContactCategory;
  organization: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  createdBy: { id: string; name: string };
  createdAt: Date;
};

type Tab = "tools" | "express" | "firm-files" | "announcements" | "policy" | "contacts";

const TABS: { key: Tab | "legal-nav"; label: string; icon: typeof Megaphone; external?: string }[] = [
  { key: "tools", label: "实务工具", icon: Calculator },
  { key: "express", label: "快递跟踪", icon: Package },
  { key: "firm-files", label: "律所文书", icon: FolderArchive },
  { key: "legal-nav", label: "法律导航", icon: Compass, external: "https://yesen.cn" },
  { key: "announcements", label: "公告指引", icon: Megaphone },
  { key: "policy", label: "制度规范", icon: BookText },
  { key: "contacts", label: "通讯录", icon: BookUser }
];

const EXT_CATEGORY_LABEL: Record<ExternalContactCategory, string> = {
  COURT: "法院",
  PROSECUTOR: "检察院",
  POLICE: "公安",
  NOTARY: "公证处",
  ARBITRATION: "仲裁",
  OTHER_FIRM: "他所律师",
  EXPERT: "鉴定专家",
  OTHER: "其他"
};

export function ServiceCenterView({
  currentUserId,
  currentUserRole,
  isManager,
  tab,
  announcements,
  firmFiles,
  firmFileCategory,
  firmFileSearch,
  includeSuperseded,
  colleagues,
  externalContacts,
  express
}: {
  currentUserId: string;
  currentUserRole: string;
  isManager: boolean;
  tab: Tab;
  announcements: AnnouncementItem[];
  firmFiles: FirmFileItem[];
  firmFileCategory?: FirmFileCategory;
  firmFileSearch: string;
  includeSuperseded: boolean;
  colleagues: ColleagueItem[];
  externalContacts: ExternalContactItem[];
  express: React.ComponentProps<typeof ExpressView>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function switchTab(next: Tab) {
    const params = new URLSearchParams();
    params.set("tab", next);
    router.push(`/service-center?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <div>
          <h1 className="text-base font-medium">应用</h1>
          <p className="text-xs text-muted-foreground">
            实务工具 · 快递跟踪 · 律所文书 · 公告指引 · 制度规范 · 通讯录
          </p>
        </div>
      </header>

      {/* tabs */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          if (t.external) {
            return (
              <a
                key={t.key}
                href={t.external}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {t.label}
              </a>
            );
          }
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key as Tab)}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "tools" && <CalcView hideHeader />}

      {tab === "express" && <ExpressView {...express} hideHeader />}

      {tab === "firm-files" && (
        <FirmFilesView
          files={firmFiles}
          canUpload={isManager}
          currentCategory={firmFileCategory}
          currentSearch={firmFileSearch}
          includeSuperseded={includeSuperseded}
          basePath="/service-center"
          preservedParams={["tab"]}
          hideHeader
        />
      )}

      {tab === "announcements" && (
        <AnnouncementsTab
          items={announcements}
          isManager={isManager}
          currentUserId={currentUserId}
        />
      )}

      {/* 制度规范 = 律所文书里的「制度(POLICY)」分类，只列文件、不显分类 */}
      {tab === "policy" && (
        <FirmFilesView
          files={firmFiles.filter((f) => f.category === "POLICY")}
          canUpload={isManager}
          currentCategory="POLICY"
          currentSearch={firmFileSearch}
          includeSuperseded={includeSuperseded}
          basePath="/service-center"
          preservedParams={["tab"]}
          hideHeader
          hideCategoryNav
        />
      )}

      {tab === "contacts" && (
        <ContactsTab
          colleagues={colleagues}
          externalContacts={externalContacts}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      )}
    </div>
  );
}

function AnnouncementsTab({
  items,
  isManager,
  currentUserId
}: {
  items: AnnouncementItem[];
  isManager: boolean;
  currentUserId: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementItem | null>(null);
  const router = useRouter();

  async function handleArchive(a: AnnouncementItem) {
    if (!confirm(`归档公告"${a.title}"？归档后不再显示但保留历史。`)) return;
    try {
      await archiveAnnouncement(a.id);
      toast.success("已归档");
      router.refresh();
    } catch (err) {
      toast.error("归档失败", { description: err instanceof Error ? err.message : "" });
    }
  }

  const active = items.filter((a) => !a.archivedAt);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 {active.length} 条公告 · 置顶公告会显示在全站顶部 banner
        </p>
        {isManager && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            发布公告
          </Button>
        )}
      </header>

      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-background py-8 text-center text-xs text-muted-foreground">
          暂无公告
        </p>
      ) : (
        <ul className="space-y-2">
          {active.map((a) => {
            const canEdit = isManager || a.author.id === currentUserId;
            const expired = a.expiresAt && new Date(a.expiresAt) < new Date();
            return (
              <li
                key={a.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <header className="mb-1.5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {a.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        <Pin className="h-2.5 w-2.5" />置顶
                      </span>
                    )}
                    <h3 className="text-sm font-medium">{a.title}</h3>
                    {expired && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        已过期
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(a);
                          setDialogOpen(true);
                        }}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(a)}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </header>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">
                  {a.content}
                </p>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {a.author.name} · 发布于 {formatDate(a.publishedAt)}
                  {a.expiresAt && ` · 过期于 ${formatDate(a.expiresAt)}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </section>
  );
}

function ContactsTab({
  colleagues,
  externalContacts,
  currentUserId,
  currentUserRole
}: {
  colleagues: ColleagueItem[];
  externalContacts: ExternalContactItem[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalContactItem | null>(null);
  const [filter, setFilter] = useState<ExternalContactCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filteredExternal = externalContacts.filter((c) => {
    if (filter !== "ALL" && c.category !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hit =
        c.name.toLowerCase().includes(q) ||
        (c.organization && c.organization.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q));
      if (!hit) return false;
    }
    return true;
  });

  async function handleArchive(c: ExternalContactItem) {
    if (!confirm(`归档联系人"${c.name}"？`)) return;
    try {
      await archiveExternalContact(c.id);
      toast.success("已归档");
      router.refresh();
    } catch (err) {
      toast.error("归档失败", { description: err instanceof Error ? err.message : "" });
    }
  }

  return (
    <section className="space-y-6">
      {/* 同事 */}
      <div className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-medium">本所同事 ({colleagues.length})</h2>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {colleagues.map((u) => (
            <div
              key={u.id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-[11px] text-muted-foreground">{u.role}</div>
              <div className="mt-1 space-y-0.5 text-[11px] text-foreground/80">
                <div className="font-mono">{u.email}</div>
                {u.phone && <div className="font-mono">{u.phone}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 外部联系人 */}
      <div className="space-y-3">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">外部联系人 ({externalContacts.length})</h2>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            新增
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={cn(
              "rounded-full border px-3 py-0.5 text-[11px] transition-colors",
              filter === "ALL"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-input"
            )}
          >
            全部
          </button>
          {(Object.keys(EXT_CATEGORY_LABEL) as ExternalContactCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full border px-3 py-0.5 text-[11px] transition-colors",
                filter === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-input"
              )}
            >
              {EXT_CATEGORY_LABEL[c]}
            </button>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名 / 单位 / 电话"
            className="ml-auto h-8 w-48 rounded-md border border-border bg-background px-3 text-xs"
          />
        </div>

        {filteredExternal.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-background py-8 text-center text-xs text-muted-foreground">
            暂无匹配联系人
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filteredExternal.map((c) => {
              const canEdit =
                currentUserRole === "ADMIN" ||
                currentUserRole === "PRINCIPAL_LAWYER" ||
                c.createdBy.id === currentUserId;
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {EXT_CATEGORY_LABEL[c.category]}
                      </span>
                      {c.title && (
                        <span className="text-[11px] text-muted-foreground">{c.title}</span>
                      )}
                    </div>
                    {c.organization && (
                      <div className="text-[11px] text-foreground/80">{c.organization}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground/80">
                      {c.phone && <span className="font-mono">{c.phone}</span>}
                      {c.email && <span className="font-mono">{c.email}</span>}
                      {c.wechat && <span>微信 {c.wechat}</span>}
                    </div>
                    {c.address && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{c.address}</div>
                    )}
                    {c.notes && (
                      <div className="mt-1 text-[11px] italic text-muted-foreground">{c.notes}</div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(c)}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                      >
                        <Archive className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExternalContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </section>
  );
}
