import { Prisma } from "@prisma/client";
import { matterAssociationFilter } from "@/lib/permissions";

export function invoiceMatterSearchWhere(
  userId: string,
  q?: string
): Prisma.MatterWhereInput {
  const query = (q ?? "").trim();
  const associationWhere = matterAssociationFilter(userId);
  const searchWhere: Prisma.MatterWhereInput = {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { internalCode: { contains: query, mode: "insensitive" } },
      { firmCaseNo: { contains: query, mode: "insensitive" } }
    ]
  };

  return {
    deletedAt: null,
    ...(query ? { AND: [associationWhere, searchWhere] } : associationWhere)
  };
}

export function invoiceMatterSearchLimit(q?: string) {
  return (q ?? "").trim() ? 10 : 12;
}
