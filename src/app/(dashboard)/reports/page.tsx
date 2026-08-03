import { redirect } from "next/navigation";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import {
  buildReportBuilderHref,
  isReportKind,
} from "@/features/reports/report-catalog";
import { requireAdminContext } from "@/lib/auth/context";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requireAdminContext();
  const rawSearchParams = await searchParams;
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
