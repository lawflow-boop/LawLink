"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/session";
import { matterVisibilityFilter, clientVisibilityFilter } from "@/lib/permissions";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: "matter" | "client" | "intake" | "document";
}

export interface GlobalSearchResult {
  matters: SearchResultItem[];
  clients: SearchResultItem[];
  intakes: SearchResultItem[];
  documents: SearchResultItem[];
}

export async function globalSearch(query: string): Promise<GlobalSearchResult> {
  const session = await requireSession();
  if (!query || query.trim().length < 1) {
    return { matters: [], clients: [], intakes: [], documents: [] };
  }

  const q = query.trim();
  const userId = session.user.id;
  const role = session.user.role;
  const mVis = matterVisibilityFilter(userId, role);
  const cVis = clientVisibilityFilter(userId, role);
  const limit = 5;

  const [matters, clients, intakes, documents] = await Promise.all([
    prisma.matter.findMany({
      where: { deletedAt: null, ...mVis, OR: [
        { title: { contains: q, mode: "insensitive" } },
        { internalCode: { contains: q, mode: "insensitive" } },
        { primaryClient: { name: { contains: q, mode: "insensitive" } } },
      ]},
      take: limit,
      select: { id: true, title: true, internalCode: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.client.findMany({
      where: { deletedAt: null, ...cVis, OR: [
        { name: { contains: q, mode: "insensitive" } },
        { idNumber: { contains: q } },
        { phone: { contains: q } },
      ]},
      take: limit,
      select: { id: true, name: true, type: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.intake.findMany({
      where: {
        status: { not: "CONVERTED" },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { client: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: limit,
      select: { id: true, title: true, status: true },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.document.findMany({
      where: {
        deletedAt: null,
        matter: { deletedAt: null, ...mVis },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
        ],
      },
      take: limit,
      select: {
        id: true, name: true, category: true,
        matter: { select: { id: true, internalCode: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    matters: matters.map((m) => ({
      id: m.id,
      title: m.title,
      subtitle: `${m.internalCode} · ${m.status}`,
      href: `/matters/${m.id}`,
      type: "matter" as const,
    })),
    clients: clients.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.type,
      href: `/clients/${c.id}`,
      type: "client" as const,
    })),
    intakes: intakes.map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.status,
      href: `/intakes/${i.id}`,
      type: "intake" as const,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      title: d.name,
      subtitle: d.matter?.internalCode ?? "",
      href: d.matter ? `/matters/${d.matter.id}` : "",
      type: "document" as const,
    })),
  };
}
