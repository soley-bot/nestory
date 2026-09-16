import { describe, expect, it, vi } from "vitest";
import { hydrateAccountEntrySources } from "./account-entry-sources";
import type { PropertyAccountEntry } from "../finance-operations.types";

const entry = (sourceType: string): PropertyAccountEntry => ({ id: "source", sourceType, propertyId: "property", amount: 50, date: "2026-09-01", createdAt: "2026-09-01", category: "withdrawal", label: "Transaction", note: null, runningBalance: 100 });
function harness(results: Record<string, { data: unknown[]; error?: unknown }[]>) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const client = { from: vi.fn((table: string) => {
    const call = { table, filters: [] as unknown[][] }; calls.push(call);
    const result = results[table]?.shift() ?? { data: table === "properties" ? [{ id: "property", branch_id: "branch-a" }] : [] };
    const query = { select: vi.fn(() => query), eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return query; }), in: vi.fn((...args: unknown[]) => { call.filters.push(args); return query; }), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return query;
  }) };
  return { client: client as never, calls };
}
describe("account source routing", () => {
  it("maps actual rent allocation identities and scopes all reads to the organization", async () => {
    const { client, calls } = harness({ tenant_invoice_payment_allocations: [{ data: [{ id: "source", invoice_id: "real-invoice", reversal_of_allocation_id: null }] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("tenant_invoice_payment")]);
    expect(result.source).toMatchObject({ kind: "rent", id: "real-invoice" });
    expect(calls.every((call) => call.filters.some((filter) => filter[0] === "organization_id" && filter[1] === "org"))).toBe(true);
  });
  it("maps expense responsibility through the approved item, never through matching dates or amounts", async () => {
    const { client } = harness({ ips_expense_responsibilities: [{ data: [{ id: "source", finance_expense_item_id: "item" }] }], expense_submissions: [{ data: [{ id: "submission", approved_finance_expense_item_id: "item", status: "approved", reference: "Receipt" }] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("ips_expense_responsibility")]);
    expect(result.source).toMatchObject({ kind: "expense", id: "submission", reference: "Receipt" });
  });
  it.each(["reversed", "closed", "unavailable"])("fails closed for %s cash", async (state) => {
    const { client } = harness({ property_withdrawals: [{ data: [{ id: "source", property_id: "property", owner_person_id: "owner", currency: "USD", withdrawal_date: "2026-09-01", reference: "Ref" }] }, { data: state === "reversed" ? [{ reversal_of_id: "source" }] : [], error: state === "unavailable" ? { message: "denied" } : undefined }], owner_balance_periods: [{ data: state === "closed" ? [{ property_id: "property", owner_person_id: "owner", currency: "USD", month_start: "2026-10-01" }] : [] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("property_withdrawal")]);
    expect(!result.source || Boolean(result.source.blockedReason)).toBe(true);
  });
  it("does not confuse another branch's closed month with the source property's month", async () => {
    const { client } = harness({ property_withdrawals: [{ data: [{ id: "source", property_id: "property", owner_person_id: "owner", currency: "USD", withdrawal_date: "2026-09-01", reference: null }] }, { data: [] }], financial_month_locks: [{ data: [{ month_start: "2026-09-01", branch_id: "branch-b" }] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("property_withdrawal")]);
    expect(result.source?.kind).toBe("distribution");
    expect(result.source?.blockedReason).toBeUndefined();
  });
  it("keeps contribution corrections actionable and their cleared references separate from the audit reason", async () => {
    const { client } = harness({ owner_cash_events: [{ data: [{ id: "source", property_id: "property", owner_person_id: "owner", currency: "USD", event_date: "2026-09-01", amount: 50, corrects_event_id: "old", reference: null, reason: "Internal correction reason" }] }, { data: [] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("owner_contribution")]);
    expect(result.source).toMatchObject({ kind: "contribution", id: "source", reference: null });
    expect(result.source?.blockedReason).toBeUndefined();
  });
  it.each([
    ["property_withdrawal", false], ["property_withdrawal", true],
    ["owner_contribution", false], ["owner_contribution", true],
  ] as const)("keeps %s actionable for finance-only staff when property read error is %s", async (type, denied) => {
    const table = type === "property_withdrawal" ? "property_withdrawals" : "owner_cash_events";
    const { client } = harness({
      properties: [{ data: [], error: denied ? { message: "denied" } : undefined }],
      [table]: [{ data: [{ id: "source", property_id: "property", owner_person_id: "owner", currency: "USD", withdrawal_date: "2026-09-01", event_date: "2026-09-01", amount: 50, reference: "Bank reference" }] }, { data: [] }],
      financial_month_locks: [{ data: [{ month_start: "2026-09-01", branch_id: "unavailable-branch" }] }],
    });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry(type)]);
    expect(result.source?.kind).toBe(type === "property_withdrawal" ? "distribution" : "contribution");
    expect(result.source?.blockedReason).toBeUndefined();
  });
  it("still blocks a global month lock when the property branch is unavailable", async () => {
    const { client } = harness({ properties: [{ data: [] }], property_withdrawals: [{ data: [{ id: "source", property_id: "property", owner_person_id: "owner", currency: "USD", withdrawal_date: "2026-09-01", reference: null }] }, { data: [] }], financial_month_locks: [{ data: [{ month_start: "2026-09-01", branch_id: null }] }] });
    const [result] = await hydrateAccountEntrySources(client, "org", [entry("property_withdrawal")]);
    expect(result.source?.blockedReason).toMatch(/closed period/);
  });
});
