import { ReportsScreen } from "@/features/reports/components/reports-screen";
import { getReportsScreenData } from "@/features/reports/data/reports";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import { requireAdminContext } from "@/lib/auth/context";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const context = await requireAdminContext();
  const viewQuery = parseReportSearchParams(await searchParams);
  const data = await getReportsScreenData(context.organizationId, viewQuery);

  return <ReportsScreen {...data} organizationName={context.organizationName} />;
}
