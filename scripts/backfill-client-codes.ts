/**
 * v0.39 一次性回填：给现有 Client 生成 internalCode（KH-{年}-{4位}）。
 * 按 createdAt 顺序、按年分流水；同时把每年计数器写进 SystemSetting，
 * 保证之后 generateClientCode() 接着排，不与回填的号冲突。
 *
 * 运行：npx tsx scripts/backfill-client-codes.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const clients = await prisma.client.findMany({
    where: { internalCode: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true }
  });

  if (clients.length === 0) {
    console.log("没有需要回填的客户");
    return;
  }

  const perYear = new Map<number, number>();
  let updated = 0;

  for (const c of clients) {
    const year = c.createdAt.getFullYear();
    const seq = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, seq);
    const code = `KH-${year}-${String(seq).padStart(4, "0")}`;
    await prisma.client.update({ where: { id: c.id }, data: { internalCode: code } });
    updated++;
  }

  // 播种计数器到各年最大流水
  for (const [year, maxSeq] of perYear) {
    const key = `client-code-counter-${year}`;
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: { value: maxSeq } },
      create: { key, value: { value: maxSeq } }
    });
    console.log(`计数器 ${key} = ${maxSeq}`);
  }

  console.log(`已回填 ${updated} 个客户编号`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
