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

export const ownerStatementCatalogItem = {
  description:
    "Numbered PDF and Excel artifacts retained from an immutable closed owner-month revision.",
  kind: "owner-statement",
  tabLabel: "Owner Statement",
  title: "Official Owner Statement",
} as const;

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

export function buildOwnerStatementAuthorityHref(input: {
  month: string;
  ownerPersonId: string;
  propertyId: string;
  publicationId?: string;
  revisionId?: string;
}) {
  const immutableIds = [input.publicationId, input.revisionId].filter(Boolean);
  if (immutableIds.length !== 1) {
    throw new Error("Choose exactly one immutable publication or closed revision.");
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(input.month) ||
      !isUuid(input.ownerPersonId) || !isUuid(input.propertyId) ||
      !isUuid(immutableIds[0]!)) {
    throw new Error("Invalid official Owner Statement authority scope.");
  }
  const params = new URLSearchParams({
    month: input.month,
    propertyId: input.propertyId,
    ownerPersonId: input.ownerPersonId,
  });
  if (input.publicationId) {
    params.set("ownerStatementPublicationId", input.publicationId);
  } else {
    params.set("ownerCloseRevisionId", input.revisionId!);
  }
  return `/balances?${params.toString()}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
