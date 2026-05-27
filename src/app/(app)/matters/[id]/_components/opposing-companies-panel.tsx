"use client";

/**
 * v0.26: 对方公司风险查询面板
 *
 * 列出案件 role=OPPOSING_PARTY 的当事人，允许：
 * - 绑定到元典企业（rh_enterpriseSearch，1 POINT/次）
 * - 查询企业聚合风险总览（rh_enterpriseAggregationSummary，10 POINT/次）
 * - 解绑
 *
 * 风险等级显示在卡片标题：高/中/低/无
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Search,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Scale,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  searchEnterpriseCandidates,
  bindPartyToEnterprise,
  unbindPartyEnterprise,
  getEnterpriseSummaryByParty,
  type EnterpriseSearchItem
} from "@/server/yuandian/enterprise";
import type { EnterpriseSummary, EnterpriseRiskLevel } from "@/lib/yuandian/enterprise";

type PartyLite = {
  id: string;
  name: string;
  enterpriseId: string | null;
  enterpriseSocialCode: string | null;
  enterpriseName: string | null;
  enterpriseBoundAt: Date | null;
};

export function OpposingCompaniesPanel({ parties }: { parties: PartyLite[] }) {
  const [bindPartyId, setBindPartyId] = useState<string | null>(null);
  const [summaryPartyId, setSummaryPartyId] = useState<string | null>(null);

  if (parties.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
        <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          本案暂无「对方当事人」
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          在收案中录入对方后可在此查询风险
        </p>
      </div>
    );
  }

  const bindParty = parties.find((p) => p.id === bindPartyId) ?? null;
  const summaryParty = parties.find((p) => p.id === summaryPartyId) ?? null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">对方公司风险</h3>
          <span className="text-[11px] text-muted-foreground">
            搜索 1 POINT · 风险总览 10 POINT / 次
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {parties.map((party) => (
            <PartyCard
              key={party.id}
              party={party}
              onBind={() => setBindPartyId(party.id)}
              onView={() => setSummaryPartyId(party.id)}
            />
          ))}
        </div>
      </div>

      <BindDialog
        party={bindParty}
        onOpenChange={(o) => !o && setBindPartyId(null)}
      />
      <SummaryDialog
        party={summaryParty}
        onOpenChange={(o) => !o && setSummaryPartyId(null)}
      />
    </>
  );
}

// ============================================================
// PartyCard
// ============================================================

function PartyCard({
  party,
  onBind,
  onView
}: {
  party: PartyLite;
  onBind: () => void;
  onView: () => void;
}) {
  const bound = !!party.enterpriseId || !!party.enterpriseSocialCode;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{party.name}</div>
          {bound ? (
            <div className="mt-0.5 space-y-0.5">
              {party.enterpriseName && party.enterpriseName !== party.name && (
                <div className="truncate text-xs text-muted-foreground">
                  元典：{party.enterpriseName}
                </div>
              )}
              {party.enterpriseSocialCode && (
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {party.enterpriseSocialCode}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-muted-foreground">未绑定元典企业</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {bound ? (
          <>
            <Button size="sm" className="h-7 flex-1 text-xs" onClick={onView}>
              <Scale className="mr-1 h-3 w-3" />
              查询风险（10 POINT）
            </Button>
            <UnbindButton partyId={party.id} />
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-xs"
            onClick={onBind}
          >
            <Link2 className="mr-1 h-3 w-3" />
            绑定元典企业
          </Button>
        )}
      </div>
    </div>
  );
}

function UnbindButton({ partyId }: { partyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function handle() {
    if (!confirm("解绑后查询风险需要重新绑定，是否继续？")) return;
    start(async () => {
      try {
        await unbindPartyEnterprise(partyId);
        toast.success("已解绑");
        router.refresh();
      } catch (err) {
        toast.error("解绑失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={handle}
      title="解绑元典企业"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Unlink className="h-3 w-3" />
      )}
    </Button>
  );
}

// ============================================================
// 绑定对话框：搜索企业候选 → 选定
// ============================================================

function BindDialog({
  party,
  onOpenChange
}: {
  party: PartyLite | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<EnterpriseSearchItem[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [searching, startSearch] = useTransition();
  const [binding, startBind] = useTransition();

  function handleSearch() {
    const q = keyword.trim();
    if (!q) return;
    startSearch(async () => {
      try {
        const r = await searchEnterpriseCandidates(q);
        setConfigured(r.configured);
        setItems(r.items);
        if (r.configured && r.items.length === 0) {
          toast.warning("未找到候选企业", { description: "试试更完整的名称或简称" });
        }
      } catch (err) {
        toast.error("搜索失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  function handlePick(item: EnterpriseSearchItem) {
    if (!party) return;
    startBind(async () => {
      try {
        await bindPartyToEnterprise({
          partyId: party.id,
          enterpriseId: item.id,
          socialCode: item.creditCode,
          enterpriseName: item.name
        });
        toast.success(`已绑定：${item.name}`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error("绑定失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  return (
    <Dialog
      open={!!party}
      onOpenChange={(o) => {
        if (!o) {
          setKeyword("");
          setItems(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            绑定元典企业
          </DialogTitle>
          <DialogDescription>
            {party && `为「${party.name}」匹配元典企业 — 绑定后可查询风险总览`}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <Alert variant="destructive">
            <AlertTitle className="text-xs">元典 API 未配置</AlertTitle>
            <AlertDescription className="text-xs">
              请到「设置 → AI 接入 → 元典」配置 API key
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="企业名 / 简称 / 曾用名"
            disabled={searching || binding}
            autoFocus
          />
          <Button
            onClick={handleSearch}
            disabled={searching || binding || !keyword.trim()}
            className="shrink-0"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {items && items.length > 0 && (
          <ScrollArea className="max-h-80 -mx-2 px-2">
            <div className="divide-y divide-border/60 rounded-md border border-border/60">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePick(item)}
                  disabled={binding}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {item.creditCode}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs text-primary"
                    asChild
                  >
                    <span>选定</span>
                  </Button>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        {keyword.trim() === "" && !items && (
          <p className="text-xs text-muted-foreground">
            提示：搜索 1 POINT/次；选定后正式绑定（免费），随后可查风险总览（10 POINT/次）。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 风险总览对话框
// ============================================================

function SummaryDialog({
  party,
  onOpenChange
}: {
  party: PartyLite | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<EnterpriseSummary | null>(null);
  const [loading, startLoad] = useTransition();
  const [configured, setConfigured] = useState(true);
  const [auxOpen, setAuxOpen] = useState(false);

  // open 时按需加载
  function ensureLoaded() {
    if (!party || data) return;
    startLoad(async () => {
      try {
        const r = await getEnterpriseSummaryByParty(party.id);
        setConfigured(r.configured);
        setData(r.summary);
        if (r.configured && !r.summary) {
          toast.warning("元典未返回企业聚合数据");
        }
      } catch (err) {
        toast.error("查询失败", {
          description: err instanceof Error ? err.message : ""
        });
      }
    });
  }

  // dialog 打开时立即加载（避免空白）
  if (party && !data && !loading && configured) {
    ensureLoaded();
  }

  return (
    <Dialog
      open={!!party}
      onOpenChange={(o) => {
        if (!o) {
          setData(null);
          setAuxOpen(false);
          setConfigured(true);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            企业风险总览
            {data && <RiskBadge level={data.level} />}
          </DialogTitle>
          <DialogDescription>
            {party && `${party.enterpriseName ?? party.name}`}
            {data && (
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {data.id}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <Alert variant="destructive">
            <AlertTitle className="text-xs">元典 API 未配置</AlertTitle>
            <AlertDescription className="text-xs">
              请到「设置 → AI 接入 → 元典」配置 API key
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">查询中（约 3-10 秒）</span>
          </div>
        )}

        {!loading && data && (
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-5">
              {/* 核心风险 */}
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  核心风险
                </h4>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {data.coreRisks.map((s) => (
                    <RiskTile key={s.category} stat={s} />
                  ))}
                </div>
              </section>

              {/* 涉诉概况 */}
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Scale className="h-3.5 w-3.5" />
                  涉诉概况
                </h4>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {data.litigation.map((s) => (
                    <LitigationTile key={s.category} stat={s} />
                  ))}
                </div>
                {data.litigation.find((s) => s.category === "法院公告" || s.category === "开庭公告") && (
                  <CourtRoleSummary stats={data.litigation} />
                )}
              </section>

              {/* 辅助信息（默认折叠） */}
              <section>
                <button
                  type="button"
                  onClick={() => setAuxOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {auxOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  辅助信息（{data.auxiliary.filter((s) => s.total > 0).length}/{data.auxiliary.length}）
                </button>
                {auxOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {data.auxiliary.map((s) => (
                      <AuxTile key={s.category} stat={s} />
                    ))}
                  </div>
                )}
              </section>

              <p className="border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                数据来自元典开放平台 · 风险等级仅作律师初步判断参考 · 具体明细可在元典平台查看
              </p>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 小组件：风险等级 chip / 单项 tile
// ============================================================

function RiskBadge({ level }: { level: EnterpriseRiskLevel }) {
  const map: Record<EnterpriseRiskLevel, { label: string; cls: string }> = {
    HIGH: {
      label: "高风险",
      cls: "bg-destructive/15 text-destructive border-destructive/30"
    },
    MEDIUM: {
      label: "中风险",
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30"
    },
    LOW: {
      label: "低风险",
      cls: "bg-blue-500/15 text-blue-700 border-blue-500/30"
    },
    NONE: {
      label: "无核心风险",
      cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    }
  };
  const m = map[level];
  return (
    <Badge variant="outline" className={cn("text-[11px]", m.cls)}>
      {m.label}
    </Badge>
  );
}

function RiskTile({
  stat
}: {
  stat: { category: string; total: number; top?: { key: string; count: number }[] };
}) {
  const isRed = stat.total > 0;
  return (
    <div
      className={cn(
        "rounded-md border p-2.5",
        isRed
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/30"
      )}
    >
      <div className="text-[11px] text-muted-foreground">{stat.category}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-lg leading-none",
          isRed ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {stat.total}
      </div>
      {stat.top && stat.top.length > 0 && (
        <div className="mt-1.5 line-clamp-1 text-[10px] text-muted-foreground/80">
          {stat.top[0].key}：{stat.top[0].count}
        </div>
      )}
    </div>
  );
}

function LitigationTile({
  stat
}: {
  stat: {
    category: string;
    total: number;
    asPlaintiff?: number;
    asDefendant?: number;
  };
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="text-[11px] text-muted-foreground">{stat.category}</div>
      <div className="mt-0.5 font-mono text-lg leading-none">{stat.total}</div>
      {(stat.asPlaintiff !== undefined || stat.asDefendant !== undefined) && (
        <div className="mt-1.5 text-[10px] text-muted-foreground/80">
          起诉 {stat.asPlaintiff ?? 0} · 应诉 {stat.asDefendant ?? 0}
        </div>
      )}
    </div>
  );
}

function CourtRoleSummary({
  stats
}: {
  stats: {
    category: string;
    asPlaintiff?: number;
    asDefendant?: number;
  }[];
}) {
  const totalPlaintiff = stats.reduce(
    (a, s) => a + (s.asPlaintiff ?? 0),
    0
  );
  const totalDefendant = stats.reduce(
    (a, s) => a + (s.asDefendant ?? 0),
    0
  );
  if (totalPlaintiff + totalDefendant === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-md bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
      <ExternalLink className="h-3 w-3" />
      <span>
        合计：起诉方 <b className="font-mono text-foreground">{totalPlaintiff}</b> 次 · 应诉方{" "}
        <b className="font-mono text-foreground">{totalDefendant}</b> 次
      </span>
    </div>
  );
}

function AuxTile({
  stat
}: {
  stat: { category: string; total: number; top?: { key: string; count: number }[] };
}) {
  const empty = stat.total === 0;
  return (
    <div
      className={cn(
        "rounded-md border border-border p-2",
        empty && "opacity-50"
      )}
    >
      <div className="text-[11px] text-muted-foreground">{stat.category}</div>
      <div className="mt-0.5 font-mono text-sm leading-none">{stat.total}</div>
      {stat.top && stat.top.length > 0 && (
        <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/70">
          {stat.top[0].key}：{stat.top[0].count}
        </div>
      )}
    </div>
  );
}
