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
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: BigInt(1_000),
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerCashEffectCents: BigInt(1_000),
    ownerPersonId: null,
    periodStart: "2026-07-01",
    projectionStatus: null,
    propertyId: "11111111-1111-4111-8111-111111111111",
    requiresResolution: false,
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    statementSection: "income",
    taskId: null,
    tenantPersonId: null,
    unitId: null,
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
    ...overrides,
  };
}

async function* events(rows: PropertyCashEvent[]) {
  yield* rows;
}

describe("property cash movement totals", () => {
  it("streams signed movements without synthesizing state balances", async () => {
    const provisionalId = "22222222-2222-4222-8222-222222222222";
    const unresolvedId = "33333333-3333-4333-8333-333333333333";
    const totals = await summarizePropertyCashMovements(
      events([
        event("11111111-1111-4111-8111-111111111111"),
        event(provisionalId, {
          amountCents: BigInt(250),
          classificationStatus: "provisional_current_obligation",
          economicClass: "owner_contribution",
          operatingCashEffectCents: BigInt(0),
          ownerCashEffectCents: BigInt(250),
          requiresResolution: true,
          sourceType: "receipt_allocation",
        }),
        event(unresolvedId, {
          classificationStatus: "unresolved_evidence",
          economicClass: "legacy_unclassified",
          managementFeeEffectCents: null,
          operatingCashEffectCents: null,
          ownerCashEffectCents: null,
          depositLiabilityEffectCents: null,
          requiresResolution: true,
          sourceType: "ledger_entry",
        }),
        event("44444444-4444-4444-8444-444444444444", {
          amountCents: BigInt(400),
          economicClass: "operating_expense",
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
      ownerReserves: "0.00",
      provisional: {
        count: 1,
        sources: [
          {
            eventKey: `receipt_allocation:${provisionalId}`,
            sourceId: provisionalId,
            sourceType: "receipt_allocation",
          },
        ],
      },
      requiresResolutionCount: 2,
      sourceStableCount: 2,
      unresolved: {
        count: 1,
        sources: [
          {
            eventKey: `receipt_allocation:${unresolvedId}`,
            sourceId: unresolvedId,
            sourceType: "ledger_entry",
          },
        ],
      },
    });
  });

  it("never converts unknown effects into zero-valued evidence", async () => {
    const totals = await summarizePropertyCashMovements(
      events([
        event("11111111-1111-4111-8111-111111111111", {
          classificationStatus: "unresolved_source_scope",
          depositLiabilityEffectCents: null,
          managementFeeEffectCents: null,
          operatingCashEffectCents: null,
          ownerCashEffectCents: null,
          requiresResolution: true,
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

  it("rejects a diagnostic identity limit above 10,000 before iteration", async () => {
    let started = false;
    async function* trackedEvents() {
      started = true;
      yield event("11111111-1111-4111-8111-111111111111");
    }

    await expect(
      summarizePropertyCashMovements(trackedEvents(), {
        diagnosticSourceLimit: 10_001,
      }),
    ).rejects.toThrow("cannot exceed 10,000");
    expect(started).toBe(false);
  });
});
