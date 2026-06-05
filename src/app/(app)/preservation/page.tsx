import { listPreservationCases } from "@/server/preservations/actions-v2";
import { listActiveColleagues } from "@/server/users/actions";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { matterAssociationFilter } from "@/lib/permissions";
import { PreservationsView } from "./_components/preservations-view";

export default async function PreservationPage() {
  const session = await getSession();
  if (!session?.user) return null;

  const [items, matters, users] = await Promise.all([
    listPreservationCases({ status: "ALL" }),
    prisma.matter.findMany({
      where: {
        deletedAt: null,
        ...matterAssociationFilter(session.user.id)
      },
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
