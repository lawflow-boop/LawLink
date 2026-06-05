import { listMatters } from "@/server/matters/actions";
import { listIntakes } from "@/server/intakes/actions";
import { listClients } from "@/server/clients/actions";
import { listActiveColleagues } from "@/server/users/actions";
import { MattersView } from "./_components/matters-view";
import type { MatterCategory } from "@prisma/client";

export type MattersTab = "intake" | "active" | "archived" | "revision" | "all";
export type MatterSortBy = "hearing" | "intakeDate" | "claimAmount";
export type MatterSortDir = "asc" | "desc";

function resolveTab(input?: string): MattersTab {
  if (input === "intake" || input === "archived" || input === "revision" || input === "all") return input;
  return "active";
}

function defaultSortByForTab(tab: MattersTab): MatterSortBy {
  return tab === "active" ? "hearing" : "intakeDate";
}

function supportsSortBy(tab: MattersTab, sortBy: MatterSortBy) {
  if (sortBy === "hearing") return tab === "active" || tab === "all";
  return true;
}

function resolveSortBy(input: string | undefined, tab: MattersTab): MatterSortBy {
  const candidate =
    input === "hearing" || input === "intakeDate" || input === "claimAmount"
      ? input
      : undefined;
  if (candidate && supportsSortBy(tab, candidate)) return candidate;
  return defaultSortByForTab(tab);
}

function resolveSortDir(input?: string): MatterSortDir {
  return input === "asc" ? "asc" : "desc";
}

function resolveDateStart(input?: string) {
  return resolveDateBoundary(input, false);
}

function resolveDateEnd(input?: string) {
  return resolveDateBoundary(input, true);
}

function resolveDateBoundary(input: string | undefined, endOfDay: boolean) {
  if (!input) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

type Props = {
  searchParams: {
    tab?: string;
    search?: string;
    category?: MatterCategory;
    status?: string; // all tab 下的状态筛选
    from?: string; // 收案时间起 yyyy-mm-dd
    to?: string; // 收案时间止
    sortBy?: string;
    sortDir?: string;
    page?: string;
    new?: string;
  };
};

export default async function MattersPage({ searchParams }: Props) {
  const tab = resolveTab(searchParams.tab);
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const sortBy = resolveSortBy(searchParams.sortBy, tab);
  const sortDir = resolveSortDir(searchParams.sortDir);
  const dateFrom = resolveDateStart(searchParams.from);
  const dateTo = resolveDateEnd(searchParams.to);

  // 收案抽屉所需：客户下拉 + 同事列表
  const [clientsResponse, colleagues] = await Promise.all([
    listClients({ pageSize: 100 }),
    listActiveColleagues()
  ]);

  if (tab === "intake" || tab === "revision") {
    // 待审批 / 待补正：从 Intake 表筛
    const intakeSortBy = sortBy === "claimAmount" ? "claimAmount" : "intakeDate";
    const intakes = await listIntakes({
      search: searchParams.search,
      category: searchParams.category,
      statusIn:
        tab === "intake"
          ? ["INTAKE", "PENDING_CONFIRMATION"]
          : ["NEEDS_REVISION"],
      receivedAtFrom: dateFrom,
      receivedAtTo: dateTo,
      sortBy: intakeSortBy,
      sortDir,
      page,
      pageSize: 30
    });
    return (
      <MattersView
        tab={tab}
        intakeData={{
          items: intakes.items.map((i) => ({
            id: i.id,
            title: i.title,
            category: i.category,
            status: i.status,
            receivedAt: i.receivedAt,
            client: i.client ? { id: i.client.id, name: i.client.name } : null,
            cause: i.cause,
            parties: i.parties,
            conflictChecks: i.conflictChecks,
            matter: i.matter,
            claimAmount: i.claimAmount ? Number(i.claimAmount) : null,
            ownerName: i.ownerUser?.name ?? null
          })),
          total: intakes.total
        }}
        clientOptions={clientsResponse.items.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type
        }))}
        colleagues={colleagues}
        initialFilters={{
          search: searchParams.search ?? "",
          category: searchParams.category ?? "ALL",
          from: searchParams.from,
          to: searchParams.to,
          sortBy: intakeSortBy,
          sortDir
        }}
        autoOpenIntake={searchParams.new === "1"}
      />
    );
  }

  // active / archived / all：查 Matter 表
  let statusGroup: { statusIn?: ("PENDING_ACCEPTANCE" | "IN_PROGRESS" | "ON_HOLD" | "CLOSED" | "ARCHIVED")[]; statusNotIn?: ("PENDING_ACCEPTANCE" | "IN_PROGRESS" | "ON_HOLD" | "CLOSED" | "ARCHIVED")[] } = {};
  if (tab === "archived") {
    statusGroup = { statusIn: ["ARCHIVED"] };
  } else if (tab === "active") {
    statusGroup = { statusNotIn: ["CLOSED", "ARCHIVED"] };
  } else if (tab === "all") {
    // 全部案件：通过收案审批的（排除 PENDING_ACCEPTANCE — 那是收案阶段）
    // 可被 searchParams.status 进一步筛选
    if (searchParams.status === "active") {
      statusGroup = { statusIn: ["IN_PROGRESS", "ON_HOLD"] };
    } else if (searchParams.status === "closed") {
      statusGroup = { statusIn: ["CLOSED"] };
    } else if (searchParams.status === "archived") {
      statusGroup = { statusIn: ["ARCHIVED"] };
    } else {
      statusGroup = { statusIn: ["IN_PROGRESS", "ON_HOLD", "CLOSED", "ARCHIVED"] };
    }
  }

  const matters = await listMatters({
    search: searchParams.search,
    category: searchParams.category,
    page,
    ...statusGroup,
    intakeDateFrom: dateFrom,
    intakeDateTo: dateTo,
    sortBy,
    sortDir
  });

  return (
    <MattersView
      tab={tab}
      matterData={matters}
      clientOptions={clientsResponse.items.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type
      }))}
      colleagues={colleagues}
      initialFilters={{
        search: searchParams.search ?? "",
        category: searchParams.category ?? "ALL",
        status: searchParams.status,
        from: searchParams.from,
        to: searchParams.to,
        sortBy,
        sortDir
      }}
      autoOpenIntake={searchParams.new === "1"}
    />
  );
}
