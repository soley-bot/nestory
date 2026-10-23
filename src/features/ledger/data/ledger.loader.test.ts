import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, readBoundary } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), readBoundary: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialReadContext: readBoundary }));
import { DEFAULT_LEDGER_VIEW_QUERY } from "../ledger.filters";
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getLedgerScreenData } from "@/features/ledger/data/ledger";

const organizationId = "org";
const entryId = "entry";
type Row = Record<string, unknown>;

describe("ledger supporting read completeness", () => {
  it("rejects frozen context before querying ledger sources", async () => {
    readBoundary.mockRejectedValueOnce(new Error("Financial reporting is paused"));
    await expect(getLedgerScreenData(organizationId)).rejects.toThrow("paused");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("guards explicit date windows and discards an assembled stale ledger", async () => {
    createSupabaseServerClient.mockResolvedValue(fixture().client);
    readBoundary.mockImplementationOnce(async (_organizationId, read) => {
      await read({ generation: 2, financial_start_date: null });
      throw new Error("Financial data changed while loading");
    });
    await expect(getLedgerScreenData(organizationId, { ...DEFAULT_LEDGER_VIEW_QUERY, dateFrom: "2026-08-01" })).rejects.toThrow("changed while");
    expect(readBoundary).toHaveBeenCalledWith(organizationId, expect.any(Function), "2026-08-01");
  });
  it.each([null, entryId])("does not read pre-cutoff transactions through all-time or direct-entry scope (%s)", focused => {
    createSupabaseServerClient.mockResolvedValue(fixture().client);
    readBoundary.mockImplementation(async (_organizationId, read) => read({ generation: 2, financial_start_date: "2026-10-01" }));
    return expect(getLedgerScreenData(organizationId, { ...DEFAULT_LEDGER_VIEW_QUERY, entryId: focused })).resolves.toMatchObject({ entries: [], financialGeneration: 2 });
  });

  beforeEach(() => { createSupabaseServerClient.mockReset(); readBoundary.mockReset(); readBoundary.mockImplementation(async (_organizationId, read) => read({ generation: 2, financial_start_date: null })); });

  it("loads all related records and selectors beyond 1000 with equal dates and keeps old locks", async () => {
    const { client } = fixture();
    createSupabaseServerClient.mockResolvedValue(client);
    const result = await getLedgerScreenData(organizationId);
    expect(result.entries).toHaveLength(1);
    expect(result.propertyOptions).toHaveLength(1001);
    expect(result.unitOptions).toHaveLength(1001);
    expect(result.entries[0]).toMatchObject({
      propertyCode: "P1000", unitNumber: "U1000", isLocked: true,
      recordCounts: { activity: 1001, documents: 1001, timelineEvents: 1 },
      relatedTimelineEvent: { id: "event-0000" },
    });
    expect(result.periodLocks).toHaveLength(30);
    expect(result.entries[0].documents.some(document => document.id.startsWith("foreign"))).toBe(false);
  });

  it("fails closed on a later page and recovers on a fresh retry", async () => {
    const state = { fail: true };
    createSupabaseServerClient.mockResolvedValue(fixture(state).client);
    await expect(getLedgerScreenData(organizationId)).rejects.toThrow("Could not load ledger documents: temporary page failure");
    state.fail = false;
    expect((await getLedgerScreenData(organizationId)).entries[0].documents).toHaveLength(1001);
  });
});

function fixture(state = { fail: false }) {
  const sequence = (prefix: string, extras: (index: number) => Row) => Array.from({ length: 1001 }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(4, "0")}`, organization_id: organizationId, archived_at: null, ...extras(index),
  }));
  const documents = sequence("document", () => ({ ledger_entry_id: entryId, category: "receipt", file_name: "Receipt", mime_type: "application/pdf", size_bytes: 1, storage_path: "receipt", uploaded_at: "2026-10-01" }));
  const tables: Record<string, Row[]> = {
    properties: sequence("property", index => ({ name: "Equal name", code: `P${index}` })),
    units: sequence("unit", index => ({ property_id: "property-1000", unit_number: `U${index}` })),
    financial_month_locks: Array.from({ length: 30 }, (_, index) => ({ id: `lock-${index}`, organization_id: organizationId, month_start: `${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`, is_locked: true, locked_at: "2026-10-01", reason: null })),
    ledger_entries: [{ id: entryId, organization_id: organizationId, archived_at: null, property_id: "property-1000", unit_id: "unit-1000", transaction_date: "2020-01-15", amount: 100, currency: "USD", category: "rent", description: "Rent", direction: "income", source_id: "allocation", source_type: "receipt_allocation", reversal_of_ledger_entry_id: null }],
    documents: [...documents, { ...documents[0], id: "foreign-org", organization_id: "other" }, { ...documents[0], id: "foreign-entry", ledger_entry_id: "other" }],
    timeline_events: sequence("event", () => ({ ledger_entry_id: entryId, title: "Receipt", created_at: "2026-10-01" })),
    activity_logs: sequence("activity", () => ({ entity_id: entryId, entity_type: "ledger_entry", action: "updated", previous_values: null, new_values: null, created_at: "2026-10-01" })),
  };
  return { client: { from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<[string, boolean]> = [];
    let from = 0, to = 999, limit = 1000;
    const builder = {
      select: () => builder,
      gte: (field: string, value: string) => { filters.push(row => String(row[field]) >= value); return builder; },
      eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return builder; },
      is: (field: string, value: unknown) => { filters.push(row => row[field] === value); return builder; },
      in: (field: string, values: unknown[]) => { filters.push(row => values.includes(row[field])); return builder; },
      order: (field: string, options?: { ascending?: boolean }) => { orders.push([field, options?.ascending !== false]); return builder; },
      limit: (value: number) => { limit = value; return builder; },
      range: (start: number, end: number) => { from = start; to = end; return builder; },
      then: (resolve: (result: unknown) => unknown) => {
        if (state.fail && table === "documents" && from === 500) return Promise.resolve({ data: null, error: { message: "temporary page failure" }, count: null }).then(resolve);
        const rows = (tables[table] ?? []).filter(row => filters.every(matches => matches(row))).sort((a, b) => {
          for (const [field, ascending] of orders) {
            const order = String(a[field]).localeCompare(String(b[field]));
            if (order) return ascending ? order : -order;
          }
          return 0;
        });
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + limit)), error: null, count: rows.length }).then(resolve);
      },
    };
    return builder;
  } } };
}
