import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getReportData, periodPresets } from "@/server/reports/queries";
import { resolveReportPeriod } from "@/server/reports/resolve-period";
import { ReportsView } from "./_components/reports-view";

export default async function ReportsPage({
  searchParams
}: {
  searchParams: { period?: string; start?: string; end?: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "PRINCIPAL_LAWYER") {
    redirect("/");
  }

  const resolved = resolveReportPeriod(searchParams);
  const data = await getReportData(resolved.period);
  const presets = periodPresets();

  return (
    <ReportsView
      periodKey={resolved.periodKey}
      periodLabel={resolved.period.label}
      customStart={resolved.startStr}
      customEnd={resolved.endStr}
      resolveError={resolved.error}
      data={data}
      presetLabels={{
        month: presets.month.label,
        quarter: presets.quarter.label,
        year: presets.year.label,
        lastYear: presets.lastYear.label
      }}
    />
  );
}
