/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/features/owner-balances/lifecycle-actions", () => ({
  allocateOwnerEventAction: vi.fn(),
  generateOwnerBalancePeriodAction: vi.fn(),
  recordOwnerCashEventAction: vi.fn(),
  recordOwnerDistributionAction: vi.fn(),
  reverseOwnerInvoicePaymentAction: vi.fn(),
  reversePropertyWithdrawalAction: vi.fn(),
  transferOwnerBalanceComponentAction: vi.fn(),
}));

import { OwnerBalanceLedger } from "@/features/owner-balances/components/owner-balance-ledger";
import type { OwnerBalanceData } from "@/features/owner-balances/owner-balance.types";

const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const sourceId = "00000000-0000-4000-8000-000000000004";
const sourceLineId = "00000000-0000-4000-8000-000000000005";
const allocationSetId = "00000000-0000-4000-8000-000000000006";
const movementId = "00000000-0000-4000-8000-000000000007";

describe("OwnerBalanceLedger", () => {
  it("renders exact authoritative components, source lineage, and typed remediation", () => {
    render(
      <OwnerBalanceLedger
        canAllocate
        canCorrect
        canTransfer
        data={data()}
        openingAuthority={<div>Opening authority queue</div>}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(screen.getByRole("heading", { name: "Authoritative owner balance" })).toBeTruthy();
    expect(screen.getByText("Opening authority queue")).toBeTruthy();
    const period = screen.getByTestId("owner-period-2026-08-01");
    expect(within(period).getByText("USD 900,719,925,474.09")).toBeTruthy();
    expect(within(period).getByText("USD 0.09")).toBeTruthy();
    expect(within(period).getByText("USD 2.00")).toBeTruthy();
    expect(within(period).getByText(/Held cash closing: USD 900,719,925,474.09/)).toBeTruthy();
    expect(within(period).queryByText(/Available withdrawal/)).toBeNull();
    expect(within(period).getByText(/Input watermark: 2026-08-31T00:00:00Z/)).toBeTruthy();

    const capacity = screen.getByTestId("owner-withdrawal-capacity");
    expect(within(capacity).getByText("Current checked withdrawal capacity")).toBeTruthy();
    expect(within(capacity).getByText("USD 900,719,925,374.09")).toBeTruthy();
    expect(within(capacity).getByText(/As of 2026-08-31/)).toBeTruthy();
    expect(within(capacity).getByText(/Committed or reserved: USD 100.00/)).toBeTruthy();

    const source = screen.getByTestId(`owner-source-${allocationSetId}`);
    expect(within(source).getByText("Tenant rent receipt")).toBeTruthy();
    expect(within(source).getByText(/Roster 100.000%/)).toBeTruthy();
    expect(within(source).getByText(/Source fingerprint: b{64}/)).toBeTruthy();
    expect(within(source).getByText("IPS-held owner cash +USD 100.01")).toBeTruthy();

    const remediation = screen.getByTestId(`owner-remediation-${sourceLineId}`);
    expect(within(remediation).getByText("Ownership needs resolution")).toBeTruthy();
    expect(within(remediation).getByText(/owner_roster_missing/)).toBeTruthy();
    expect(within(remediation).getByRole("link", { name: "Resolve ownership" }).getAttribute("href"))
      .toBe(`/properties/${propertyId}`);
  });

  it("exposes only the checked actions delegated to the current role", () => {
    const { rerender } = render(
      <OwnerBalanceLedger
        canAllocate
        canCorrect
        canTransfer={false}
        data={data()}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(screen.getByRole("button", { name: "Allocate source" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate month" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record owner contribution" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record owner reimbursement" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record owner distribution" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Transfer component" })).toBeNull();

    rerender(
      <OwnerBalanceLedger
        canAllocate={false}
        canCorrect={false}
        canTransfer={false}
        data={data()}
        organizationName="IPS"
        selectedMonth="2026-08"
        selectedOwnerPersonId={ownerId}
        selectedPropertyId={propertyId}
      />,
    );

    expect(screen.queryByRole("button", { name: "Allocate source" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate month" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Record owner/ })).toBeNull();
  });

  it("renders a fail-closed scope prompt instead of guessing an owner", () => {
    render(
      <OwnerBalanceLedger
        canAllocate
        canCorrect
        canTransfer
        data={{ ...data(), periods: [], queue: [], sources: [] }}
        organizationName="IPS"
        selectedMonth="2026-08"
      />,
    );

    expect(screen.getByText(/Select an exact property and owner assignment/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate month" })).toBeNull();
  });

  it.each(["historical_not_eligible", "period_stale"])(
    "does not present %s closing cash as current withdrawal capacity",
    (status) => {
      const blocked = data() as unknown as {
        withdrawalCapacity: Record<string, unknown>;
      };
      blocked.withdrawalCapacity = {
        asOfDate: "2026-07-31",
        authoritativeHeldCash: "500.00",
        availableWithdrawal: null,
        committedReserved: "25.00",
        periodStatus: status === "period_stale" ? "stale" : "ready",
        status,
      };

      render(
        <OwnerBalanceLedger
          canAllocate
          canCorrect
          canTransfer={false}
          data={blocked as unknown as OwnerBalanceData}
          organizationName="IPS"
          selectedMonth="2026-07"
          selectedOwnerPersonId={ownerId}
          selectedPropertyId={propertyId}
        />,
      );

      const capacity = screen.getByTestId("owner-withdrawal-capacity");
      expect(within(capacity).getByText("Withdrawal capacity unavailable")).toBeTruthy();
      expect(within(capacity).queryByText("USD 500.00")).toBeNull();
    },
  );
});

function data(): OwnerBalanceData {
  return {
    ownerOptions: [{ id: ownerId, label: "Nora Owner" }],
    periods: [{
      availableWithdrawal: "900719925474.09" as never,
      blockedReasonCode: null,
      blockedReasonDetail: null,
      components: [
        { closingAmount: "900719925474.09" as never, component: "ips_held_owner_cash", movementAmount: "0.09" as never, openingAmount: "900719925474.00" as never },
        { closingAmount: "2.00" as never, component: "owner_due_to_ips", movementAmount: "-3.00" as never, openingAmount: "5.00" as never },
        { closingAmount: "4.00" as never, component: "ips_due_to_owner", movementAmount: "4.00" as never, openingAmount: "0.00" as never },
        { closingAmount: "50.00" as never, component: "security_deposit_custody", movementAmount: "50.00" as never, openingAmount: "0.00" as never },
      ],
      id: "00000000-0000-4000-8000-000000000009",
      inputHash: "a".repeat(64),
      inputWatermark: "2026-08-31T00:00:00Z",
      monthStart: "2026-08-01",
      status: "ready",
    }],
    propertyOptions: [{ id: propertyId, label: "RS-01 — Riverside" }],
    queue: [{
      allocationSetId: null,
      allocationState: "blocked",
      eventDate: "2026-08-15",
      grossSignedAmount: "-100.01" as never,
      remediationCode: "owner_roster_missing",
      remediationDetail: { setup_path: `/properties/${propertyId}` },
      sourceId,
      sourceLineId,
      sourceType: "owner_paid_cost",
    }],
    sources: [{
      allocatedGrossSignedAmount: "100.01" as never,
      allocationBasis: "effective_roster",
      allocationSetId,
      eventDate: "2026-08-10",
      grossSignedAmount: "100.01" as never,
      movements: [{
        component: "ips_held_owner_cash",
        id: movementId,
        reversalOfMovementId: null,
        signedAmount: "100.01" as never,
      }],
      ownershipPercentSnapshot: "100.000",
      ownershipRosterHash: "c".repeat(64),
      reversalOfAllocationSetId: null,
      sourceFingerprint: "b".repeat(64),
      sourceId,
      sourceLineId,
      sourceType: "tenant_rent_receipt",
    }],
    withdrawalCapacity: {
      asOfDate: "2026-08-31",
      authoritativeHeldCash: "900719925474.09" as never,
      availableWithdrawal: "900719925374.09" as never,
      committedReserved: "100.00" as never,
      periodStatus: "ready",
      status: "available",
    },
  } as unknown as OwnerBalanceData;
}
