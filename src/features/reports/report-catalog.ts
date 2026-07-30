import type { ReportKind } from "@/features/reports/reports.types";

export const reportKindValues = [
  "unit-profit-loss",
  "owner-statement",
  "management-fees",
] as const satisfies readonly ReportKind[];

export type CurrentReportKind = (typeof reportKindValues)[number];

export type ReportCatalogItem = {
  description: string;
  kind: CurrentReportKind;
  title: string;
};

export const reportCatalog: ReportCatalogItem[] = [
  {
    description:
      "Income, expenses, and net income by unit for the selected month.",
    kind: "unit-profit-loss",
    title: "Monthly Unit Profit & Loss",
  },
  {
    description:
      "Owner statement readiness for opening balance, net income, payments, and closing balance.",
    kind: "owner-statement",
    title: "Owner Statement",
  },
  {
    description:
      "Management fee cash collected across managed properties for the selected month.",
    kind: "management-fees",
    title: "Management Fee Statement",
  },
];

export function getReportCatalogItem(kind: ReportKind) {
  return (
    reportCatalog.find((report) => report.kind === kind) ?? reportCatalog[0]
  );
}

export function isReportKind(value: string): value is CurrentReportKind {
  return reportKindValues.includes(value as CurrentReportKind);
}

export function buildReportBuilderHref(
  report: CurrentReportKind,
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
