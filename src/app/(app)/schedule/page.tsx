import { listScheduleItems } from "@/server/schedule/actions";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { matterAssociationFilter } from "@/lib/permissions";
import { ScheduleView } from "./_components/schedule-view";

export default async function SchedulePage() {
  const session = await getSession();
  if (!session?.user) return null;

  // 拉前后各 3 个月覆盖月历前后翻页
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 4, 1);

  const [items, matters] = await Promise.all([
    listScheduleItems({ from, to }),
    prisma.matter.findMany({
      where: {
        deletedAt: null,
        ...matterAssociationFilter(session.user.id)
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, internalCode: true, title: true }
    })
  ]);

  return <ScheduleView items={items} matters={matters} />;
}
