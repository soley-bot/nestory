/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import { buildPropertyDetail } from "@/features/properties/data/property-detail";

afterEach(cleanup);

describe("PropertyDetailScreen task-first detail contract", () => {
  it("keeps the property heading, context, and primary actions beside eight uncontained tabs", () => {
    const { container } = renderPropertyDetail();

    expect(
      screen.getAllByRole("heading", { level: 1, name: "Nestory Residence" }),
    ).toHaveLength(1);
    expect(screen.getByText("NST-001 / Serviced Apartment")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: property.nextAction.label })
        .getAttribute("href"),
    ).toBe(property.nextAction.href);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(8);
    expect(
      within(tablist).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual([
      "Overview",
      "Photos",
      "Units",
      "Finance",
      "Maintenance",
      "Documents",
      "Reports",
      "Timeline",
    ]);

    const tabNavigation = tablist.closest("nav");
    expect(tabNavigation?.className.split(" ")).not.toContain("rounded-md");
    expect(tabNavigation?.className.split(" ")).not.toContain("border");
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it("mounts only the selected panel and preserves unit record links", () => {
    renderPropertyDetail();

    expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Units" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Unit 04-01" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Units" }));

    const unitsPanel = screen.getByRole("tabpanel", { name: "Units" });
    expect(screen.queryByRole("tabpanel", { name: "Overview" })).toBeNull();
    expect(
      within(unitsPanel)
        .getAllByRole("link", { name: "Unit 04-01" })
        .every((link) => link.getAttribute("href") === "/units/unit-1"),
    ).toBe(true);
  });

  it("presents finance values in one semantic description list", () => {
    renderPropertyDetail();

    fireEvent.click(screen.getByRole("tab", { name: "Finance" }));

    const financePanel = screen.getByRole("tabpanel", { name: "Finance" });
    const financialSummary = financePanel.querySelector<HTMLElement>(
      'dl[aria-label="Financial summary"]',
    );
    expect(financialSummary).not.toBeNull();
    expect(financialSummary!.tagName).toBe("DL");
    expect(within(financialSummary!).getAllByRole("term")).toHaveLength(4);
    expect(within(financialSummary!).getByText("Revenue")).toBeTruthy();
    expect(within(financialSummary!).getByText("NOI")).toBeTruthy();
  });
});

function renderPropertyDetail() {
  return render(<PropertyDetailScreen ownerOptions={[]} property={property} />);
}

const property = buildPropertyDetail({
  activeLeases: [
    {
      id: "lease-1",
      lease_end_date: "2027-05-31",
      lease_start_date: "2026-06-01",
      monthly_rent_amount: 1200,
      monthly_rent_currency: "USD",
      status: "active",
      tenant_name: "Dara Tenant",
      unit_id: "unit-1",
    },
  ],
  activeOwner: { label: "Jane Owner", personId: "person-owner" },
  ledgerEntries: [
    {
      amount: 1200,
      category: "Rent",
      currency: "USD",
      description: "August rent",
      direction: "income",
      id: "entry-income",
      transaction_date: "2026-08-01",
      unit_id: "unit-1",
    },
    {
      amount: 100,
      category: "Maintenance",
      currency: "USD",
      description: "AC service",
      direction: "expense",
      id: "entry-expense",
      transaction_date: "2026-08-02",
      unit_id: "unit-1",
    },
  ],
  property: {
    address: "District 1",
    code: "NST-001",
    id: "property-1",
    name: "Nestory Residence",
    owner: "Jane Owner",
    property_type: "Serviced Apartment",
    status: "active",
  },
  units: [
    {
      archived_at: null,
      current_rent_amount: 1200,
      current_rent_currency: "USD",
      floor: "4",
      id: "unit-1",
      status: "occupied",
      unit_number: "04-01",
    },
  ],
});
