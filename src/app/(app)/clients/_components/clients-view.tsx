"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, Search, Users, X } from "lucide-react";
import type { Client, ClientType, Contact } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ClientSheet } from "./client-sheet";
import { ClientsTable } from "./clients-table";

type ClientRow = Client & {
  contacts: Contact[];
  _count: { matters: number; intakes: number };
};

type Props = {
  initialData: {
    items: ClientRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  initialFilters: {
    search: string;
    type: ClientType | "ALL";
  };
};

export function ClientsView({ initialData, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialFilters.search);
  const [type, setType] = useState<ClientType | "ALL">(initialFilters.type);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);

  const updateUrl = useCallback(
    (next: { search?: string; type?: string }) => {
      const params = new URLSearchParams();
      const s = next.search ?? search;
      const t = next.type ?? type;
      if (s) params.set("search", s);
      if (t && t !== "ALL") params.set("type", t);
      startTransition(() => {
        router.replace(`/clients${params.toString() ? `?${params.toString()}` : ""}`);
      });
    },
    [router, search, type]
  );

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateUrl({ search });
  }

  function clearFilters() {
    setSearch("");
    setType("ALL");
    startTransition(() => router.replace("/clients"));
  }

  function handleNew() {
    setEditingClient(null);
    setSheetOpen(true);
  }

  function handleEdit(client: ClientRow) {
    setEditingClient(client);
    setSheetOpen(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {/* 页头 */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-5 w-5 text-primary" />
            客户管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {initialData.total} 位客户
          </p>
        </div>
        <Button onClick={handleNew} className="gap-1.5 shadow-[0_0_24px_-6px_rgba(91,141,239,0.45)]">
          <Plus className="h-4 w-4" />
          新建客户
        </Button>
      </header>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => updateUrl({ search })}
            placeholder="搜索客户名称 / 身份证号 / 电话 / 邮箱"
            className="h-9 pl-9 bg-background/60"
          />
        </form>

        <Select
          value={type}
          onValueChange={(v) => {
            const next = v as ClientType | "ALL";
            setType(next);
            updateUrl({ type: next });
          }}
        >
          <SelectTrigger className="h-9 w-40 bg-background/60">
            <SelectValue placeholder="客户类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部类型</SelectItem>
            <SelectItem value="INDIVIDUAL">自然人</SelectItem>
            <SelectItem value="COMPANY">公司</SelectItem>
            <SelectItem value="ORGANIZATION">其他组织</SelectItem>
          </SelectContent>
        </Select>

        {(search || type !== "ALL") && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            清除筛选
          </Button>
        )}
      </div>

      {/* 列表 */}
      <ClientsTable items={initialData.items} onEdit={handleEdit} />

      {/* 抽屉 */}
      <ClientSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingClient={editingClient}
      />
    </motion.div>
  );
}
