import type { ReportKind } from "@/features/reports/reports.types";

export const reportKindValues = [
  "monthly-owner-activity",
  "unit-profit-loss",
] as const satisfies readonly ReportKind[];

export type CurrentReportKind = (typeof reportKindValues)[number];

export type ReportCatalogItem = {
  description: string;
  kind: CurrentReportKind;
  tabLabel: string;
  title: string;
};

const reportDefinitions: ReportCatalogItem[] = [
  {
    description:
      "Rent, management fees, property costs, withdrawals, and net movement for the selected month.",
    kind: "monthly-owner-activity",
    tabLabel: "Owner activity",
    title: "Owner activity",
  },
  {
    description:
      "Income, expenses, and net income by unit for the selected month.",
    kind: "unit-profit-loss",
    tabLabel: "Unit P&L",
    title: "Monthly Unit Profit & Loss",
  },
];

export const reportCatalog = reportDefinitions;

export function getReportCatalogItem(kind: ReportKind) {
  return (
    reportDefinitions.find((report) => report.kind === kind) ??
    reportDefinitions[0]
  );
}

export function isReportKind(value: string): value is CurrentReportKind {
  return reportKindValues.includes(value as CurrentReportKind);
}

export function buildReportBuilderHref(
  report: ReportKind,
  query?: URLSearchParams,
) {
  const params = new URLSearchParams(query);
  params.delete("report");
  params.delete("ownerPersonId");
  params.delete("archiveState");
  params.delete("peopleView");
  params.delete("status");

  if (report !== "unit-profit-loss") {
    params.delete("unitId");
  }

  const suffix = params.toString();

  return suffix ? `/reports/${report}?${suffix}` : `/reports/${report}`;
}
