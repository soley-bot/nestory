/* @vitest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  financeData: vi.fn(),
  ownerBalanceData: vi.fn(),
  requireFinanceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData: mocks.financeData,
}));
vi.mock("@/features/finance-operations/components/finance-operations-screen", () => ({
  FinanceOperationsScreen: () => (
    <main>
      <h1>Legacy property account</h1>
    </main>
  ),
}));
vi.mock("@/features/owner-balances/data/owner-balances", () => ({
  getOwnerBalanceData: mocks.ownerBalanceData,
}));
vi.mock("@/features/owner-balances/lifecycle-actions", () => ({
  allocateOwnerEventAction: vi.fn(),
  generateOwnerBalancePeriodAction: vi.fn(),
  recordOwnerCashEventAction: vi.fn(),
  recordOwnerDistributionAction: vi.fn(),
  reverseOwnerInvoicePaymentAction: vi.fn(),
  reversePropertyWithdrawalAction: vi.fn(),
  transferOwnerBalanceComponentAction: vi.fn(),
}));

import PropertyAccountPage from "./page";

const propertyId = "10000000-0000-0000-0000-000000000001";
const ownerId = "20000000-0000-0000-0000-000000000001";

describe("PropertyAccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({
      capabilities: {
        canCorrectFinance: true,
        canOperateFinance: true,
      },
      organizationId: "30000000-0000-0000-0000-000000000001",
      organizationName: "IPS Property Management",
      role: "super_admin",
    });
    mocks.financeData.mockResolvedValue({
      positions: [{ propertyId }],
    });
    mocks.ownerBalanceData.mockResolvedValue({
      ownerOptions: [{ id: ownerId, label: "Dara Owner" }],
      periods: [{
        availableWithdrawal: "205.00",
        blockedReasonCode: null,
        blockedReasonDetail: null,
        components: [
          { closingAmount: "205.00", component: "ips_held_owner_cash", movementAmount: "205.00", openingAmount: "0.00" },
          { closingAmount: "0.00", component: "owner_due_to_ips", movementAmount: "0.00", openingAmount: "0.00" },
          { closingAmount: "200.50", component: "ips_due_to_owner", movementAmount: "200.50", openingAmount: "0.00" },
          { closingAmount: "0.00", component: "security_deposit_custody", movementAmount: "0.00", openingAmount: "0.00" },
        ],
        id: "40000000-0000-0000-0000-000000000001",
        inputHash: "a".repeat(64),
        inputWatermark: "2026-08-31T00:00:00Z",
        monthStart: "2026-08-01",
        status: "ready",
      }],
      propertyOptions: [{ id: propertyId, label: "CTR-RES — Central Residence" }],
      queue: [
        {
          allocationSetId: "90000000-0000-0000-0000-000000000001",
          allocationState: "allocated",
          eventDate: "2026-08-13",
          grossSignedAmount: "825.00",
          remediationCode: null,
          remediationDetail: null,
          sourceId: "70000000-0000-0000-0000-000000000001",
          sourceLineId: "80000000-0000-0000-0000-000000000001",
          sourceType: "tenant_rent_receipt",
        },
        {
          allocationSetId: null,
          allocationState: "blocked",
          eventDate: "2026-08-14",
          grossSignedAmount: "100.00",
          remediationCode: "owner_roster_missing",
          remediationDetail: null,
          sourceId: "70000000-0000-0000-0000-000000000004",
          sourceLineId: "80000000-0000-0000-0000-000000000004",
          sourceType: "owner_paid_cost",
        },
      ],
      sources: [
        {
          allocatedGrossSignedAmount: "825.00",
          allocationBasis: "effective_roster",
          allocationSetId: "50000000-0000-0000-0000-000000000001",
          eventDate: "2026-08-13",
          grossSignedAmount: "825.00",
          movements: [{
            component: "ips_held_owner_cash",
            id: "60000000-0000-0000-0000-000000000001",
            reversalOfMovementId: null,
            signedAmount: "825.00",
          }],
          ownershipPercentSnapshot: "100.000",
          ownershipRosterHash: "b".repeat(64),
          reversalOfAllocationSetId: null,
          sourceFingerprint: "c".repeat(64),
          sourceId: "70000000-0000-0000-0000-000000000001",
          sourceLineId: "80000000-0000-0000-0000-000000000001",
          sourceType: "tenant_rent_receipt",
        },
        {
          allocatedGrossSignedAmount: "900.00",
          allocationBasis: "explicit_owner",
          allocationSetId: "50000000-0000-0000-0000-000000000002",
          eventDate: "2026-08-13",
          grossSignedAmount: "900.00",
          movements: [],
          ownershipPercentSnapshot: "100.000",
          ownershipRosterHash: "d".repeat(64),
          reversalOfAllocationSetId: null,
          sourceFingerprint: "e".repeat(64),
          sourceId: "70000000-0000-0000-0000-000000000002",
          sourceLineId: "80000000-0000-0000-0000-000000000002",
          sourceType: "owner_direct_rent_receipt",
        },
        {
          allocatedGrossSignedAmount: "100.00",
          allocationBasis: "explicit_owner",
          allocationSetId: "50000000-0000-0000-0000-000000000003",
          eventDate: "2026-08-14",
          grossSignedAmount: "100.00",
          movements: [],
          ownershipPercentSnapshot: "100.000",
          ownershipRosterHash: "f".repeat(64),
          reversalOfAllocationSetId: null,
          sourceFingerprint: "1".repeat(64),
          sourceId: "70000000-0000-0000-0000-000000000003",
          sourceLineId: "80000000-0000-0000-0000-000000000003",
          sourceType: "owner_direct_rent_receipt",
        },
        ...Array.from({ length: 6 }, (_, index) => extraActivitySource(index)),
      ],
      withdrawalCapacity: {
        asOfDate: "2026-08-31",
        authoritativeHeldCash: "205.00",
        availableWithdrawal: "205.00",
        committedReserved: "0.00",
        periodStatus: "ready",
        status: "available",
      },
    });
  });

  it("uses the authoritative balance model for the property account", async () => {
    render(
      await PropertyAccountPage({
        params: Promise.resolve({ propertyId }),
      }),
    );

    expect(screen.queryByRole("heading", { name: "Legacy property account" })).toBeNull();
    const heading = screen.getByRole("heading", { name: "Property account" });
    expect(heading).toBeTruthy();
    expect(heading.closest("header")?.className).toContain("px-4");
    expect(heading.closest("header")?.className).toContain("sm:px-6");

    const propertyTabs = screen.getByRole("navigation", {
      name: "Property record sections",
    });
    expect(within(propertyTabs).getAllByRole("tab")).toHaveLength(5);
    expect(
      within(propertyTabs).getByRole("tab", { name: "Finance" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(
      within(propertyTabs).getByRole("tab", { name: "Units" }).getAttribute("href"),
    ).toBe(`/properties/${propertyId}?section=units`);

    const position = screen.getByRole("region", { name: "Owner cash position" });
    const workspace = position.closest('[data-slot="property-account-workspace"]');
    expect(workspace?.className).toContain("px-4");
    expect(workspace?.className).toContain("sm:px-6");
    expect(
      within(position).getByText("Cash collected by IPS Property Management"),
    ).toBeTruthy();
    expect(within(position).getByText("Available to distribute")).toBeTruthy();
    expect(within(position).getByText("Cash collected by owner")).toBeTruthy();
    expect(within(position).queryByText("Cash currently in Nestory custody")).toBeNull();
    expect(
      within(position).queryByText("Cash that can be paid to the owner now"),
    ).toBeNull();
    expect(
      within(position).queryByText("Already received by the owner, not held here"),
    ).toBeNull();
    expect(within(position).getAllByText("USD 205.00")).toHaveLength(2);
    expect(within(position).getByText("USD 1,000.00")).toBeTruthy();

    const activity = screen.getByRole("region", { name: "Owner account activity" });
    expect(within(position).queryByText("Owner reimbursement due")).toBeNull();
    expect(within(activity).getByText("Owner reimbursement due")).toBeTruthy();
    expect(within(activity).getByText("USD 200.50")).toBeTruthy();
    expect(screen.queryByText("Nestory owes owner")).toBeNull();
    expect(within(activity).getByText("1 source issue")).toBeTruthy();
    const activityFilter = within(activity).getByRole("combobox", {
      name: "Activity filter",
    });
    expect(activityFilter).toBeTruthy();
    const activityFilterForm = activityFilter.closest("form");
    expect(activityFilterForm).toBeTruthy();
    expect(within(activityFilterForm!).queryByText("Activity")).toBeNull();
    expect(within(activity).getByText("1–8 of 9")).toBeTruthy();
    expect(within(activity).getAllByRole("row")).toHaveLength(9);
    expect(
      within(activity).getByRole("columnheader", { name: "Details" }),
    ).toBeTruthy();
    expect(
      within(activity).queryByRole("columnheader", { name: "Money position" }),
    ).toBeNull();
    expect(within(activity).getByRole("link", { name: "Next" })).toBeTruthy();
    expect(within(activity).getAllByText("Held by Nestory").length).toBeGreaterThan(0);
    expect(within(activity).getAllByText("Collected by owner")).toHaveLength(2);
  });
});

function extraActivitySource(index: number) {
  const suffix = String(index + 10).padStart(12, "0");
  return {
    allocatedGrossSignedAmount: "25.00",
    allocationBasis: "explicit_owner",
    allocationSetId: `50000000-0000-0000-0000-${suffix}`,
    eventDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
    grossSignedAmount: "25.00",
    movements: [{
      component: "ips_held_owner_cash",
      id: `60000000-0000-0000-0000-${suffix}`,
      reversalOfMovementId: null,
      signedAmount: "25.00",
    }],
    ownershipPercentSnapshot: "100.000",
    ownershipRosterHash: String(index + 2).repeat(64).slice(0, 64),
    reversalOfAllocationSetId: null,
    sourceFingerprint: String(index + 3).repeat(64).slice(0, 64),
    sourceId: `70000000-0000-0000-0000-${suffix}`,
    sourceLineId: `80000000-0000-0000-0000-${suffix}`,
    sourceType: "owner_contribution",
  };
}
