import { listClients } from "@/server/clients/actions";
import { ClientsView } from "./_components/clients-view";

type Props = {
  searchParams: {
    search?: string;
    type?: "INDIVIDUAL" | "COMPANY" | "ORGANIZATION";
    page?: string;
  };
};

export default async function ClientsPage({ searchParams }: Props) {
  const initialData = await listClients({
    search: searchParams.search,
    type: searchParams.type,
    page: searchParams.page ? Number(searchParams.page) : 1
  });

  return (
    <ClientsView
      initialData={initialData}
      initialFilters={{
        search: searchParams.search ?? "",
        type: searchParams.type ?? "ALL"
      }}
    />
  );
}
