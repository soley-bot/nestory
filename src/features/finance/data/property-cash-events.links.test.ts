import { describe, expect, it } from "vitest";
import { resolvePropertyCashEventHref } from "@/features/finance/data/property-cash-events.links";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";

const propertyId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const obligationId = "44444444-4444-4444-8444-444444444444";

function event(
  overrides: Partial<PropertyCashEvent> = {},
): PropertyCashEvent {
  return {
    amountCents: BigInt(1_000),
    archivedAt: null,
    categoryCode: "rent",
    classificationStatus: "source_stable",
    contractVersion: "property_cash_events_v1",
    createdAt: "2026-07-01T00:00:00Z",
    createdBy: null,
    currency: "USD",
    depositLiabilityEffectCents: BigInt(0),
    economicClass: "operating_income",
    eventDate: "2026-07-15",
    eventKey: `receipt_allocation:${sourceId}`,
    isLegacy: false,
    isReversal: false,
    journalEntryId: null,
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
    projectionStatus: null,
    propertyId,
    reconciliationSourceId: null,
    reconciliationState: "not_required",
    requiresResolution: false,
    resolutionCodes: [],
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    statementSection: "income",
    taskId: null,
    tenantPersonId: null,
    unitId,
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
    ...overrides,
  };
}

describe("property cash source links", () => {
  it("targets a receipt allocation's exact income obligation context", () => {
    expect(resolvePropertyCashEventHref(event())).toBe(
      `/rent-income?archiveState=all&incomeItemId=${obligationId}&month=2026-07&propertyId=${propertyId}&unitId=${unitId}`,
    );
  });

  it("targets a payment allocation's exact expense obligation context", () => {
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

  it("keeps an unresolved receipt header residual in property receipt context", () => {
    expect(
      resolvePropertyCashEventHref(
        event({
          obligationId: null,
          obligationType: null,
          sourceType: "receipt_header_residual",
          unitId: null,
        }),
      ),
    ).toBe(
      `/rent-income?archiveState=all&month=2026-07&propertyId=${propertyId}`,
    );
  });

  it("keeps an unresolved payment header residual in property payment context", () => {
    expect(
      resolvePropertyCashEventHref(
        event({
          economicClass: "legacy_unclassified",
          obligationId: null,
          obligationType: null,
          sourceType: "payment_header_residual",
          unitId: null,
        }),
      ),
    ).toBe(
      `/bills-expenses?archiveState=all&dateBasis=paid&month=2026-07&propertyId=${propertyId}`,
    );
  });

  it.each([
    ["ledger_entry", "/ledger?archiveState=all&entryId=", {}],
    ["maintenance_task", "/maintenance?archiveState=all&taskId=", { taskId: sourceId }],
    ["petty_cash_entry", "/petty-cash?entryId=", {}],
  ] as const)(
    "targets the exact %s record",
    (sourceType, expectedPrefix, overrides) => {
      expect(
        resolvePropertyCashEventHref(
          event({ sourceType, ...overrides }),
        ),
      ).toBe(`${expectedPrefix}${sourceId}`);
    },
  );

  it("targets the exact lease for a deposit event", () => {
    const leaseId = "55555555-5555-4555-8555-555555555555";
    expect(
      resolvePropertyCashEventHref(
        event({ leaseId, sourceType: "deposit_event" }),
      ),
    ).toBe(`/leases?archiveState=all&leaseId=${leaseId}`);
  });
});
