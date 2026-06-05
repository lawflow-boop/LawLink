import { listSmsMessages } from "@/server/sms/actions";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { matterAssociationFilter } from "@/lib/permissions";
import { InboxView } from "./_components/inbox-view";

export default async function InboxPage() {
  const session = await getSession();
  if (!session?.user) return null;

  const [unprocessed, processed, recentMatters] = await Promise.all([
    listSmsMessages({ scope: "mine", processed: "unprocessed" }),
    listSmsMessages({ scope: "mine", processed: "processed" }),
    prisma.matter.findMany({
      where: {
        deletedAt: null,
        ...matterAssociationFilter(session.user.id)
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        internalCode: true,
        title: true,
        procedures: {
          where: { engagement: "ENGAGED" },
          orderBy: { order: "asc" },
          select: { id: true, type: true, customLabel: true, caseNumber: true }
        }
      }
    })
  ]);

  return (
    <InboxView
      unprocessed={unprocessed}
      processed={processed}
      matters={recentMatters}
    />
  );
}
