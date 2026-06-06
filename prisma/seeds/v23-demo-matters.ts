/**
 * Public release placeholder.
 *
 * LawLink no longer seeds demo matters by default. Keep this no-op export
 * for backward compatibility with older local scripts that may import it.
 */
import type { PrismaClient } from "@prisma/client";

export async function seedV23DemoMatters(_prisma: PrismaClient) {
  console.log("- Demo matters seed skipped for public release");
}
