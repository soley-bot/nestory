import { describe, expect, it } from "vitest";
import {
  iteratePropertyCashEventPages,
  loadPropertyCashEventPage,
  normalizePropertyCashEvent,
} from "@/features/finance/data/property-cash-events";
import type {
  PropertyCashEventDatabaseRow,
  PropertyCashEventScope,
  PropertyCashEventsRpcClient,
} from "@/features/finance/data/property-cash-events.types";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";

function row(
  sourceId: string,
  overrides: Partial<PropertyCashEventDatabaseRow> = {},
): PropertyCashEventDatabaseRow {
  return {
    amount: "10.00",
    archived_at: null,
    category_code: "rent",
    classification_status: "source_stable",
    contract_version: "property_cash_events_v1",
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    currency: "USD",
    deposit_liability_effect: "0.00",
    economic_class: "operating_income",
    event_date: "2026-07-15",
    event_key: `receipt_allocation:${sourceId}`,
    is_legacy: false,
    is_reversal: false,
    journal_entry_id: null,
    lease_id: null,
    ledger_entry_id: null,
    management_fee_effect: "0.00",
    obligation_id: null,
    obligation_type: null,
    operating_cash_effect: "10.00",
    organization_id: organizationId,
    owner_cash_effect: "10.00",
    owner_person_id: null,
    period_start: "2026-07-01",
    projection_status: null,
    property_id: propertyId,
    reconciliation_source_id: null,
    reconciliation_state: "not_required",
    requires_resolution: false,
    resolution_codes: [],
    reversal_source_id: null,
    reversal_source_type: null,
    source_id: sourceId,
    source_parent_id: null,
    source_parent_type: null,
    source_type: "receipt_allocation",
    statement_section: "income",
    task_id: null,
    tenant_person_id: null,
    unit_id: unitId,
    updated_at: null,
    updated_by: null,
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
      expect(name).toBe("get_property_cash_events_v1_page");
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
  it("preserves null effects while converting exact decimals to bigint cents", () => {
    const normalized = normalizePropertyCashEvent(
      row("44444444-4444-4444-8444-444444444444", {
        deposit_liability_effect: null,
        management_fee_effect: null,
        operating_cash_effect: null,
        owner_cash_effect: null,
      }),
    );

    expect(normalized.amountCents).toBe(BigInt(1_000));
    expect(normalized.ownerCashEffectCents).toBeNull();
    expect(normalized.operatingCashEffectCents).toBeNull();
    expect(normalized.depositLiabilityEffectCents).toBeNull();
    expect(normalized.managementFeeEffectCents).toBeNull();
  });

  it("accepts an exact linked reconciliation source without a missing code", () => {
    const reconciliationSourceId =
      "55555555-5555-4555-8555-555555555555";
    const normalized = normalizePropertyCashEvent(
      row("44444444-4444-4444-8444-444444444444", {
        reconciliation_source_id: reconciliationSourceId,
        reconciliation_state: "linked_exact_identity",
      }),
    );

    expect(normalized.reconciliationSourceId).toBe(reconciliationSourceId);
    expect(normalized.reconciliationState).toBe("linked_exact_identity");
  });

  it("rejects a linked reconciliation state without an exact source ID", () => {
    expect(() =>
      normalizePropertyCashEvent(
        row("44444444-4444-4444-8444-444444444444", {
          reconciliation_state: "linked_exact_identity",
        }),
      ),
    ).toThrow("without a source identity");
  });

  it("rejects a linked source that remains marked missing", () => {
    expect(() =>
      normalizePropertyCashEvent(
        row("44444444-4444-4444-8444-444444444444", {
          reconciliation_source_id:
            "55555555-5555-4555-8555-555555555555",
          reconciliation_state: "linked_exact_identity",
          requires_resolution: true,
          resolution_codes: ["missing_reconciliation_source"],
        }),
      ),
    ).toThrow("cannot remain marked missing");
  });

  it("traverses keyset pages and applies the direct unit filter per page", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const filteredId = "22222222-2222-4222-8222-222222222222";
    const lastId = "33333333-3333-4333-8333-333333333333";
    const calls: Array<Record<string, unknown>> = [];
    const pages = iteratePropertyCashEventPages(
      clientWithPages(
        [
          [
            row(firstId),
            row(filteredId, {
              unit_id: "99999999-9999-4999-8999-999999999999",
            }),
          ],
          [row(lastId, { event_date: null, period_start: null })],
        ],
        calls,
      ),
      scope,
    );

    const loaded = [];
    for await (const page of pages) loaded.push(...page);

    expect(loaded.map((event) => event.sourceId)).toEqual([firstId, lastId]);
    expect(calls).toEqual([
      {
        p_after_event_date: null,
        p_after_source_id: null,
        p_after_source_type: null,
        p_currency: "USD",
        p_organization_id: organizationId,
        p_page_size: 2,
        p_period_end: "2026-07-31",
        p_period_start: "2026-07-01",
        p_property_id: propertyId,
      },
      {
        p_after_event_date: "2026-07-15",
        p_after_source_id: filteredId,
        p_after_source_type: "receipt_allocation",
        p_currency: "USD",
        p_organization_id: organizationId,
        p_page_size: 2,
        p_period_end: "2026-07-31",
        p_period_start: "2026-07-01",
        p_property_id: propertyId,
      },
    ]);
  });

  it("does not filter ordinary property activity by direct owner metadata", async () => {
    const ordinaryRentId = "77777777-7777-4777-8777-777777777777";
    const legacyOwnerScopedInput = {
      ...scope,
      ownerPersonId: ownerId,
      pageSize: 1,
    } as unknown as PropertyCashEventScope;
    const iterator = iteratePropertyCashEventPages(
      clientWithPages([
        [
          row(ordinaryRentId, {
            owner_person_id: null,
            unit_id: unitId,
          }),
        ],
        [],
      ]),
      legacyOwnerScopedInput,
    );

    const loaded = [];
    for await (const page of iterator) loaded.push(...page);

    expect(loaded.map((event) => event.sourceId)).toEqual([ordinaryRentId]);
  });

  it("validates every row returned by the public page loader", async () => {
    await expect(
      loadPropertyCashEventPage(
        clientWithPages([
          [
            row("88888888-8888-4888-8888-888888888888", {
              classification_status: "not-a-contract-status",
            }),
          ],
        ]),
        { ...scope, pageSize: 1 },
      ),
    ).rejects.toThrow("classification status");
  });

  it.each(["receipt_header_residual", "payment_header_residual"] as const)(
    "accepts the checked %s source family",
    (sourceType) => {
      const sourceId = "99999999-9999-4999-8999-999999999999";
      expect(
        normalizePropertyCashEvent(
          row(sourceId, {
            category_code:
              sourceType === "receipt_header_residual"
                ? "unapplied_receipt"
                : "unallocated_payment",
            classification_status: "unresolved_evidence",
            economic_class: "legacy_unclassified",
            event_key: `${sourceType}:${sourceId}`,
            owner_cash_effect: null,
            operating_cash_effect: null,
            deposit_liability_effect: null,
            management_fee_effect: null,
            requires_resolution: true,
            reconciliation_state: "missing_stable_identity",
            resolution_codes: [
              sourceType === "receipt_header_residual"
                ? "receipt_header_unapplied"
                : "payment_header_unallocated",
            ],
            source_type: sourceType,
            statement_section: "unresolved",
          }),
        ).sourceType,
      ).toBe(sourceType);
    },
  );

  it.each([
    [{ ...scope, pageSize: 1_001 }, "page size"],
    [{ ...scope, periodEnd: "2027-08-01" }, "between 1 and 366 days"],
    [{ ...scope, currency: "EUR" as "USD" }, "unsupported currency"],
  ])("rejects an invalid bounded scope before RPC", async (input, message) => {
    const client = clientWithPages([]);
    const iterator = iteratePropertyCashEventPages(client, input);
    await expect(iterator.next()).rejects.toThrow(message);
  });

  it("rejects an adjacent duplicate event key across page boundaries", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const duplicate = row(firstId);
    const iterator = iteratePropertyCashEventPages(
      clientWithPages([[duplicate], [duplicate]]),
      { ...scope, pageSize: 1 },
    );

    await iterator.next();
    await expect(iterator.next()).rejects.toThrow("duplicate event key");
  });

  it.each([
    {
      label: "within one page",
      pageSize: 3,
      pages: [
        [
          row("11111111-1111-4111-8111-111111111111", {
            event_date: "2026-07-10",
          }),
          row("22222222-2222-4222-8222-222222222222", {
            event_date: "2026-07-11",
          }),
          row("11111111-1111-4111-8111-111111111111", {
            event_date: "2026-07-12",
          }),
        ],
      ],
    },
    {
      label: "across page boundaries",
      pageSize: 2,
      pages: [
        [
          row("11111111-1111-4111-8111-111111111111", {
            event_date: "2026-07-10",
          }),
          row("22222222-2222-4222-8222-222222222222", {
            event_date: "2026-07-11",
          }),
        ],
        [
          row("11111111-1111-4111-8111-111111111111", {
            event_date: "2026-07-12",
          }),
        ],
      ],
    },
  ])(
    "rejects a non-adjacent duplicate event key $label",
    async ({ pageSize, pages }) => {
      const iterator = iteratePropertyCashEventPages(
        clientWithPages(pages),
        { ...scope, pageSize },
      );

      await expect(async () => {
        for await (const page of iterator) void page;
      }).rejects.toThrow("duplicate event key");
    },
  );

  it("rejects an event key that is not the deterministic source encoding", async () => {
    const iterator = iteratePropertyCashEventPages(
      clientWithPages([
        [
          row("11111111-1111-4111-8111-111111111111", {
            event_key: "wrong:key",
          }),
        ],
      ]),
      { ...scope, pageSize: 1 },
    );

    await expect(iterator.next()).rejects.toThrow(
      "does not match its source identity",
    );
  });

  it("fails closed after tracking 10,000 unique event keys", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => {
      const sourceId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return row(sourceId, {
        event_date: "2026-07-15",
        event_key: `receipt_allocation:${sourceId}`,
      });
    });
    const pages = Array.from({ length: 11 }, (_, index) =>
      rows.slice(index * 1_000, (index + 1) * 1_000),
    );
    let yielded = 0;

    await expect(async () => {
      for await (const page of iteratePropertyCashEventPages(
        clientWithPages(pages),
        { ...scope, pageSize: 1_000 },
      )) {
        yielded += page.length;
      }
    }).rejects.toThrow("event key tracking limit");
    expect(yielded).toBe(10_000);
  });

  it("rejects a cursor that does not advance strictly", async () => {
    const firstId = "22222222-2222-4222-8222-222222222222";
    const earlierId = "11111111-1111-4111-8111-111111111111";
    const iterator = iteratePropertyCashEventPages(
      clientWithPages([[row(firstId)], [row(earlierId)]]),
      { ...scope, pageSize: 1 },
    );

    await iterator.next();
    await expect(iterator.next()).rejects.toThrow("cursor did not advance");
  });
});
