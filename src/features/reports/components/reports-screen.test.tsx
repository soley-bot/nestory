/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportBuilderScreen } from "@/features/reports/components/reports-screen";
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
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
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
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeTruthy();
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
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
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
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
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
