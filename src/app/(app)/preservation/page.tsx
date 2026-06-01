import { listPreservationCases } from "@/server/preservations/actions-v2";
import { listActiveColleagues } from "@/server/users/actions";
import { prisma } from "@/lib/prisma";
import { PreservationsView } from "./_components/preservations-view";

export default async function PreservationPage() {
  const [items, matters, users] = await Promise.all([
    listPreservationCases({ status: "ALL" }),
    prisma.matter.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, internalCode: true, title: true }
    }),
    listActiveColleagues()
  ]);

  return (
    <PreservationsView
      items={items}
      matters={matters}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
    />
  );
}
