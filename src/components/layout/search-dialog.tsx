"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { globalSearch, type GlobalSearchResult } from "@/server/search/actions";
import {
  FolderOpen,
  Users,
  FileText,
  Inbox,
} from "lucide-react";

const groupConfig = [
  { key: "matters" as const, label: "案件", icon: FolderOpen },
  { key: "clients" as const, label: "客户", icon: Users },
  { key: "intakes" as const, label: "收案", icon: Inbox },
  { key: "documents" as const, label: "材料", icon: FileText },
];

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Cmd+K / Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenChange]);

  // 防抖搜索
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await globalSearch(query);
        setResults(r);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((href: string) => {
    if (!href) return;
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }, [router, onOpenChange]);

  const hasResults = results && (
    results.matters.length + results.clients.length + results.intakes.length + results.documents.length > 0
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="搜索案件、客户、材料..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query && !loading && !hasResults && (
          <CommandEmpty>未找到相关结果</CommandEmpty>
        )}
        {results && groupConfig.map(({ key, label, icon: Icon }) => {
          const items = results[key];
          if (!items.length) return null;
          return (
            <CommandGroup key={key} heading={label}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.title} ${item.subtitle ?? ""}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{item.title}</div>
                    {item.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
