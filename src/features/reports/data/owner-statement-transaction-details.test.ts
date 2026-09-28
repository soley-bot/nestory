import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { loadStatementTransactionDetails } from "./owner-statement-transaction-details";
import { mapOwnerStatementPublicationPayload } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";

const identity = { ownerName: "Owner", organizationName: "Company" };
function fixture(type: string) {
  const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
  model.lines = [{ ...model.lines[0]!, lineKind: "movement", sources: [{ ...model.lines[0]!.sources[0]!, sourceType: type, sourceLineId: "source" }] }];
  return model;
}
type Records = Record<string, Record<string, unknown>[]>;
function client(model: ReturnType<typeof fixture>, records: Records) {
  return { from(table: string) {
    const filters: Record<string, string> = {};
    const query = {
      select() { return query; },
      eq(key: string, value: string) { filters[key] = value; return query; },
      async maybeSingle() {
        const rows = (records[table] ?? []).map(row => ({ organization_id: model.organizationId, property_id: model.propertyId, ...row }))
          .filter(row => Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value));
        return { data: rows[0] ?? null, error: rows.length > 1 ? "Ambiguous" : null };
      },
    };
    return query;
  } } as unknown as SupabaseClient<Database>;
}
const rent: Records = {
  tenant_invoice_payment_allocations: [{ id: "source", invoice_line_id: "line" }],
  tenant_invoice_lines: [{ id: "line", unit_id: "unit", invoice_id: "invoice", customer_label: "Rent" }],
  tenant_invoices: [{ id: "invoice", unit_id: "unit", recipient_label: "Tenant" }],
  units: [{ id: "unit", unit_number: "The PEAK #2807" }],
};
describe("statement source unit attribution", () => {
  it("follows rent allocation to its unit and tenant without changing frozen money", async () => {
    const model = fixture("tenant_rent_receipt");
    const before = structuredClone(model);
    expect(await loadStatementTransactionDetails(client(model, rent), model, identity)).toEqual({ 1: { unit: "The PEAK #2807", name: "Tenant", category: "Rent" } });
    expect(model).toEqual(before);
  });
  it("follows owner charge allocations through expense responsibility", async () => {
    const model = fixture("owner_invoice_payment");
    const records = { units: rent.units!, owner_charge_cash_allocations: [{ id: "source", owner_invoice_line_id: "charge" }], owner_invoice_lines: [{ id: "charge", source_type: "owner_expense", reversal_of_id: null }], ips_expense_responsibilities: [{ id: "responsibility", owner_invoice_line_id: "charge", finance_expense_item_id: "expense" }], finance_expense_items: [{ id: "expense", unit_id: "unit", vendor_label: "Vendor", category: "Repairs" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity))[1]).toEqual({ unit: "The PEAK #2807", name: "Vendor", category: "Repairs" });
  });
  it("resolves management fees from their lease when there is no invoice", async () => {
    const model = fixture("management_fee_occurrence");
    const records = { units: rent.units!, management_fee_occurrences: [{ id: "source", tenant_invoice_id: null, lease_id: "lease" }], leases: [{ id: "lease", unit_id: "unit" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity))[1]?.unit).toBe("The PEAK #2807");
  });
  it.each(["owner_contribution", "owner_reimbursement"])("preserves explicit unit attribution for %s", async type => {
    const model = fixture(type);
    expect((await loadStatementTransactionDetails(client(model, { units: rent.units!, owner_cash_events: [{ id: "source", unit_id: "unit" }] }), model, identity))[1]?.unit).toBe("The PEAK #2807");
  });
  it("labels a genuinely property-level distribution without inventing a unit", async () => {
    const model = fixture("owner_distribution");
    expect((await loadStatementTransactionDetails(client(model, { property_withdrawals: [{ id: "source" }] }), model, identity))[1]?.unit).toBe("Property-level");
  });
  it("follows a fingerprint-matched reversal back to the original receipt", async () => {
    const model = fixture("reversal");
    const records = { ...rent, owner_event_allocation_sets: [{ id: "reverse", source_line_id: "source", source_type: "reversal", source_fingerprint: model.lines[0]!.sources[0]!.sourceFingerprint, reversal_of_allocation_set_id: "original" }, { id: "original", source_line_id: "source", source_type: "tenant_rent_receipt", source_fingerprint: "original-fingerprint" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity))[1]?.unit).toBe("The PEAK #2807");
  });
  it.each(["missing", "other-property", "other-organization"])("rejects %s unit records instead of substituting a placeholder", async problem => {
    const model = fixture("tenant_rent_receipt");
    const units = problem === "missing" ? [] : [{ ...rent.units![0], ...(problem === "other-property" ? { property_id: "other" } : { organization_id: "other" }) }];
    await expect(loadStatementTransactionDetails(client(model, { ...rent, units }), model, identity)).rejects.toThrow();
  });
});
