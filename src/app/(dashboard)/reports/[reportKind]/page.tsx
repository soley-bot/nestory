import { notFound } from "next/navigation";
import { ReportBuilderScreen } from "@/features/reports/components/reports-screen";
import { getReportsScreenData } from "@/features/reports/data/reports";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import { isReportKind } from "@/features/reports/report-catalog";
import { requireAdminContext } from "@/lib/auth/context";

type ReportBuilderPageProps = {
  params: Promise<{ reportKind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportBuilderPage({
  params,
  searchParams,
}: ReportBuilderPageProps) {
  const { reportKind } = await params;

  if (!isReportKind(reportKind)) {
    notFound();
  }

  const context = await requireAdminContext();
  const viewQuery = parseReportSearchParams({
    ...(await searchParams),
    report: reportKind,
  });
  const data = await getReportsScreenData(context.organizationId, viewQuery);

  return (
    <ReportBuilderScreen
      {...data}
      organizationName={context.organizationName}
    />
  );
}
