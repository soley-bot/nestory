import { describe, expect, it } from "vitest";
import {
  iteratePropertyCashEventPages,
  loadPropertyCashEventPage,
  normalizePropertyCashEvent,
} from "@/features/finance/data/property-cash-events";
import type {
  PropertyCashEventDatabaseRow,
  PropertyCashEventsRpcClient,
} from "@/features/finance/data/property-cash-events.types";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";

function row(
  sourceId: string,
  overrides: Partial<PropertyCashEventDatabaseRow> = {},
): PropertyCashEventDatabaseRow {
  return {
    amount: "10.00",
    category_code: "rent",
    contract_version: "property_cash_events.v1",
    currency: "USD",
    cursor_event_date: "2026-07-15",
    cursor_source_id: sourceId,
    cursor_source_type: "receipt_allocation",
    deposit_liability_effect: "0.00",
    description: "Tenant - Rent",
    economic_class: "operating_income",
    event_date: "2026-07-15",
    event_key: `receipt_allocation:${sourceId}`,
    is_reversal: false,
    lease_id: null,
    ledger_entry_id: "55555555-5555-4555-8555-555555555555",
    management_fee_effect: "0.00",
    obligation_id: null,
    obligation_type: null,
    operating_cash_effect: "10.00",
    organization_id: organizationId,
    owner_cash_effect: "10.00",
    owner_person_id: null,
    period_start: "2026-07-01",
    property_id: propertyId,
    reconciliation_source_id: null,
    reference: null,
    resolution_reason: null,
    resolution_state: "resolved",
    reversal_source_id: null,
    reversal_source_type: null,
    source_id: sourceId,
    source_parent_id: null,
    source_parent_type: null,
    source_type: "receipt_allocation",
    task_id: null,
    tenant_person_id: null,
    unit_id: unitId,
    vendor_person_id: null,
    ...overrides,
  };
}

function clientWithPages(
  pages: PropertyCashEventDatabaseRow[][],
  calls: Array<Record<string, unknown>> = [],
): PropertyCashEventsRpcClient {
  let index = 0;
  return {
    async rpc(name, args) {
      expect(name).toBe("get_property_cash_events_page");
      calls.push(args);
      return { data: pages[index++] ?? [], error: null };
    },
  };
}

const scope = {
  currency: "USD" as const,
  organizationId,
  pageSize: 2,
  periodEnd: "2026-07-31",
  periodStart: "2026-07-01",
  propertyId,
  unitId,
};

describe("property cash event adapter", () => {
  it("normalizes exact signed movements without accounting compatibility fields", () => {
    const sourceId = "44444444-4444-4444-8444-444444444444";
    const normalized = normalizePropertyCashEvent(
      row(sourceId, {
        amount: "-4.25",
        category_code: "expense_maintenance",
        cursor_source_type: "payment_allocation",
        economic_class: "operating_expense",
        event_key: `payment_allocation:${sourceId}`,
        operating_cash_effect: "-4.25",
        owner_cash_effect: "-4.25",
        source_type: "payment_allocation",
      }),
    );

    expect(normalized.amountCents).toBe(BigInt(-425));
    expect(normalized.operatingCashEffectCents).toBe(BigInt(-425));
    expect(normalized.resolutionState).toBe("resolved");
    expect(normalized).not.toHaveProperty("journalEntryId");
    expect(normalized).not.toHaveProperty("isLegacy");
  });

  it("keeps unresolved source evidence explicit and excludes every effect", () => {
    const normalized = normalizePropertyCashEvent(
      row("44444444-4444-4444-8444-444444444444", {
        deposit_liability_effect: null,
        management_fee_effect: null,
        operating_cash_effect: null,
        owner_cash_effect: null,
        resolution_reason: "Exact operational Ledger event is missing",
        resolution_state: "unresolved",
      }),
    );

    expect(normalized.resolutionState).toBe("unresolved");
    expect(normalized.ownerCashEffectCents).toBeNull();
    expect(normalized.resolutionReason).toContain("Ledger event");
  });

  it.each([
    [
      { resolution_reason: "wrong" },
      "Resolved property cash events require complete effects",
    ],
    [
      {
        deposit_liability_effect: null,
        management_fee_effect: null,
        operating_cash_effect: null,
        owner_cash_effect: null,
        resolution_state: "unresolved",
      },
      "Unresolved property cash events require a reason",
    ],
    [{ amount: "0.00" }, "amount cannot be zero"],
    [{ cursor_source_id: propertyId }, "cursor identity is inconsistent"],
  ])("rejects an invalid operational contract row", (overrides, message) => {
    expect(() =>
      normalizePropertyCashEvent(
        row("44444444-4444-4444-8444-444444444444", overrides),
      ),
    ).toThrow(message);
  });

  it("traverses keyset pages and applies the unit filter without corrupting the cursor", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const filteredId = "22222222-2222-4222-8222-222222222222";
    const lastId = "33333333-3333-4333-8333-333333333333";
    const calls: Array<Record<string, unknown>> = [];
    const iterator = iteratePropertyCashEventPages(
      clientWithPages(
        [
          [
            row(firstId),
            row(filteredId, {
              unit_id: "99999999-9999-4999-8999-999999999999",
            }),
          ],
          [
            row(lastId, {
              cursor_event_date: "2026-07-16",
              event_date: "2026-07-16",
            }),
          ],
        ],
        calls,
      ),
      scope,
    );

    const loaded = [];
    for await (const page of iterator) loaded.push(...page);

    expect(loaded.map((event) => event.sourceId)).toEqual([firstId, lastId]);
    expect(calls[1]).toMatchObject({
      p_after_event_date: "2026-07-15",
      p_after_source_id: filteredId,
      p_after_source_type: "receipt_allocation",
    });
  });

  it.each([
    [{ ...scope, pageSize: 1_001 }, "page size"],
    [{ ...scope, periodEnd: "2027-08-01" }, "between 1 and 366 days"],
    [{ ...scope, currency: "EUR" as "USD" }, "unsupported currency"],
  ])("rejects invalid bounded scope before RPC", async (input, message) => {
    const iterator = iteratePropertyCashEventPages(clientWithPages([]), input);
    await expect(iterator.next()).rejects.toThrow(message);
  });

  it("rejects duplicate source identities across page boundaries", async () => {
    const sourceId = "11111111-1111-4111-8111-111111111111";
    const iterator = iteratePropertyCashEventPages(
      clientWithPages([[row(sourceId)], [row(sourceId)]]),
      { ...scope, pageSize: 1 },
    );

    await iterator.next();
    await expect(iterator.next()).rejects.toThrow(/duplicate event key|cursor did not advance/);
  });

  it("rejects rows outside the requested property", async () => {
    await expect(
      loadPropertyCashEventPage(
        clientWithPages([
          [
            row("88888888-8888-4888-8888-888888888888", {
              property_id: "99999999-9999-4999-8999-999999999999",
            }),
          ],
        ]),
        { ...scope, pageSize: 1 },
      ),
    ).rejects.toThrow("outside the requested scope");
  });
});
