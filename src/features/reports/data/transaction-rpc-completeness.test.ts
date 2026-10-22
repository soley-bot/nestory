import { describe, expect, it, vi } from "vitest";
import { getTransactionReport } from "./transaction-report";
import type { OwnerProfitLossEventDatabaseRow } from "./owner-profit-loss-events.types";
import type { ReportsViewQuery } from "../reports.types";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const property = "11111111-1111-4111-8111-111111111111";
const unit = "22222222-2222-4222-8222-222222222222";
const query: ReportsViewQuery = { report: "transactions", transactionType: "rent-charge", month: "2026-09",
  propertyId: property, unitId: "all", ownerPersonId: "all", status: "all", peopleArchiveState: "active", peopleView: "relationship" };

function event(index: number, rent: boolean): OwnerProfitLossEventDatabaseRow {
  const sourceId = `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`;
  const sourceType = rent ? "tenant_invoice_line" : "owner_invoice_line";
  return {
    category_code: rent ? "rent" : "repairs", category_id: null, category_label: rent ? "Rent" : "Repairs",
    category_reporting_group: rent ? "rent" : "maintenance", contract_version: "owner_profit_loss_events.v2",
    currency: "USD", cursor_recognized_on: "2026-09-15", cursor_source_id: sourceId, cursor_source_type: sourceType,
    description: "Synthetic source", economic_class: rent ? "owner_income" : "owner_expense",
    event_key: `${sourceType}:${sourceId}`, is_reversal: false, lease_id: null, organization_id: org,
    period_start: "2026-09-01", property_id: property, recognition_basis: "tenant_invoice_issued",
    recognized_on: "2026-09-15", reversal_of_id: null, reversal_source_type: null, signed_amount: "1.25",
    source_id: sourceId, source_parent_id: null, source_parent_type: null, source_type: sourceType, unit_id: unit,
  };
}

function harness(change?: (rows: OwnerProfitLossEventDatabaseRow[], count: number, call: number) => {
  data: OwnerProfitLossEventDatabaseRow[] | null; count: number | null; error: { message: string } | null;
}) {
  const rows = [...Array.from({ length: 600 }, (_, index) => event(index, false)), event(600, true), event(601, true), event(602, true)];
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const start = args.p_after_source_id ? rows.findIndex(row => row.source_id === args.p_after_source_id) + 1 : 0;
    const logicalPage = rows.slice(start, start + Number(args.p_page_size));
    const data = logicalPage.slice(0, 137);
    return change?.(data, logicalPage.length, rpc.mock.calls.length) ?? { data, count: logicalPage.length, error: null };
  });
  return { rpc, load: () => getTransactionReport({ organizationId: org, viewQuery: query,
    financeContext: { properties: [{ id: property, code: "P", name: "Property", archived_at: null }],
      units: [{ id: unit, property_id: property, unit_number: "1", archived_at: null }],
      leases: [], terms: [], billing_terms: [], owner_assignments: [], people: [] },
    supabase: { rpc } as never }) };
}

describe("transaction RPC capped transport", () => {
  it("reaches the rent charges after capped pages containing only unrelated events", async () => {
    const h = harness();
    const report = await h.load();
    expect(report.rows).toHaveLength(3);
    expect(report.summary[0].value).toBe("$3.75");
    expect(h.rpc).toHaveBeenCalledTimes(6);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_after_source_id: event(136, false).source_id,
      p_organization_id: org, p_property_id: property });
  });

  it.each(["count", "empty", "error", "order", "tenant"])("rejects a later %s failure", async failure => {
    const h = harness((data, count, call) => {
      if (call !== 2) return { data, count, error: null };
      if (failure === "count") return { data, count: null, error: null };
      if (failure === "empty") return { data: [], count, error: null };
      if (failure === "error") return { data: null, count: null, error: { message: "denied" } };
      if (failure === "order") return { data: [...data].reverse(), count, error: null };
      return { data: data.map(row => ({ ...row, organization_id: "foreign" })), count, error: null };
    });
    await expect(h.load()).rejects.toThrow();
  });
});
