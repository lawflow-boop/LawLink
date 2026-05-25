"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { ChevronRight, ChevronsUpDown, Loader2, X } from "lucide-react";
import type { MatterCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchCauses, type CauseSearchResult } from "@/server/causes/actions";
import { cn } from "@/lib/utils";

type Node = CauseSearchResult;

type Props = {
  value: string;
  onChange: (id: string, name: string) => void;
  category: MatterCategory;
  disabled?: boolean;
};

/**
 * v0.16: 案由级联选择器（参考用户提供的 cascade 截图）
 * - 一次性拉本 category 全部案由（level 1-4）
 * - 4 列级联：诉讼类型 / 一级 / 二级 / 三级（带四级）
 * - 顶部搜索可跨级搜索；选中后自动定位到对应层级
 */
export function CauseCombobox({ value, onChange, category, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [isPending, startTransition] = useTransition();
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedL2, setSelectedL2] = useState<string | null>(null);

  const [pickedL1, setPickedL1] = useState<string | null>(null);
  const [pickedL2, setPickedL2] = useState<string | null>(null);
  const [pickedL3, setPickedL3] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState<string>("");

  // 打开时拉全量
  function handleOpen(o: boolean) {
    setOpen(o);
    if (o && allNodes.length === 0) {
      startTransition(async () => {
        const data = await searchCauses({ category, limit: 2000 });
        setAllNodes(data);
      });
    }
    if (o) {
      // 重置 picked 状态（避免上次残留）
      setPickedL1(null);
      setPickedL2(null);
      setPickedL3(null);
      setSearchInput("");
    }
  }

  // category 变化时重置
  useEffect(() => {
    setAllNodes([]);
    if (value) {
      onChange("", "");
      setSelectedName("");
      setSelectedL2(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // 同步显示已选名字 / l2 路径
  useEffect(() => {
    if (value && allNodes.length > 0) {
      const found = allNodes.find((o) => o.id === value);
      if (found) {
        setSelectedName(found.name);
        setSelectedL2(found.l2Name);
      }
    }
  }, [value, allNodes]);

  const l1Nodes = useMemo(() => allNodes.filter((n) => n.level === 1), [allNodes]);
  const l2Nodes = useMemo(
    () => (pickedL1 ? allNodes.filter((n) => n.level === 2 && n.parentId === pickedL1) : []),
    [allNodes, pickedL1]
  );
  const l3Nodes = useMemo(
    () => (pickedL2 ? allNodes.filter((n) => n.level === 3 && n.parentId === pickedL2) : []),
    [allNodes, pickedL2]
  );
  const l4Nodes = useMemo(
    () => (pickedL3 ? allNodes.filter((n) => n.level === 4 && n.parentId === pickedL3) : []),
    [allNodes, pickedL3]
  );

  // 搜索过滤（跨级模糊）
  const searchMatched = useMemo(() => {
    const q = searchInput.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    return allNodes
      .filter((n) => n.level >= 3 && n.name.toLowerCase().includes(lower))
      .slice(0, 60);
  }, [allNodes, searchInput]);

  function pickNode(node: Node) {
    onChange(node.id, node.name);
    setSelectedName(node.name);
    setSelectedL2(node.l2Name);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
        >
          {value && selectedName ? (
            <span className="flex min-w-0 items-baseline gap-1.5">
              {selectedL2 && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {selectedL2} /
                </span>
              )}
              <span className="truncate">{selectedName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">点击展开案由分级选择</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[820px] p-0"
        align="start"
      >
        {/* 搜索栏 */}
        <div className="border-b border-border p-2">
          <div className="relative">
            <Input
              placeholder="搜索（跨级模糊匹配）或在下方按层级浏览"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 pr-7 text-xs"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {isPending ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="ml-2">加载案由库...</span>
          </div>
        ) : searchMatched ? (
          // 搜索模式：扁平结果带路径
          <div className="max-h-[360px] overflow-y-auto p-1">
            {searchMatched.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">未找到匹配</p>
            ) : (
              searchMatched.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pickNode(n)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-muted/60"
                >
                  <span className="truncate">{n.name}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">
                    {[n.l1Name, n.l2Name].filter(Boolean).join(" / ")}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          // 级联模式：3-4 列（一级 / 二级 / 三级 / 四级）
          <div className="grid grid-cols-3 divide-x divide-border lg:grid-cols-4">
            <Column
              title="一级"
              items={l1Nodes}
              activeId={pickedL1}
              onPick={(n) => {
                setPickedL1(n.id);
                setPickedL2(null);
                setPickedL3(null);
              }}
            />
            <Column
              title="二级"
              items={l2Nodes}
              activeId={pickedL2}
              empty={pickedL1 ? "无二级" : "← 先选一级"}
              onPick={(n) => {
                setPickedL2(n.id);
                setPickedL3(null);
              }}
              onDouble={pickNode}
            />
            <Column
              title="三级"
              items={l3Nodes}
              activeId={pickedL3}
              empty={pickedL2 ? "无三级" : "← 先选二级"}
              onPick={(n) => {
                // 没有四级 → 直接选中
                const hasChildren = allNodes.some(
                  (x) => x.level === 4 && x.parentId === n.id
                );
                if (hasChildren) {
                  setPickedL3(n.id);
                } else {
                  pickNode(n);
                }
              }}
              onDouble={pickNode}
            />
            <Column
              title="四级"
              items={l4Nodes}
              activeId={null}
              empty={pickedL3 ? "无四级" : "无"}
              onPick={pickNode}
              className="hidden lg:block"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Column({
  title,
  items,
  activeId,
  empty = "—",
  onPick,
  onDouble,
  className
}: {
  title: string;
  items: Node[];
  activeId: string | null;
  empty?: string;
  onPick: (n: Node) => void;
  onDouble?: (n: Node) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex max-h-[360px] flex-col", className)}>
      <div className="border-b border-border bg-muted/30 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground/60">{empty}</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onPick(n)}
              onDoubleClick={() => onDouble?.(n)}
              className={cn(
                "flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors",
                activeId === n.id
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-muted/60"
              )}
            >
              <span className="truncate">{n.name}</span>
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 text-muted-foreground/50",
                  activeId === n.id && "text-primary"
                )}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
