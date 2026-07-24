/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReportBuilderScreen,
  ReportsLibraryScreen,
} from "@/features/reports/components/reports-screen";
import { reportCatalog } from "@/features/reports/report-catalog";
import type {
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const propertyOneId = "52b1ed33-0ac8-4c3d-9d9d-631e9f557014";
const propertyTwoId = "ea96fb00-f92d-4c85-92bc-396fe9f60083";
const ownerOneId = "c304facd-1caa-4f98-9d43-cf44f65ac32f";
const ownerTwoId = "67de948d-ae16-4d98-9b2a-469a72444e1d";

describe("Reports workspace", () => {
  it("uses a dense report index and marks one local report family current", () => {
    const { container } = render(
      <ReportsLibraryScreen viewQuery={reportQuery()} />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Report families",
    });
    expect(
      within(navigation)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
    expect(
      within(navigation)
        .getByRole("link", { name: "All reports" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      container.querySelectorAll('[data-report-picker-item="true"]'),
    ).toHaveLength(reportCatalog.length);
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Open Income & Expense" }),
    ).toBeTruthy();
    expect(screen.queryByText(reportCatalog[0]!.description)).toBeNull();
    expect(screen.queryByText("What a report contains")).toBeNull();
  });

  it("makes scope, generation, preview, export, totals, and sources explicit", () => {
    const { container } = renderReportBuilder();

    const navigation = screen.getByRole("navigation", {
      name: "Report families",
    });
    expect(
      within(navigation)
        .getByRole("link", { name: "Leasing" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(navigation)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
    const scope = container.querySelector('[data-report-stage="generate"]');
    expect(scope).not.toBeNull();
    expect(within(scope as HTMLElement).getByText("Property")).toBeTruthy();
    expect(within(scope as HTMLElement).getByText("Month")).toBeTruthy();
    expect(within(scope as HTMLElement).getByText("Status")).toBeTruthy();
    expect(
      within(scope as HTMLElement).getByRole("button", {
        name: "Generate preview",
      }),
    ).toBeTruthy();

    const exportRegion = screen.getByRole("region", { name: "Export report" });
    expect(within(exportRegion).getByRole("link", { name: "Export PDF" })).toBeTruthy();
    expect(within(exportRegion).getByRole("link", { name: "Export CSV" })).toBeTruthy();
    expect(within(exportRegion).getByRole("button", { name: "Print / PDF" })).toBeTruthy();

    const preview = screen.getByRole("region", { name: "Report preview" });
    const result = within(preview).getByRole("status");
    expect(within(result).getByText("Preview ready")).toBeTruthy();
    expect(within(preview).getAllByText("USD 1,234.00")).toHaveLength(2);
    expect(within(preview).getByText("2 source records")).toBeTruthy();
    expect(within(preview).getByText("Cash receipts only.")).toBeTruthy();
    expect(
      container.querySelector('[data-report-summary="true"]')?.className,
    ).toContain("print:grid");
    expect(
      container.querySelector('[data-report-trace="true"]')?.className,
    ).toContain("print:block");
    expect(
      container.querySelector('[data-report-builder-layout="true"]')?.className,
    ).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
  });

  it("blocks an invalid owner-statement unit scope without presenting trusted totals as ready", () => {
    const { container } = renderReportBuilder({
      report: {
        ...ownerStatementReadinessReport(),
        rows: [],
        scopeValidation: {
          code: "owner_statement_unit_scope",
          message:
            "Owner Statements are property-level reports. Clear the unit filter to continue.",
        },
      },
      viewQuery: reportQuery({
        report: "owner-statement",
        unitId: "8b3a08d2-0898-4de3-9495-994eaf7a08dc",
      }),
    });

    const preview = screen.getByRole("region", {
      name: "Report preview unavailable",
    });
    expect(within(preview).getByText("Preview unavailable")).toBeTruthy();
    expect(within(preview).queryByText("Preview ready")).toBeNull();
    expect(container.querySelector('[data-report-stage="blocked"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-kind="error"]')).toHaveLength(1);
    expect(container.querySelector('[data-report-summary="true"]')).toBeNull();
    expect(container.querySelector('[data-report-trace="true"]')).toBeNull();
    expect(screen.queryByRole("region", { name: "Export report" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Export PDF" })).toBeNull();
  });

  it("recovers from a filtered empty preview without changing report kind or month", () => {
    const { container } = renderReportBuilder({
      report: reportFixture({ rows: [] }),
      viewQuery: reportQuery({
        propertyId: propertyOneId,
        status: "vacant",
      }),
    });

    const emptyState = container.querySelector('[data-kind="filtered"]');
    expect(emptyState).not.toBeNull();
    expect(
      within(emptyState as HTMLElement)
        .getByRole("link", { name: "Clear filters" })
        .getAttribute("href"),
    ).toBe("/reports/rent-roll?month=2026-07");
  });

  it("gives a true-empty preview a direct path back to the report library", () => {
    const { container } = renderReportBuilder({
      report: reportFixture({ rows: [] }),
    });

    const emptyState = container.querySelector('[data-kind="empty"]');
    expect(emptyState).not.toBeNull();
    expect(
      within(emptyState as HTMLElement)
        .getByRole("link", { name: "Report library" })
        .getAttribute("href"),
    ).toBe("/reports");
  });

  it("ignores stale status and owner params when they do not filter the selected report", () => {
    const { container } = renderReportBuilder({
      report: {
        ...reportFixture({ rows: [] }),
        kind: "income-expense",
        title: "Income & Expense",
      },
      viewQuery: reportQuery({
        ownerPersonId: ownerOneId,
        ownerPersonIdInvalid: true,
        report: "income-expense",
        status: "vacant",
      }),
    });

    const emptyState = container.querySelector('[data-kind="empty"]');
    expect(emptyState).not.toBeNull();
    expect(container.querySelector('[data-kind="filtered"]')).toBeNull();
    expect(
      within(emptyState as HTMLElement)
        .getByRole("link", { name: "Report library" })
        .getAttribute("href"),
    ).toBe("/reports");
  });

  it("treats status as an active empty-state filter for status-aware reports", () => {
    const { container } = renderReportBuilder({
      report: reportFixture({ rows: [] }),
      viewQuery: reportQuery({ status: "vacant" }),
    });

    expect(container.querySelector('[data-kind="filtered"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="empty"]')).toBeNull();
  });

  it("keeps People-specific scope, exports, record links, and next actions in the central builder", () => {
    renderReportBuilder({
      report: {
        ...reportFixture(),
        columns: [
          { key: "readiness", label: "Readiness" },
          { key: "next", label: "Next action" },
        ],
        exportFilenameBase: "people-staff-access",
        kind: "people-readiness",
        periodLabel: "Current directory snapshot",
        rows: [
          {
            cells: {
              next: "Grant workspace access",
              readiness: "No workspace access",
            },
            href: "/people/person-1",
            id: "person-1",
            nextActionHref: "/users-roles?personId=person-1",
            sourceCount: 2,
            sourceLinks: [
              {
                href: "/people/person-1",
                id: "person-1",
                label: "Person One",
                recordType: "person",
              },
            ],
            sourceSummary: "2 linked sources",
            title: "Person One",
          },
        ],
        scopeLabel: "Staff Access",
        title: "Staff Access",
      },
      viewQuery: reportQuery({
        peopleArchiveState: "archived",
        peopleView: "staff",
        report: "people-readiness",
      }),
    });

    expect(
      screen.getByRole("combobox", { name: "Choose People readiness view" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Person One" }).getAttribute("href"),
    ).toBe("/people/person-1");
    expect(
      screen
        .getByRole("link", { name: "Grant workspace access" })
        .getAttribute("href"),
    ).toBe("/users-roles?personId=person-1");
    expect(
      screen.getByRole("link", { name: "Export CSV" }).getAttribute("href"),
    ).toBe(
      "/api/reports/export?report=people-readiness&archiveState=archived&peopleView=staff",
    );
    expect(
      screen.getByRole("link", { name: "Export PDF" }).getAttribute("href"),
    ).toBe(
      "/api/reports/pdf?report=people-readiness&archiveState=archived&peopleView=staff",
    );
  });
});

describe("Owner Statement report workflow", () => {
  it("keeps the all-properties surface as an internal readiness workspace", () => {
    renderOwnerStatement();

    expect(screen.getAllByText("Owner Statement readiness").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Review which property and owner statements are ready before generating owner-facing documents.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Export CSV" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Export PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Print / PDF" })).toBeNull();

    const previewLinks = screen.getAllByRole("link", { name: "Preview" });
    const pdfLinks = screen.getAllByRole("link", { name: "PDF" });
    const printLinks = screen.getAllByRole("link", { name: "Print" });
    expect(previewLinks).toHaveLength(2);
    expect(pdfLinks).toHaveLength(2);
    expect(printLinks).toHaveLength(2);
    const previewParams = new URL(
      previewLinks[0].getAttribute("href")!,
      "http://localhost",
    ).searchParams;
    expect(previewParams.get("month")).toBe("2026-07");
    expect(previewParams.get("propertyId")).toBe(propertyOneId);
    expect(previewParams.get("ownerPersonId")).toBe(ownerOneId);
    expect(new URL(pdfLinks[0].getAttribute("href")!, "http://localhost").searchParams.get("ownerPersonId")).toBe(ownerOneId);
    expect(new URL(printLinks[0].getAttribute("href")!, "http://localhost").searchParams.get("print")).toBe("1");

    const blockedRow = screen.getByText("Blocked property / P2").closest("tr");
    expect(blockedRow).not.toBeNull();
    expect(within(blockedRow!).queryByRole("link", { name: "PDF" })).toBeNull();
    expect(within(blockedRow!).queryByRole("link", { name: "Print" })).toBeNull();
  });

  it("renders a quiet one-owner preview with financial facts and disclosures only", () => {
    renderOwnerStatement({
      ownerPersonId: ownerOneId,
      propertyId: propertyOneId,
    });

    expect(screen.getAllByText("Owner Statement").length).toBeGreaterThan(0);
    expect(screen.getByText("Owner One")).toBeTruthy();
    expect(screen.queryByText("Owner Two")).toBeNull();
    for (const label of [
      "Operating cash received",
      "Property expenses paid",
      "Management fees received",
      "Owner contributions",
      "Owner payouts",
      "Net owner cash movement",
      "Management fees earned",
      "Management fees outstanding from this period",
      "Security deposits held",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Ready with warning")).toBeNull();
    expect(screen.queryByText("9 evidence lines")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to readiness" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Export PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print / PDF" })).toBeTruthy();
  });

  it("shows actionable validation when a malformed recipient is normalized", () => {
    renderOwnerStatement({
      ownerPersonId: "all",
      ownerPersonIdInvalid: true,
      propertyId: propertyOneId,
    });

    expect(
      screen.getByText(
        "The selected owner is not a ready recipient for this property and month.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Print / PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Export PDF" })).toBeNull();
  });

  it("does not expose print or PDF controls for a blocked selected property", () => {
    renderOwnerStatement({
      ownerPersonId: ownerOneId,
      propertyId: propertyTwoId,
    });

    expect(
      screen.getByText(
        "This Owner Statement is not ready. Resolve the property blockers before generating it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Print / PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Export PDF" })).toBeNull();
  });

  it("opens the print dialog only from a ready recipient print URL", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    renderOwnerStatement({
      ownerPersonId: ownerOneId,
      print: true,
      propertyId: propertyOneId,
    });

    expect(print).toHaveBeenCalledOnce();
  });
});

function renderOwnerStatement(overrides: Partial<ReportsViewQuery> = {}) {
  const viewQuery: ReportsViewQuery = {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "owner-statement",
    status: "all",
    unitId: "all",
    ...overrides,
  };
  const data: ReportsScreenData = {
    propertyOptions: [
      { id: propertyOneId, label: "P1 - Property One" },
      { id: propertyTwoId, label: "P2 - Property Two" },
    ],
    trustedReport: ownerStatementReadinessReport(),
    viewQuery,
  };

  return render(
    <ReportBuilderScreen
      {...data}
      organizationName="Demo Organization"
    />,
  );
}

function ownerStatementReadinessReport(): TrustedReport {
  const columns: TrustedReport["columns"] = [
    { key: "readiness", label: "Status" },
    { key: "owner", label: "Owner" },
    { key: "property", label: "Property" },
    { key: "ownership", label: "Ownership share" },
    { align: "right", key: "operatingCash", label: "Operating cash received" },
    { align: "right", key: "propertyExpenses", label: "Property expenses paid" },
    { align: "right", key: "managementEarned", label: "Management fees earned" },
    { align: "right", key: "managementReceived", label: "Management fees received" },
    {
      align: "right",
      key: "managementOutstanding",
      label: "Management fees outstanding from this period",
    },
    { align: "right", key: "ownerContributions", label: "Owner contributions" },
    { align: "right", key: "ownerPayouts", label: "Owner payouts" },
    { align: "right", key: "depositsHeld", label: "Security deposits held" },
    { align: "right", key: "netMovement", label: "Net owner cash movement" },
    { key: "notes", label: "Notes" },
  ];
  const readyCells = {
    depositsHeld: "USD 900.00",
    managementEarned: "USD 30.00",
    managementOutstanding: "USD 40.00",
    managementReceived: "USD 50.00",
    netMovement: "USD 600.00",
    notes: "Owner contact details are missing",
    operatingCash: "USD 700.00",
    ownerContributions: "USD 60.00",
    ownerPayouts: "USD 70.00",
    ownership: "60.000%",
    property: "P1 - Property One",
    propertyExpenses: "USD 80.00",
    readiness: "Ready with warning",
  };

  return {
    columns,
    description:
      "Review which property and owner statements are ready before generating owner-facing documents.",
    emptyDescription: "No rows.",
    emptyTitle: "No owner statement rows",
    exportFilenameBase: "owner-statement",
    generatedAt: "2026-08-01T00:00:00.000Z",
    kind: "owner-statement",
    periodLabel: "01 Jul 2026 - 31 Jul 2026",
    rows: [
      {
        cells: { ...readyCells, owner: "Owner One" },
        evidence: [],
        id: `owner-statement:${propertyOneId}:${ownerOneId}`,
        ownerPersonId: ownerOneId,
        propertyId: propertyOneId,
        sourceCount: 9,
        sourceLinks: [],
        sourceSummary: "9 evidence lines",
        title: "Owner One / P1",
        tone: "warning",
      },
      {
        cells: {
          ...readyCells,
          owner: "Owner Two",
          ownership: "40.000%",
        },
        evidence: [],
        id: `owner-statement:${propertyOneId}:${ownerTwoId}`,
        ownerPersonId: ownerTwoId,
        propertyId: propertyOneId,
        sourceCount: 9,
        sourceLinks: [],
        sourceSummary: "9 evidence lines",
        title: "Owner Two / P1",
        tone: "success",
      },
      {
        cells: {
          notes: "No effective owner on 1 Jul 2026",
          owner: "Blocked",
          property: "P2 - Property Two",
          readiness: "Blocked",
        },
        evidence: [],
        id: `owner-statement-blocked:${propertyTwoId}`,
        propertyId: propertyTwoId,
        sourceCount: 1,
        sourceLinks: [],
        sourceSummary: "1 evidence line",
        title: "Blocked property / P2",
        tone: "danger",
      },
    ],
    scopeLabel: "All properties",
    summary: [
      { detail: "Ready properties", label: "Ready properties", sourceCount: 18, value: "1" },
      { detail: "Ready recipients", label: "Owner statements ready", sourceCount: 18, value: "2" },
      { detail: "Blocked", label: "Blocked properties", sourceCount: 1, value: "1" },
    ],
    title: "Owner Statement readiness",
    totalsTraceLabel: "Ready properties only.",
  };
}

function renderReportBuilder({
  report = reportFixture(),
  viewQuery = reportQuery(),
}: {
  report?: TrustedReport;
  viewQuery?: ReportsViewQuery;
} = {}) {
  return render(
    <ReportBuilderScreen
      organizationName="Demo Organization"
      propertyOptions={[
        { id: propertyOneId, label: "P1 - Property One" },
      ]}
      trustedReport={report}
      viewQuery={viewQuery}
    />,
  );
}

function reportQuery(
  overrides: Partial<ReportsViewQuery> = {},
): ReportsViewQuery {
  return {
    month: "2026-07",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    report: "rent-roll",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}

function reportFixture({
  rows = [
    {
      cells: { rent: "USD 1,234.00", status: "Occupied" },
      href: "/units/unit-1",
      id: "unit-1",
      sourceCount: 2,
      sourceLinks: [
        {
          href: "/units/unit-1",
          id: "unit-1",
          label: "Unit 101",
          recordType: "unit" as const,
        },
      ],
      sourceSummary: "2 linked source records",
      title: "Unit 101",
    },
  ],
}: {
  rows?: TrustedReport["rows"];
} = {}): TrustedReport {
  return {
    columns: [
      { key: "status", label: "Status" },
      { align: "right", key: "rent", label: "Rent" },
    ],
    description: "Current unit rent roll.",
    emptyDescription: "No units match the selected report scope.",
    emptyTitle: "No rent roll rows",
    exportFilenameBase: "rent-roll",
    generatedAt: "2026-07-31T00:00:00.000Z",
    kind: "rent-roll",
    periodLabel: "July 2026",
    rows,
    scopeLabel: "All properties",
    summary: [
      {
        detail: "Trusted occupied rent total",
        label: "Scheduled rent",
        sourceCount: 2,
        value: "USD 1,234.00",
      },
    ],
    title: "Rent Roll",
    totalsTraceLabel: "Cash receipts only.",
  };
}
