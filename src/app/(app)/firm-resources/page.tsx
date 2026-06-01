/**
 * v0.38: 律所文书恢复独立页（v0.37 曾并入 /service-center，现拆回真实页面）
 * v0.44: 分类改为合同/函件/证照/其他
 */
import type { FirmFileCategory } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listFirmFiles } from "@/server/firm-files/actions";
import { FirmFilesView } from "./_components/firm-files-view";

const VALID_CATEGORIES: FirmFileCategory[] = ["CONTRACT", "LETTER", "LICENSE", "OTHER_FIRM"];

export default async function FirmResourcesPage({
  searchParams
}: {
  searchParams: { category?: string; q?: string; includeOld?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const isManager =
    session.user.role === "ADMIN" || session.user.role === "PRINCIPAL_LAWYER";

  const category =
    searchParams.category && (VALID_CATEGORIES as string[]).includes(searchParams.category)
      ? (searchParams.category as FirmFileCategory)
      : undefined;

  const files = await listFirmFiles({
    category,
    search: searchParams.q?.trim(),
    includeSuperseded: searchParams.includeOld === "1"
  });

  return (
    <FirmFilesView
      files={files}
      canUpload={isManager}
      currentCategory={category}
      currentSearch={searchParams.q ?? ""}
      includeSuperseded={searchParams.includeOld === "1"}
      categorySet="firm"
    />
  );
}
