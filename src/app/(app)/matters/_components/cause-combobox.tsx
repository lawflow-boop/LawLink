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
 * 案由级联选择器
 * - 一次性拉本 category 全部案由
 * - 去掉一级，从二级起级联：二级 / 三级 / 四级，渐进展开（选了上一级才出现下一列）
 * - 单击即选：有子级 → 展开下一列；无子级（叶子）→ 直接选中。两次点击可选到常见三级案由。
 * - 列宽收窄，弹层随列数增长，避免一打开就铺满整页
 * - 名称过长截断，hover 显示全名
 */
export function CauseCombobox({ value, onChange, category, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [isPending, startTransition] = useTransition();
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedL2, setSelectedL2] = useState<string | null>(null);

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

  // 去掉一级：二级直接平铺为第一列
  const l2Nodes = useMemo(() => allNodes.filter((n) => n.level === 2), [allNodes]);
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

  function hasChildren(n: Node) {
    return allNodes.some((x) => x.parentId === n.id);
  }

  // 选用一个案由：任意层级都可直接选中。
  // 有子级 → 选中并展开下一列（可继续下钻，也可就此停下）；叶子 → 选中并关闭。
  function selectNode(node: Node, level: number) {
    onChange(node.id, node.name);
    setSelectedName(node.name);
    setSelectedL2(node.l2Name);
    if (hasChildren(node)) {
      if (level === 2) {
        setPickedL2(node.id);
        setPickedL3(null);
      } else if (level === 3) {
        setPickedL3(node.id);
      }
    } else {
      setOpen(false);
    }
  }

  // 搜索结果直接选中并关闭
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
          className="h-10 w-full justify-between rounded-sm font-normal"
        >
          {value && selectedName ? (
            <span className="truncate">{selectedName}</span>
          ) : (
            <span className="text-muted-foreground">点击选择</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[92vw] p-0" align="start">
        {/* 搜索栏 */}
        <div className="border-b border-border p-2">
          <div className="relative w-[240px]">
            <Input
              placeholder="搜索案由，或下方逐级浏览"
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
          <div className="flex w-[240px] items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="ml-2">加载案由库...</span>
          </div>
        ) : searchMatched ? (
          // 搜索模式：扁平结果带路径
          <div className="max-h-[360px] w-[320px] overflow-y-auto p-1">
            {searchMatched.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">未找到匹配</p>
            ) : (
              searchMatched.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pickNode(n)}
                  title={n.name}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-muted/60"
                >
                  <span className="truncate">{n.name}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">
                    {n.l2Name ?? ""}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : (
          // 级联模式：渐进展开（选了上一级才出现下一列）
          // 单击任意层级即选中；有子级则同时展开下一列，可继续下钻或就此停下
          <div className="flex divide-x divide-border">
            <Column
              title="二级"
              items={l2Nodes}
              activeId={pickedL2}
              hasChildren={hasChildren}
              onPick={(n) => selectNode(n, 2)}
            />
            {pickedL2 && (
              <Column
                title="三级"
                items={l3Nodes}
                activeId={pickedL3}
                empty="该二级下无三级"
                hasChildren={hasChildren}
                onPick={(n) => selectNode(n, 3)}
              />
            )}
            {pickedL3 && l4Nodes.length > 0 && (
              <Column
                title="四级"
                items={l4Nodes}
                activeId={null}
                hasChildren={() => false}
                onPick={(n) => selectNode(n, 4)}
              />
            )}
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
  hasChildren,
  onPick
}: {
  title: string;
  items: Node[];
  activeId: string | null;
  empty?: string;
  hasChildren: (n: Node) => boolean;
  onPick: (n: Node) => void;
}) {
  return (
    <div className="flex max-h-[360px] w-[176px] flex-col">
      <div className="border-b border-border bg-muted/30 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground/60">{empty}</p>
        ) : (
          items.map((n) => {
            const branching = hasChildren(n);
            const isActive = activeId === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onPick(n)}
                title={n.name}
                className={cn(
                  "flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors",
                  isActive ? "bg-primary/15 text-primary" : "hover:bg-muted/60"
                )}
              >
                <span className="truncate">{n.name}</span>
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground/50",
                    isActive && "text-primary",
                    !branching && "invisible"
                  )}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
