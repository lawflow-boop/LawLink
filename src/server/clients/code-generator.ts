import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * v0.39: 原子生成客户编号 KH-{YYYY}-{4位流水}
 *
 * 计数器存在 SystemSetting，key 形如 `client-code-counter-2026`。
 * 与 matters/code-generator.ts 同款 Serializable 事务避免并发冲突。
 */
export async function generateClientCode(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `client-code-counter-${year}`;

  const next = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.systemSetting.findUnique({ where: { key } });
      const current = (existing?.value as { value?: number })?.value ?? 0;
      const incremented = current + 1;
      await tx.systemSetting.upsert({
        where: { key },
        update: { value: { value: incremented } },
        create: { key, value: { value: incremented } }
      });
      return incremented;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  const padded = String(next).padStart(4, "0");
  return `KH-${year}-${padded}`;
}
