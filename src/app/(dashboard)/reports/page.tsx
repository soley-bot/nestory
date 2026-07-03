import { redirect } from "next/navigation";
import { ReportsLibraryScreen } from "@/features/reports/components/reports-screen";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import { buildReportBuilderHref } from "@/features/reports/report-catalog";
import { requireAdminContext } from "@/lib/auth/context";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requireAdminContext();
  const rawSearchParams = await searchParams;
  const viewQuery = parseReportSearchParams(rawSearchParams);

  if (rawSearchParams.report !== undefined) {
    const query = new URLSearchParams({ month: viewQuery.month });

    if (viewQuery.propertyId !== "all") {
      query.set("propertyId", viewQuery.propertyId);
    }

    if (viewQuery.unitId !== "all") {
      query.set("unitId", viewQuery.unitId);
    }

    if (viewQuery.status !== "all") {
      query.set("status", viewQuery.status);
    }

    redirect(buildReportBuilderHref(viewQuery.report, query));
  }

  return <ReportsLibraryScreen viewQuery={viewQuery} />;
}
