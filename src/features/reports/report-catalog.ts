import type { ReportKind } from "@/features/reports/reports.types";

export const reportKindValues = [
  "rent-roll",
  "unit-performance",
  "property-performance",
  "owner-statement",
  "income-expense",
  "lease-expiry",
  "vacancy-risk",
  "maintenance-cost",
  "missing-data",
] as const satisfies readonly ReportKind[];

export type ReportCatalogItem = {
  bestFor: string;
  category: "Finance" | "Leasing" | "Operations" | "Property";
  description: string;
  kind: ReportKind;
  sources: string;
  title: string;
};

export const reportCatalog: ReportCatalogItem[] = [
  {
    bestFor: "Monthly owner and finance review",
    category: "Finance",
    description:
      "Income, expenses, and NOI for the selected period with ledger source rows.",
    kind: "income-expense",
    sources: "Ledger, property, unit",
    title: "Income & Expense",
  },
  {
    bestFor: "Owner packet closeout",
    category: "Finance",
    description:
      "Owner-facing property statement with income, expenses, net, and ownership context.",
    kind: "owner-statement",
    sources: "Ledger, owners, people",
    title: "Owner Statement",
  },
  {
    bestFor: "Portfolio performance review",
    category: "Property",
    description:
      "Property-level occupancy, revenue, NOI, maintenance, and operating risk.",
    kind: "property-performance",
    sources: "Property, unit, ledger, timeline",
    title: "Property Performance",
  },
  {
    bestFor: "Leasing desk and owner updates",
    category: "Leasing",
    description:
      "Current unit rent roll with tenant, lease, rent, status, and document evidence.",
    kind: "rent-roll",
    sources: "Unit, lease, documents",
    title: "Rent Roll",
  },
  {
    bestFor: "Renewal planning",
    category: "Leasing",
    description:
      "Upcoming lease ends and renewal windows for the selected operating period.",
    kind: "lease-expiry",
    sources: "Lease, unit, property",
    title: "Lease Expiry",
  },
  {
    bestFor: "Vacancy and follow-up queue",
    category: "Leasing",
    description:
      "Vacant, missing-lease, missing-rent, and evidence-risk checks by unit.",
    kind: "vacancy-risk",
    sources: "Unit, lease, documents",
    title: "Vacancy & Lease Risk",
  },
  {
    bestFor: "Unit operating record review",
    category: "Property",
    description:
      "Unit-scoped income, expenses, NOI, maintenance cost, and evidence counts.",
    kind: "unit-performance",
    sources: "Unit, ledger, timeline, documents",
    title: "Unit Performance",
  },
  {
    bestFor: "Maintenance spending review",
    category: "Operations",
    description:
      "Maintenance cost, estimates, priority, completion state, and linked records.",
    kind: "maintenance-cost",
    sources: "Maintenance, ledger, timeline",
    title: "Maintenance Cost",
  },
  {
    bestFor: "Data cleanup before reporting",
    category: "Operations",
    description:
      "Missing lease, rent, owner, and evidence fields blocking clean reporting.",
    kind: "missing-data",
    sources: "Unit, lease, owner, documents",
    title: "Record Readiness",
  },
];

export const reportCategories = [
  "Finance",
  "Leasing",
  "Operations",
  "Property",
] as const;

export type ReportPacket = {
  description: string;
  href: string;
  reports: string;
  title: string;
};

export function getReportCatalogItem(kind: ReportKind) {
  return reportCatalog.find((report) => report.kind === kind) ?? reportCatalog[0];
}

export function isReportKind(value: string): value is ReportKind {
  return reportKindValues.includes(value as ReportKind);
}

export function getReportPackets({
  month,
  propertyId,
}: {
  month: string;
  propertyId: string;
}): ReportPacket[] {
  const query = new URLSearchParams({ month });

  if (propertyId !== "all") {
    query.set("propertyId", propertyId);
  }

  return [
    {
      description:
        "Owner statement, income and expense, rent roll, and maintenance cost.",
      href: buildReportBuilderHref("owner-statement", query),
      reports: "4 reports",
      title: "Owner Monthly Packet",
    },
    {
      description:
        "Rent roll, lease expiry, and vacancy risk for leasing follow-up.",
      href: buildReportBuilderHref("rent-roll", query),
      reports: "3 reports",
      title: "Leasing Review",
    },
    {
      description:
        "Unit performance, maintenance cost, and record readiness in one loop.",
      href: buildReportBuilderHref("unit-performance", query),
      reports: "3 reports",
      title: "Unit Operating Packet",
    },
    {
      description:
        "Record readiness plus people-domain relationship and evidence checks.",
      href: "/people-reports",
      reports: "People reports",
      title: "People Readiness",
    },
  ];
}

export function buildReportBuilderHref(
  report: ReportKind,
  query?: URLSearchParams,
) {
  const params = new URLSearchParams(query);
  params.delete("report");
  if (report === "owner-statement") {
    params.delete("unitId");
  }

  const suffix = params.toString();

  return suffix ? `/reports/${report}?${suffix}` : `/reports/${report}`;
}
