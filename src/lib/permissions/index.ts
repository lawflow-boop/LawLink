import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** ADMIN 或 PRINCIPAL_LAWYER — 管理层，看所有数据 */
export function isManager(role: string): boolean {
  return role === "ADMIN" || role === "PRINCIPAL_LAWYER";
}

// ============ 案件可见性 ============

/** 列表查询用：返回 Prisma where 片段，AND 到现有 where */
export function matterVisibilityFilter(
  userId: string,
  role: string
): Prisma.MatterWhereInput {
  if (isManager(role) || role === "FINANCE") return {};
  if (role === "LAWYER") {
    return {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    };
  }
  // ASSISTANT
  return { members: { some: { userId } } };
}

/** 操作/关联案件用：不因 ADMIN / PRINCIPAL_LAWYER / FINANCE 角色放大全所范围 */
export function matterAssociationFilter(userId: string): Prisma.MatterWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { members: { some: { userId } } }
    ]
  };
}

/** 单条访问断言：查不到或无权限一律 throw "案件不存在"（避免泄露 ID） */
export async function assertCanAccessMatter(
  userId: string,
  role: string,
  matterId: string
): Promise<void> {
  if (isManager(role) || role === "FINANCE") {
    const exists = await prisma.matter.findFirst({
      where: { id: matterId, deletedAt: null },
      select: { id: true }
    });
    if (!exists) throw new Error("案件不存在");
    return;
  }
  const row = await prisma.matter.findFirst({
    where: {
      id: matterId,
      deletedAt: null,
      ...matterVisibilityFilter(userId, role)
    },
    select: { id: true }
  });
  if (!row) throw new Error("案件不存在");
}

/** 操作/关联断言：只允许主办或案件成员，不因管理角色放开 */
export async function assertCanAssociateMatter(
  userId: string,
  matterId: string
): Promise<void> {
  const row = await prisma.matter.findFirst({
    where: {
      id: matterId,
      deletedAt: null,
      ...matterAssociationFilter(userId)
    },
    select: { id: true }
  });
  if (!row) throw new Error("案件不存在或无权关联");
}

/** 修改断言：owner 或 manager */
export async function assertCanModifyMatter(
  userId: string,
  role: string,
  matterId: string
): Promise<void> {
  if (isManager(role)) return;
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, deletedAt: null },
    select: { ownerId: true }
  });
  if (!matter) throw new Error("案件不存在");
  if (matter.ownerId !== userId) {
    throw new Error("无权操作此案件");
  }
}

// ============ 收案可见性 ============

export function intakeVisibilityFilter(
  userId: string,
  role: string
): Prisma.IntakeWhereInput {
  if (isManager(role)) return {};
  return {
    OR: [
      { createdById: userId },
      { ownerUserId: userId },
      { coUserIds: { has: userId } }
    ]
  };
}

// ============ 客户可见性 ============

/** 客户通过关联的案件判断可见性；manager/finance 看全部 */
export function clientVisibilityFilter(
  userId: string,
  role: string
): Prisma.ClientWhereInput {
  if (isManager(role) || role === "FINANCE") return {};
  return {
    OR: [
      { matters: { some: { deletedAt: null, ...matterVisibilityFilter(userId, role) } } },
      { intakes: { some: intakeVisibilityFilter(userId, role) } }
    ]
  };
}

// ============ 通用断言 ============

export function assertManagerOrRole(role: string, ...allowed: string[]): void {
  if (isManager(role)) return;
  if (allowed.includes(role)) return;
  throw new Error("权限不足");
}
