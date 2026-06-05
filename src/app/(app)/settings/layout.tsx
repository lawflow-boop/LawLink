import Link from "next/link";
import { Settings, Users, Layers, ScrollText, KeyRound, Sparkles, Package, ListChecks, BellRing, Building2, FileUp } from "lucide-react";
import { getSession } from "@/lib/auth/session";

export default async function SettingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session?.user.role === "ADMIN";
  const isManager = isAdmin || session?.user.role === "PRINCIPAL_LAWYER";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Settings className="h-5 w-5 text-primary" />
          设置
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <nav className="lg:col-span-1">
          <ul className="space-y-0.5 rounded-xl border border-border bg-card p-2">
            <SettingsNavLink
              href="/settings/profile"
              icon={<KeyRound className="h-3.5 w-3.5" />}
            >
              个人 / 改密码
            </SettingsNavLink>
            {isManager && (
              <>
                <SettingsNavLink
                  href="/settings/reminders"
                  icon={<BellRing className="h-3.5 w-3.5" />}
                >
                  提醒维护
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/import"
                  icon={<FileUp className="h-3.5 w-3.5" />}
                >
                  批量导入
                </SettingsNavLink>
              </>
            )}
            {isAdmin && (
              <>
                <SettingsNavLink
                  href="/settings/firm-profile"
                  icon={<Building2 className="h-3.5 w-3.5" />}
                >
                  律所信息
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/users"
                  icon={<Users className="h-3.5 w-3.5" />}
                >
                  用户管理
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/templates"
                  icon={<Layers className="h-3.5 w-3.5" />}
                >
                  阶段模板
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/custom-fields"
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                >
                  自定义字段
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/ai"
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  AI 接入
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/express"
                  icon={<Package className="h-3.5 w-3.5" />}
                >
                  快递接入
                </SettingsNavLink>
                <SettingsNavLink
                  href="/settings/audit"
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                >
                  审计日志
                </SettingsNavLink>
              </>
            )}
          </ul>
        </nav>

        <div className="lg:col-span-4">{children}</div>
      </div>
    </div>
  );
}

function SettingsNavLink({
  href,
  icon,
  children
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-popover hover:text-foreground"
      >
        {icon}
        {children}
      </Link>
    </li>
  );
}
