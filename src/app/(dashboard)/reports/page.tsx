import { redirect } from "next/navigation";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import {
  buildReportBuilderHref,
  isReportKind,
} from "@/features/reports/report-catalog";
import { getLegacyReportDestination } from "@/features/reports/legacy-report-destinations";
import { requireAdminContext } from "@/lib/auth/context";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requireAdminContext();
  const rawSearchParams = await searchParams;
  const rawReport = Array.isArray(rawSearchParams.report)
    ? rawSearchParams.report[0]
    : rawSearchParams.report;
  const legacyDestination = rawReport
    ? getLegacyReportDestination(rawReport)
    : null;

  if (legacyDestination) {
    redirect(legacyDestination);
  }

  const viewQuery = parseReportSearchParams(rawSearchParams);
  const query = new URLSearchParams({ month: viewQuery.month });

  if (viewQuery.propertyId !== "all") {
    query.set("propertyId", viewQuery.propertyId);
  }

  if (viewQuery.report === "unit-profit-loss" && viewQuery.unitId !== "all") {
    query.set("unitId", viewQuery.unitId);
  }

  const report = isReportKind(viewQuery.report)
    ? viewQuery.report
    : "unit-profit-loss";
  redirect(buildReportBuilderHref(report, query));
}
