import { describe, expect, it } from "vitest";

import {
  iterateOwnerProfitLossEvents,
  normalizeOwnerProfitLossEvent,
} from "@/features/reports/data/owner-profit-loss-events";
import type {
  OwnerProfitLossEventDatabaseRow,
  OwnerProfitLossEventsRpcClient,
} from "@/features/reports/data/owner-profit-loss-events.types";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";

function row(
  sourceId: string,
  overrides: Partial<OwnerProfitLossEventDatabaseRow> = {},
): OwnerProfitLossEventDatabaseRow {
  return {
    category_code: "rent",
    contract_version: "owner_profit_loss_events.v1",
    currency: "USD",
    cursor_recognized_on: "2026-07-15",
    cursor_source_id: sourceId,
    cursor_source_type: "tenant_invoice_line",
    description: "July rent",
    economic_class: "owner_income",
    event_key: `tenant_invoice_line:${sourceId}`,
    is_reversal: false,
    lease_id: null,
    organization_id: organizationId,
    period_start: "2026-07-01",
    property_id: propertyId,
    recognition_basis: "tenant_invoice_issued",
    recognized_on: "2026-07-15",
    reversal_of_id: null,
    reversal_source_type: null,
    signed_amount: "10.00",
    source_id: sourceId,
    source_parent_id: null,
    source_parent_type: null,
    source_type: "tenant_invoice_line",
    unit_id: unitId,
    ...overrides,
  };
}

function clientWithPages(
  pages: OwnerProfitLossEventDatabaseRow[][],
  calls: Array<Record<string, unknown>> = [],
): OwnerProfitLossEventsRpcClient {
  let index = 0;
  return {
    async rpc(name, args) {
      expect(name).toBe("get_owner_profit_loss_events_page");
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
};

describe("owner profit and loss recognized-event adapter", () => {
  it("preserves exact signed money and reversal lineage", () => {
    const sourceId = "44444444-4444-4444-8444-444444444444";
    const originalId = "33333333-3333-4333-8333-333333333333";
    const event = normalizeOwnerProfitLossEvent(
      row(sourceId, {
        economic_class: "owner_expense",
        event_key: `management_fee_occurrence:${sourceId}`,
        is_reversal: true,
        recognition_basis: "management_fee_earned_at_invoice_issuance",
        reversal_of_id: originalId,
        reversal_source_type: "management_fee_occurrence",
        signed_amount: "-4.25",
        source_type: "management_fee_occurrence",
        cursor_source_type: "management_fee_occurrence",
      }),
    );

    expect(event.signedAmountCents).toBe(BigInt(-425));
    expect(event.reversalOfId).toBe(originalId);
    expect(event.isReversal).toBe(true);
  });

  it("uses the last unfiltered row as the next cursor", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const propertyLevelId = "22222222-2222-4222-8222-222222222222";
    const lastId = "33333333-3333-4333-8333-333333333333";
    const calls: Array<Record<string, unknown>> = [];
    const loaded = [];

    for await (const event of iterateOwnerProfitLossEvents(
      clientWithPages(
        [
          [row(firstId), row(propertyLevelId, { unit_id: null })],
          [row(lastId, {
            cursor_recognized_on: "2026-07-16",
            recognized_on: "2026-07-16",
          })],
        ],
        calls,
      ),
      { ...scope, unitId },
    )) {
      loaded.push(event);
    }

    expect(loaded.map((event) => event.sourceId)).toEqual([
      firstId,
      propertyLevelId,
      lastId,
    ]);
    expect(calls[1]).toMatchObject({
      p_after_recognized_on: "2026-07-15",
      p_after_source_id: propertyLevelId,
      p_after_source_type: "tenant_invoice_line",
    });
  });

  it.each([
    [{ ...scope, pageSize: 1_001 }, "page size"],
    [{ ...scope, periodEnd: "2027-08-01" }, "between 1 and 366 days"],
    [{ ...scope, currency: "EUR" as "USD" }, "unsupported currency"],
  ])("rejects invalid bounded scope", async (input, message) => {
    const iterator = iterateOwnerProfitLossEvents(clientWithPages([]), input);
    await expect(iterator.next()).rejects.toThrow(message);
  });

  it("rejects a row outside the requested property", async () => {
    const iterator = iterateOwnerProfitLossEvents(
      clientWithPages([[row("88888888-8888-4888-8888-888888888888", {
        property_id: "99999999-9999-4999-8999-999999999999",
      })]]),
      scope,
    );

    await expect(iterator.next()).rejects.toThrow("outside the requested scope");
  });
});
