import Link from "next/link";
import { Inbox, Shield, Gavel, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

type AlertItem = {
  id: string;
  source: "preservation" | "sms" | "hearing" | "deadline";
  title: string;
  detail: string;
  href: string;
  date: Date | null;
  tone: "danger" | "warn" | "ok" | "muted";
};

function classifyByDays(days: number): AlertItem["tone"] {
  if (days < 0) return "danger";
  if (days <= 3) return "danger";
  if (days <= 7) return "warn";
  if (days <= 30) return "muted";
  return "ok";
}

async function loadAlerts(userId: string | null): Promise<AlertItem[]> {
  const now = new Date();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);

  const [preservations, unprocessedSms, hearings, deadlines] = await Promise.all([
    prisma.preservation.findMany({
      where: {
        status: { in: ["ACTIVE", "RENEWED"] },
        expiryDate: { lte: in30 }
      },
      orderBy: { expiryDate: "asc" },
      take: 6,
      select: {
        id: true,
        respondent: true,
        expiryDate: true,
        matter: { select: { id: true, internalCode: true, title: true } }
      }
    }),
    userId
      ? prisma.smsMessage.findMany({
          where: { receivedById: userId, processed: false },
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: {
            id: true,
            smsType: true,
            parsedJson: true,
            receivedAt: true
          }
        })
      : Promise.resolve([]),
    prisma.hearing.findMany({
      where: {
        startsAt: { gte: now, lte: in7 },
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null }
        }
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: {
        procedure: {
          select: {
            matter: { select: { id: true, internalCode: true, title: true } }
          }
        }
      }
    }),
    prisma.deadline.findMany({
      where: {
        dueAt: { gte: now, lte: in7 },
        completed: false,
        procedure: {
          engagement: "ENGAGED",
          matter: { deletedAt: null }
        }
      },
      orderBy: { dueAt: "asc" },
      take: 5,
      include: {
        procedure: {
          select: {
            matter: { select: { id: true, internalCode: true, title: true } }
          }
        }
      }
    })
  ]);

  const items: AlertItem[] = [];

  for (const p of preservations) {
    const days = Math.ceil((p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const label = days < 0 ? `保全已过期 ${-days} 天` : days === 0 ? "保全今日到期" : `保全 ${days} 天后到期`;
    items.push({
      id: `pres-${p.id}`,
      source: "preservation",
      title: `${label} · ${p.respondent}`,
      detail: p.matter
        ? `${p.matter.internalCode} ${p.matter.title}`
        : "未关联案件（诉前保全）",
      href: p.matter ? `/matters/${p.matter.id}` : "/preservation",
      date: p.expiryDate,
      tone: classifyByDays(days)
    });
  }

  for (const m of unprocessedSms) {
    const parsed = (m.parsedJson as { summary?: string; court?: string } | null) ?? {};
    items.push({
      id: `sms-${m.id}`,
      source: "sms",
      title: parsed.summary || "未处理法院短信",
      detail: parsed.court ?? "—",
      href: "/inbox",
      date: m.receivedAt,
      tone: "warn"
    });
  }

  for (const h of hearings) {
    const days = Math.ceil((h.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const matter = h.procedure?.matter;
    items.push({
      id: `hr-${h.id}`,
      source: "hearing",
      title: `${days === 0 ? "今日开庭" : `${days} 天后开庭`} · ${h.title}`,
      detail: matter ? `${matter.internalCode} ${matter.title}` : "—",
      href: matter ? `/matters/${matter.id}` : "/schedule",
      date: h.startsAt,
      tone: classifyByDays(days)
    });
  }

  for (const d of deadlines) {
    const days = Math.ceil((d.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const matter = d.procedure?.matter;
    items.push({
      id: `dl-${d.id}`,
      source: "deadline",
      title: `${days === 0 ? "今日截止" : `${days} 天截止`} · ${d.title}`,
      detail: matter ? `${matter.internalCode} ${matter.title}` : "—",
      href: matter ? `/matters/${matter.id}` : "/schedule",
      date: d.dueAt,
      tone: classifyByDays(days)
    });
  }

  // 按 tone 优先（danger > warn > muted > ok），相同 tone 按时间近的优先
  const toneOrder = { danger: 0, warn: 1, muted: 2, ok: 3 };
  items.sort((a, b) => {
    if (toneOrder[a.tone] !== toneOrder[b.tone]) return toneOrder[a.tone] - toneOrder[b.tone];
    if (!a.date || !b.date) return 0;
    return a.date.getTime() - b.date.getTime();
  });

  return items.slice(0, 12);
}

const SOURCE_META: Record<AlertItem["source"], { icon: typeof Shield; label: string }> = {
  preservation: { icon: Shield, label: "保全" },
  sms: { icon: Inbox, label: "短信" },
  hearing: { icon: Gavel, label: "开庭" },
  deadline: { icon: Clock, label: "期限" }
};

export async function AlertsList() {
  const session = await getSession();
  const alerts = await loadAlerts(session?.user.id ?? null);

  return (
    <section className="ll-surface flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 className="text-lg font-medium tracking-tight">待我处理</h2>
        <Link
          href="/schedule"
          className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          全部
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      </header>

      <div className="border-t border-border flex-1 overflow-y-auto px-2 py-2">
        {alerts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mb-2 h-5 w-5 opacity-30" />
            暂无待处理事项
          </div>
        ) : (
          alerts.map((a) => {
            const M = SOURCE_META[a.source];
            const Icon = M.icon;
            return (
              <Link
                key={a.id}
                href={a.href}
                className="ll-row group flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors"
              >
                <span
                  className={cn(
                    "mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
                    a.tone === "danger" && "bg-red-500/12 text-red-600",
                    a.tone === "warn" && "bg-amber-500/15 text-amber-600",
                    a.tone === "muted" && "bg-muted/60 text-muted-foreground",
                    a.tone === "ok" && "bg-emerald-500/12 text-emerald-600"
                  )}
                >
                  <Icon className="h-3 w-3" strokeWidth={2} />
                </span>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-wider text-muted-foreground">
                      {M.label}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[13px] font-medium leading-tight">
                    {a.title}
                  </div>
                  <div className="mt-0.5 line-clamp-1 font-mono text-[10px] tracking-wide text-muted-foreground tabular">
                    {a.detail}
                  </div>
                </div>
                <ArrowRight
                  className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground"
                  strokeWidth={1.8}
                />
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
