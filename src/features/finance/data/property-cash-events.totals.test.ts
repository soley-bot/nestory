import { describe, expect, it } from "vitest";
import {
  serializePropertyCashMovementTotals,
  summarizePropertyCashMovements,
} from "@/features/finance/data/property-cash-events.totals";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";

function event(
  sourceId: string,
  overrides: Partial<PropertyCashEvent> = {},
): PropertyCashEvent {
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
    ledgerEntryId: "55555555-5555-4555-8555-555555555555",
    managementFeeEffectCents: BigInt(0),
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: BigInt(1_000),
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerCashEffectCents: BigInt(1_000),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    propertyId: "11111111-1111-4111-8111-111111111111",
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
    unitId: null,
    vendorPersonId: null,
    ...overrides,
  };
}

async function* events(rows: PropertyCashEvent[]) {
  yield* rows;
}

describe("property cash movement totals", () => {
  it("streams resolved signed movements and isolates unresolved identities", async () => {
    const unresolvedId = "33333333-3333-4333-8333-333333333333";
    const totals = await summarizePropertyCashMovements(
      events([
        event("11111111-1111-4111-8111-111111111111"),
        event("22222222-2222-4222-8222-222222222222", {
          amountCents: BigInt(250),
          economicClass: "owner_contribution",
          operatingCashEffectCents: BigInt(0),
          ownerCashEffectCents: BigInt(250),
          sourceType: "owner_payment",
          eventKey: "owner_payment:22222222-2222-4222-8222-222222222222",
        }),
        event(unresolvedId, {
          depositLiabilityEffectCents: null,
          managementFeeEffectCents: null,
          operatingCashEffectCents: null,
          ownerCashEffectCents: null,
          resolutionReason: "Missing operational Ledger event",
          resolutionState: "unresolved",
        }),
        event("44444444-4444-4444-8444-444444444444", {
          amountCents: BigInt(-400),
          economicClass: "operating_expense",
          eventKey: "petty_cash_entry:44444444-4444-4444-8444-444444444444",
          operatingCashEffectCents: BigInt(-400),
          ownerCashEffectCents: BigInt(-400),
          sourceType: "petty_cash_entry",
        }),
      ]),
    );

    expect(serializePropertyCashMovementTotals(totals)).toEqual({
      currency: "USD",
      depositLiabilityMovement: "0.00",
      managementFeeEffect: "0.00",
      operatingExpenses: "-4.00",
      operatingIncome: "10.00",
      ownerCashMovement: "8.50",
      ownerContributions: "2.50",
      ownerDistributions: "0.00",
      resolvedCount: 3,
      unresolved: {
        count: 1,
        sources: [
          {
            eventKey: `receipt_allocation:${unresolvedId}`,
            sourceId: unresolvedId,
            sourceType: "receipt_allocation",
          },
        ],
      },
    });
  });

  it("does not convert unresolved effects into zero-valued evidence", async () => {
    const totals = await summarizePropertyCashMovements(
      events([
        event("11111111-1111-4111-8111-111111111111", {
          depositLiabilityEffectCents: null,
          managementFeeEffectCents: null,
          operatingCashEffectCents: null,
          ownerCashEffectCents: null,
          resolutionReason: "Missing operational Ledger event",
          resolutionState: "unresolved",
        }),
      ]),
    );

    expect(totals.countedEffectCount).toBe(0);
    expect(totals.unresolved.count).toBe(1);
  });

  it("rejects mixed-currency aggregation", async () => {
    await expect(
      summarizePropertyCashMovements(
        events([
          event("11111111-1111-4111-8111-111111111111"),
          event("22222222-2222-4222-8222-222222222222", {
            currency: "EUR" as "USD",
          }),
        ]),
      ),
    ).rejects.toThrow("mixed or unsupported currency");
  });
});
