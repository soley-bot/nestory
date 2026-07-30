import type { ReportKind } from "@/features/reports/reports.types";

export const reportKindValues = [
  "unit-profit-loss",
  "owner-statement",
  "management-fees",
] as const satisfies readonly ReportKind[];

export type CurrentReportKind = (typeof reportKindValues)[number];

export type ReportCatalogItem = {
  bestFor: string;
  category: "Finance";
  description: string;
  kind: CurrentReportKind;
  sources: string;
  title: string;
};

export const reportCatalog: ReportCatalogItem[] = [
  {
    bestFor: "Monthly unit review",
    category: "Finance",
    description:
      "Income, expenses, and net income by unit for the selected month.",
    kind: "unit-profit-loss",
    sources: "Units and ledger",
    title: "Monthly Unit Profit & Loss",
  },
  {
    bestFor: "Owner statement readiness",
    category: "Finance",
    description:
      "Owner statement readiness for opening balance, net income, payments, and closing balance.",
    kind: "owner-statement",
    sources: "Owners and finance",
    title: "Owner Statement",
  },
  {
    bestFor: "Internal fee collection review",
    category: "Finance",
    description:
      "Management fee cash collected across managed properties for the selected month.",
    kind: "management-fees",
    sources: "Finance receipts",
    title: "Management Fee Statement",
  },
];

export const reportCategories = ["Finance"] as const;

export type ReportPacket = {
  description: string;
  href: string;
  reports: string;
  title: string;
};

export function getReportPackets(_scope?: {
  month: string;
  propertyId: string;
}): ReportPacket[] {
  return [];
}

export function getReportCatalogItem(kind: ReportKind) {
  return (
    reportCatalog.find((report) => report.kind === kind) ?? reportCatalog[0]
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
