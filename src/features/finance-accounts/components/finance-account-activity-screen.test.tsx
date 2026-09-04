// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceAccountActivityScreen } from "@/features/finance-accounts/components/finance-account-activity-screen";
import type { FinanceAccountActivity } from "@/features/finance-accounts/data/finance-account-activity";

describe("FinanceAccountActivityScreen", () => {
  it("shows identity, status, filters, basis total, and source-linked activity", () => {
    // Break caught: a generic transaction table hides whether the total is a
    // cash projection and removes the authoritative drill-through.
    render(<FinanceAccountActivityScreen activity={fixture()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Operating account" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Recorded cash activity")).toBeInTheDocument();
    expect(screen.getAllByText("USD 700.00")).toHaveLength(2);
    expect(screen.getByLabelText("From")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-08-31");
    expect(screen.getByLabelText("Property")).toHaveValue("all");
    const row = screen.getByRole("row", { name: /15 Aug 2026.*RIV.*Tara Tenant.*Rent payment.*USD 700\.00/i });
    expect(within(row).getByRole("link", { name: "Rent payment" })).toHaveAttribute(
      "href",
      "/rent-income?archiveState=all&incomeItemId=income-1",
    );
    expect(screen.queryByRole("columnheader", { name: "Running balance" })).not.toBeInTheDocument();
  });

  it("shows a running-balance column only for an authoritative supplied balance", () => {
    // Break caught: always showing a balance column encourages callers to fill
    // it with accumulated period activity even when the source has no balance.
    const activity = fixture();
    activity.runningBalance = "925.00";
    activity.rows[0]!.runningBalance = "925.00";

    render(<FinanceAccountActivityScreen activity={activity} />);

    expect(screen.getByRole("columnheader", { name: "Running balance" })).toBeInTheDocument();
    expect(screen.getByText("USD 925.00")).toBeInTheDocument();
  });
});

function fixture(): FinanceAccountActivity {
  return {
    account: {
      accountClass: "asset",
      accountNumber: "1000",
      accountSubtype: "bank",
      archivedAt: "2026-09-01T00:00:00.000Z",
      displayName: "Operating account",
      id: "operating-account",
      propertyId: null,
      propertyLabel: null,
    },
    basisLabel: "Recorded cash activity",
    filters: {
      periodEnd: "2026-08-31",
      periodStart: "2026-08-01",
    },
    properties: [
      { id: "property-1", label: "RIV · Riverside" },
      { id: "property-2", label: "HIL · Hill House" },
    ],
    rows: [{
      contact: "Tara Tenant",
      date: "2026-08-15",
      decrease: null,
      description: "Rent payment",
      id: "receipt_allocation:receipt-1",
      increase: "700.00",
      propertyId: "property-1",
      propertyLabel: "RIV · Riverside",
      runningBalance: null,
      sourceHref: "/rent-income?archiveState=all&incomeItemId=income-1",
    }],
    runningBalance: null,
    total: "700.00",
  };
}
