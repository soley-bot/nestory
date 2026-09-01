/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/finance-sources/actions", () => ({
  archiveFinanceSourceAction: vi.fn(async () => ({})),
  createFinanceSourceAction: vi.fn(async () => ({})),
  restoreFinanceSourceAction: vi.fn(async () => ({})),
  updateFinanceSourceAction: vi.fn(async () => ({})),
}));

import { FinanceSourcesScreen } from "@/features/finance-sources/components/finance-sources-screen";

afterEach(cleanup);

describe("FinanceSourcesScreen", () => {
  it("explains the operational boundary and distinguishes source type and scope", () => {
    render(<FinanceSourcesScreen {...fixture()} canManageSources={false} />);

    expect(screen.getByRole("heading", { name: "Funding sources" })).toBeTruthy();
    expect(screen.getByText("This is not a chart of accounts or bank reconciliation.")).toBeTruthy();
    expect(screen.getByText("IPS collected funds")).toBeTruthy();
    expect(screen.getByText("Default collections")).toBeTruthy();
    expect(screen.getByText("Clearing")).toBeTruthy();
    expect(screen.getByText("Organization pooled")).toBeTruthy();
    expect(screen.getByText("Bank")).toBeTruthy();
    expect(screen.getByText("Property dedicated")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add funding source" })).toBeNull();
  });

  it("lets an administrator inspect immutable identity and manage lifecycle", () => {
    render(<FinanceSourcesScreen {...fixture()} canManageSources />);

    fireEvent.click(screen.getByRole("button", { name: "Manage IPS collected funds" }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("IPS_COLLECTIONS")).toBeTruthy();
    expect(within(drawer).getByText("USD")).toBeTruthy();
    expect(within(drawer).getByText(/Code, type, currency, and scope stay fixed/)).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Archive funding source" })).toBeTruthy();
  });

  it("shows archived sources through the lifecycle filter", () => {
    render(<FinanceSourcesScreen {...fixture()} canManageSources={false} />);

    expect(screen.queryByText("Former cash box")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archived 1" }));
    expect(screen.getByText("Former cash box")).toBeTruthy();
    expect(screen.queryByText("IPS collected funds")).toBeNull();
  });
});

function fixture() {
  return {
    properties: [{ id: "property-1", label: "RIV · Riverside House" }],
    sources: [
      {
        archivedAt: null,
        code: "IPS_COLLECTIONS",
        currency: "USD" as const,
        displayName: "IPS collected funds",
        id: "source-1",
        maskedReference: null,
        propertyId: null,
        propertyLabel: null,
        scopeKind: "organization_pooled" as const,
        sourceKind: "clearing" as const,
      },
      {
        archivedAt: null,
        code: "RIVERSIDE_BANK",
        currency: "USD" as const,
        displayName: "Riverside operating account",
        id: "source-2",
        maskedReference: "Ending 4821",
        propertyId: "property-1",
        propertyLabel: "RIV · Riverside House",
        scopeKind: "property_dedicated" as const,
        sourceKind: "bank" as const,
      },
      {
        archivedAt: "2026-08-01T00:00:00.000Z",
        code: "FORMER_CASH",
        currency: "USD" as const,
        displayName: "Former cash box",
        id: "source-3",
        maskedReference: null,
        propertyId: null,
        propertyLabel: null,
        scopeKind: "organization_pooled" as const,
        sourceKind: "cash" as const,
      },
    ],
  };
}
