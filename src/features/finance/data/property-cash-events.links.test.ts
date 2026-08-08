import { describe, expect, it } from "vitest";
import { resolvePropertyCashEventHref } from "@/features/finance/data/property-cash-events.links";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";

const propertyId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const obligationId = "44444444-4444-4444-8444-444444444444";

function event(overrides: Partial<PropertyCashEvent> = {}): PropertyCashEvent {
  return {
    amountCents: BigInt(1_000),
    categoryCode: "rent",
    contractVersion: "property_cash_events.v1",
    currency: "USD",
    depositLiabilityEffectCents: BigInt(0),
    description: "Tenant - Rent",
    economicClass: "operating_income",
    eventDate: "2026-07-15",
    eventKey: `receipt_allocation:${sourceId}`,
    isReversal: false,
    leaseId: null,
    ledgerEntryId: null,
    managementFeeEffectCents: BigInt(0),
    obligationId,
    obligationType: "finance_income_item",
    operatingCashEffectCents: BigInt(1_000),
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerCashEffectCents: BigInt(1_000),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    propertyId,
    reconciliationSourceId: null,
    reference: null,
    resolutionReason: null,
    resolutionState: "resolved",
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    taskId: null,
    tenantPersonId: null,
    unitId,
    vendorPersonId: null,
    ...overrides,
  };
}

describe("property cash source links", () => {
  it.each(["receipt_allocation", "owner_collection_allocation"] as const)(
    "targets %s to its income obligation",
    (sourceType) => {
      expect(
        resolvePropertyCashEventHref(
          event({
            eventKey: `${sourceType}:${sourceId}`,
            sourceType,
          }),
        ),
      ).toBe(
        `/rent-income?archiveState=all&incomeItemId=${obligationId}&month=2026-07&propertyId=${propertyId}&unitId=${unitId}`,
      );
    },
  );

  it("targets a payment allocation's expense obligation", () => {
    expect(
      resolvePropertyCashEventHref(
        event({
          economicClass: "operating_expense",
          obligationType: "finance_expense_item",
          sourceType: "payment_allocation",
        }),
      ),
    ).toBe(
      `/bills-expenses?archiveState=all&dateBasis=paid&expenseItemId=${obligationId}&month=2026-07&propertyId=${propertyId}&unitId=${unitId}`,
    );
  });

  it("targets a deposit event's lease", () => {
    const leaseId = "55555555-5555-4555-8555-555555555555";
    expect(
      resolvePropertyCashEventHref(event({ leaseId, sourceType: "deposit_event" })),
    ).toBe(`/leases?archiveState=all&leaseId=${leaseId}`);
  });

  it("targets petty cash entries directly", () => {
    expect(
      resolvePropertyCashEventHref(event({ sourceType: "petty_cash_entry" })),
    ).toBe(`/petty-cash?entryId=${sourceId}`);
  });

  it.each(["owner_payment", "property_withdrawal"] as const)(
    "targets %s to the property account",
    (sourceType) => {
      expect(resolvePropertyCashEventHref(event({ sourceType }))).toBe(
        `/properties/${propertyId}/account`,
      );
    },
  );
});
