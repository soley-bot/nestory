import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { loadStatementTransactionDetails } from "./owner-statement-transaction-details";
import { mapOwnerStatementPublicationPayload } from "./owner-statement-report";
import { ownerStatementPublicationPayload } from "./owner-statement-report.test-fixture";
import type { OwnerProfitLossEventDatabaseRow } from "./owner-profit-loss-events.types";
import { canonicalizeSignedOwnerOpeningAmount as money } from "@/features/owner-balances/owner-balance.money";
import { buildOwnerStatementPdf } from "./pdf";
import { buildOwnerStatementXlsx } from "./excel";
import { unzipSync, strFromU8 } from "fflate";
import { isContainedPdf } from "@/lib/uploads/pdf-containment";

const identity = { ownerName: "Owner", organizationName: "Company" };
function fixture(type: string) {
  const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
  model.lines = [{ ...model.lines[0]!, lineKind: "movement", sources: [{ ...model.lines[0]!.sources[0]!, sourceType: type, sourceLineId: "source" }] }];
  return model;
}
type Records = Record<string, Record<string, unknown>[]>;
function client(model: ReturnType<typeof fixture>, records: Records, rpc = vi.fn()) {
  return { rpc, from(table: string) {
    if (["properties", "units", "management_fee_occurrences"].includes(table)) throw new Error("Raw records are denied to Finance");
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
function finance(model: ReturnType<typeof fixture>, records: Records) {
  const authorized = (table: string) => (records[table] ?? []).filter(row => !row.organization_id || row.organization_id === model.organizationId);
  return {
    properties: [{ id: model.propertyId }],
    units: authorized("units").map(row => ({ id: String(row.id), property_id: String(row.property_id ?? model.propertyId), unit_number: String(row.unit_number) })),
  };
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
    expect(await loadStatementTransactionDetails(client(model, rent), model, identity, finance(model, rent))).toEqual({ 1: { unit: "The PEAK #2807", name: "Tenant", category: "Rent" } });
    expect(model).toEqual(before);
  });
  it("follows owner charge allocations through expense responsibility", async () => {
    const model = fixture("owner_invoice_payment");
    const records = { units: rent.units!, owner_charge_cash_allocations: [{ id: "source", owner_invoice_line_id: "charge" }], owner_invoice_lines: [{ id: "charge", source_type: "owner_expense", reversal_of_id: null }], ips_expense_responsibilities: [{ id: "responsibility", owner_invoice_line_id: "charge", finance_expense_item_id: "expense" }], finance_expense_items: [{ id: "expense", unit_id: "unit", vendor_label: "Vendor", category: "Repairs" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity, finance(model, records)))[1]).toEqual({ unit: "The PEAK #2807", name: "Vendor", category: "Repairs" });
  });
  it.each(["owner_contribution", "owner_reimbursement"])("preserves explicit unit attribution for %s", async type => {
    const model = fixture(type);
    const records = { units: rent.units!, owner_cash_events: [{ id: "source", unit_id: "unit" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity, finance(model, records)))[1]?.unit).toBe("The PEAK #2807");
  });
  it("labels a genuinely property-level distribution without inventing a unit", async () => {
    const model = fixture("owner_distribution");
    const records = { property_withdrawals: [{ id: "source" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity, finance(model, records)))[1]?.unit).toBe("Property-level");
  });
  it("follows a fingerprint-matched reversal back to the original receipt", async () => {
    const model = fixture("reversal");
    const records = { ...rent, owner_event_allocation_sets: [{ id: "reverse", source_line_id: "source", source_type: "reversal", source_fingerprint: model.lines[0]!.sources[0]!.sourceFingerprint, reversal_of_allocation_set_id: "original" }, { id: "original", source_line_id: "source", source_type: "tenant_rent_receipt", source_fingerprint: "original-fingerprint" }] };
    expect((await loadStatementTransactionDetails(client(model, records), model, identity, finance(model, records)))[1]?.unit).toBe("The PEAK #2807");
  });
  it.each(["missing", "other-property", "other-organization"])("rejects %s unit records instead of substituting a placeholder", async problem => {
    const model = fixture("tenant_rent_receipt");
    const units = problem === "missing" ? [] : [{ ...rent.units![0], ...(problem === "other-property" ? { property_id: "other" } : { organization_id: "other" }) }];
    const records = { ...rent, units };
    await expect(loadStatementTransactionDetails(client(model, records), model, identity, finance(model, records))).rejects.toThrow();
  });
  it("rejects a statement property absent from the authorized context before reading sources", async () => {
    const model = fixture("tenant_rent_receipt");
    const denied = { from() { throw new Error("Must not read sources"); } } as unknown as SupabaseClient<Database>;
    await expect(loadStatementTransactionDetails(denied, model, identity, { ...finance(model, rent), properties: [] })).rejects.toThrow("Statement property is unavailable");
  });
});

const feeDate = "2026-01-15";
function feeRow(model: ReturnType<typeof fixture>, id = "source", overrides: Partial<OwnerProfitLossEventDatabaseRow> = {}): OwnerProfitLossEventDatabaseRow {
  return {
    category_code: "management_fee", category_id: null, category_label: "Management fee", category_reporting_group: "management_fee",
    contract_version: "owner_profit_loss_events.v2", currency: "USD", description: "Management fee", economic_class: "owner_expense",
    cursor_recognized_on: feeDate, cursor_source_id: id, cursor_source_type: "management_fee_occurrence",
    event_key: `management_fee_occurrence:${id}`, is_reversal: false, lease_id: "historic-lease",
    organization_id: model.organizationId, property_id: model.propertyId, period_start: "2026-01-01",
    recognized_on: feeDate, recognition_basis: "management_fee_earned_at_invoice_issuance", reversal_of_id: null,
    reversal_source_type: null, signed_amount: "50.00", source_id: id, source_parent_id: "invoice",
    source_parent_type: "tenant_invoice", source_type: "management_fee_occurrence", unit_id: "unit", ...overrides,
  };
}
function feeRecords(): Records {
  return {
    units: rent.units!,
    owner_charge_cash_allocations: [{ id: "source", owner_invoice_line_id: "charge" }],
    owner_invoice_lines: [{ id: "charge", source_type: "management_fee", source_id: "source", recognized_on: feeDate, reversal_of_id: null }],
  };
}

describe("Finance Manager statement fee attribution through the existing property projection", () => {
  it.each(["owner_invoice_payment", "management_fee_occurrence"])("resolves %s without direct fee access or current lease membership, preserving frozen figures", async type => {
    const model = fixture(type);
    const before = structuredClone(model);
    const records = feeRecords();
    const rpc = vi.fn().mockResolvedValue({ data: [feeRow(model)], error: null });
    expect(await loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records)))
      .toEqual({ 1: { unit: "The PEAK #2807", name: "Company", category: "Management Fees" } });
    expect(model).toEqual(before);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_owner_profit_loss_events_page", {
      p_organization_id: model.organizationId, p_property_id: model.propertyId, p_currency: "USD",
      p_period_start: "2026-01-01", p_period_end: "2026-01-31", p_page_size: 500,
      p_after_recognized_on: null, p_after_source_id: null, p_after_source_type: null,
    });
    expect(model.lines[0]!.businessDate).not.toBe(feeDate);
  });
  it("reaches a later page and shares the recognition-month read across repeated sources", async () => {
    const model = fixture("owner_invoice_payment");
    model.lines.push({ ...model.lines[0]!, lineNumber: 2 });
    const records = feeRecords();
    const firstPage = Array.from({ length: 500 }, (_, index) => feeRow(model, String(index).padStart(4, "0")));
    const rpc = vi.fn().mockResolvedValueOnce({ data: firstPage, error: null }).mockResolvedValueOnce({ data: [feeRow(model)], error: null });
    const result = await loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records));
    expect(result[1]).toEqual(result[2]);
    expect(result[1]?.unit).toBe("The PEAK #2807");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_after_recognized_on: feeDate, p_after_source_type: "management_fee_occurrence", p_after_source_id: "0499" });
  });
  it("handles migrated monthly invoice dates and preserves reconciled PDF/Excel cash figures", async () => {
    const model = fixture("owner_invoice_payment");
    model.lines[0]!.signedAmount = money("-40.00");
    model.components[0]!.movementAmount = money("-40.00");
    model.components[0]!.closingAmount = money("1210.00");
    const before = structuredClone(model);
    const records = feeRecords();
    records.owner_invoice_lines[0]!.recognized_on = "2026-01-01";
    // The original fee was 50; this frozen settlement is only 40. Never copy
    // recognized fee money into the cash statement while enriching its labels.
    const rpc = vi.fn().mockResolvedValue({ data: [feeRow(model)], error: null });
    const transactionDetails = await loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records));
    const presentation = { ...identity, propertyLabel: "Property", transactionDetails };
    const pdfBytes = buildOwnerStatementPdf(model, presentation);
    const pdf = Buffer.from(pdfBytes).toString("latin1");
    const xlsx = buildOwnerStatementXlsx(model, presentation);
    const sheet = strFromU8(unzipSync(xlsx)["xl/worksheets/sheet1.xml"]);
    expect(isContainedPdf(pdfBytes)).toBe(true);
    for (const label of ["The PEAK #2807", "Management Fees", "Company"]) {
      expect(pdf).toContain(label);
      expect(sheet).toContain(label);
    }
    for (const [amount, displayed] of [["1250.00", "$1,250.00"], ["40.00", "$40.00"], ["1210.00", "$1,210.00"]]) {
      expect(pdf).toContain(displayed);
      expect(sheet).toContain(`<v>${amount}</v>`);
    }
    expect(sheet).not.toContain("<v>50.00</v>");
    expect(buildOwnerStatementPdf(model, presentation)).toEqual(pdfBytes);
    expect(buildOwnerStatementXlsx(model, presentation)).toEqual(xlsx);
    expect(model).toEqual(before);
  });
  it("passes more than 10,000 unrelated recognized events before the exact fee", async () => {
    const model = fixture("owner_invoice_payment");
    const records = feeRecords();
    const unrelated = Array.from({ length: 10001 }, (_, index) => {
      const id = String(index).padStart(5, "0");
      return feeRow(model, id, { recognized_on: "2026-01-01", cursor_recognized_on: "2026-01-01", source_type: "owner_invoice_line", cursor_source_type: "owner_invoice_line", event_key: `owner_invoice_line:${id}` });
    });
    const rows = [...unrelated, feeRow(model)];
    let offset = 0;
    const rpc = vi.fn(async () => { const data = rows.slice(offset, offset + 500); offset += 500; return { data, error: null }; });
    expect((await loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records)))[1]?.unit).toBe("The PEAK #2807");
    expect(rpc).toHaveBeenCalledTimes(21);
  });
  it("follows an exact fingerprint reversal to the settled fee", async () => {
    const model = fixture("reversal");
    const records = { ...feeRecords(), owner_event_allocation_sets: [
      { id: "reverse", source_line_id: "source", source_type: "reversal", source_fingerprint: model.lines[0]!.sources[0]!.sourceFingerprint, reversal_of_allocation_set_id: "original" },
      { id: "original", source_line_id: "source", source_type: "owner_invoice_payment", source_fingerprint: "original-fingerprint" },
    ] };
    const rpc = vi.fn().mockResolvedValue({ data: [feeRow(model)], error: null });
    expect((await loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records)))[1]?.unit).toBe("The PEAK #2807");
  });
  it.each([
    ["organization", { organization_id: "other" }], ["property", { property_id: "other" }],
    ["currency", { currency: "KHR" }], ["unit", { unit_id: "missing" }],
    ["invoice", { source_parent_id: null }], ["source type", { source_type: "owner_invoice_line" }],
    ["recognition date", { recognized_on: "2026-08-01", cursor_recognized_on: "2026-08-01" }],
  ] satisfies [string, Partial<OwnerProfitLossEventDatabaseRow>][])("fails closed for an inconsistent %s", async (_label, overrides) => {
    const model = fixture("owner_invoice_payment");
    const records = feeRecords();
    const rpc = vi.fn().mockResolvedValue({ data: [feeRow(model, "source", overrides)], error: null });
    await expect(loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records))).rejects.toThrow();
  });
  it.each(["denied", "missing", "different fee", "stalled cursor"])("does not guess attribution when projection is %s", async problem => {
    const model = fixture("owner_invoice_payment");
    const records = feeRecords();
    const data = problem === "different fee" ? [feeRow(model, "another")] : problem === "stalled cursor" ? [feeRow(model), feeRow(model)] : [];
    const rpc = vi.fn().mockResolvedValue({ data, error: problem === "denied" ? { message: "Not authorized", code: "42501" } : null });
    await expect(loadStatementTransactionDetails(client(model, records, rpc), model, identity, finance(model, records))).rejects.toThrow();
  });
});
