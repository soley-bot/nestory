import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OwnerStatementPublicationModel } from "./owner-statement-report";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { loadOwnerProfitLossEventPage } from "./owner-profit-loss-events";
import { getReportMonthRange } from "../reports.filters";
import type { OwnerProfitLossEvent, OwnerProfitLossEventCursor, OwnerProfitLossEventsRpcClient } from "./owner-profit-loss-events.types";

export type StatementTransactionDetail = { unit: string; name: string; category: string };
type Row = Record<string, unknown>;
type Table = keyof Database["public"]["Tables"];
type DetailQuery = {
  eq(column: string, value: string): DetailQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
};
type StatementFinanceReferences = {
  properties: Pick<ScopedFinanceContext["properties"][number], "id">[];
  units: Pick<ScopedFinanceContext["units"][number], "id" | "property_id" | "unit_number">[];
};

// Display enrichment only: never change the frozen dates, amounts, or balances.
// Follow explicit source IDs. A property's unit count is not attribution evidence.
export async function loadStatementTransactionDetails(
  client: SupabaseClient<Database>, model: OwnerStatementPublicationModel,
  identity: { ownerName: string; organizationName: string },
  finance: StatementFinanceReferences,
): Promise<Record<number, StatementTransactionDetail>> {
  if (!finance.properties.some(row => row.id === model.propertyId)) {
    throw new Error("Statement property is unavailable in the authorized finance context.");
  }
  const cache = new Map<string, Promise<Row | null>>();
  const feeMonths = new Map<string, Promise<Map<string, OwnerProfitLossEvent>>>();
  function read(table: Table, columns: string, id: string, field = "id", fingerprint?: string) {
    const key = `${table}:${field}:${id}:${columns}:${fingerprint ?? ""}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      const query = client.from(table).select(columns) as unknown as DetailQuery;
      let scoped = query.eq("organization_id", model.organizationId).eq(field, id);
      if (fingerprint) scoped = scoped.eq("source_type", "reversal").eq("source_fingerprint", fingerprint);
      const result = await scoped.maybeSingle();
      if (result.error) throw new Error("Statement transaction details could not be loaded.");
      const row = result.data as unknown as Row | null;
      if (row?.property_id && row.property_id !== model.propertyId) throw new Error("Statement transaction property mismatch.");
      return row;
    })());
    return cache.get(key)!;
  }
  const required = async (table: Table, columns: string, id: string, field = "id") => {
    const row = await read(table, columns, id, field);
    if (!row) throw new Error("Statement transaction source is unavailable; resolve its unit before export.");
    return row;
  };
  const value = (row: Row, key: string): string => {
    if (typeof row[key] !== "string" || !row[key]) throw new Error("Statement source link is incomplete.");
    return row[key] as string;
  };
  async function unit(row: Row) {
    if (row.unit_id === null) return "Property-level";
    const found = finance.units.find(unit => unit.id === value(row, "unit_id"));
    if (!found) throw new Error("Statement transaction source is unavailable; resolve its unit before export.");
    if (found.property_id !== model.propertyId) throw new Error("Statement transaction property mismatch.");
    return value(found, "unit_number");
  }
  async function expense(responsibility: Row): Promise<StatementTransactionDetail> {
    const item = await required("finance_expense_items", "id, property_id, unit_id, vendor_label, category", value(responsibility, "finance_expense_item_id"));
    return { unit: await unit(item), name: String(item.vendor_label ?? ""), category: value(item, "category") };
  }
  async function managementFee(id: string, charge?: Row): Promise<StatementTransactionDetail> {
    // Direct fee SELECTs require an internal authority context that a normal
    // Finance request does not have. Reuse the checked property P&L projection.
    const line = charge ?? await required("owner_invoice_lines", "id, property_id, source_type, source_id, recognized_on", id, "source_id");
    if (line.source_type !== "management_fee" || line.source_id !== id) throw new Error("Statement fee source mismatch.");
    const date = value(line, "recognized_on");
    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) throw new Error("Statement fee recognition date is invalid.");
    const month = date.slice(0, 7);
    const period = getReportMonthRange(month);
    // Historical line dates were backfilled from a monthly invoice's first
    // issue date. Search that month by exact fee ID, never the cash-settlement month.
    if (!feeMonths.has(month)) feeMonths.set(month, (async () => {
      const fees = new Map<string, OwnerProfitLossEvent>();
      const scope = {
        organizationId: model.organizationId, propertyId: model.propertyId,
        currency: model.currency, periodStart: period.start, periodEnd: period.end,
      };
      let cursor: OwnerProfitLossEventCursor | null = null;
      let scanned = 0;
      for (;;) {
        const page = await loadOwnerProfitLossEventPage(client as unknown as OwnerProfitLossEventsRpcClient, scope, cursor);
        for (const event of page.rows) {
          if (++scanned > 100_000) throw new Error("Statement fee lookup exceeds 100,000 events.");
          if (event.recognizedOn < period.start || event.recognizedOn > period.end) throw new Error("Statement fee recognition date mismatch.");
          cursor = { recognizedOn: event.recognizedOn, sourceId: event.sourceId, sourceType: event.sourceType };
          if (event.sourceType === "management_fee_occurrence") fees.set(event.sourceId, event);
        }
        if (page.rows.length < page.pageSize) break;
      }
      return fees;
    })());
    const fee = (await feeMonths.get(month)!).get(id);
    if (!fee || fee.sourceParentType !== "tenant_invoice" || !fee.sourceParentId) {
      throw new Error("Statement management fee source is unavailable; resolve its unit before export.");
    }
    return { unit: await unit({ unit_id: fee.unitId }), name: identity.organizationName, category: "Management Fees" };
  }
  async function resolve(type: string, id: string, depth = 0, fingerprint?: string): Promise<StatementTransactionDetail> {
    if (depth > 16) throw new Error("Statement reversal chain is invalid.");
    if (type === "tenant_rent_receipt" || type === "owner_direct_rent_receipt") {
      const allocation = await required(type === "tenant_rent_receipt" ? "tenant_invoice_payment_allocations" : "owner_collection_confirmation_allocations", "id, invoice_line_id", id);
      const line = await required("tenant_invoice_lines", "id, property_id, unit_id, invoice_id, customer_label", value(allocation, "invoice_line_id"));
      const invoice = await required("tenant_invoices", "id, property_id, recipient_label", value(line, "invoice_id"));
      return { unit: await unit(line), name: String(invoice.recipient_label ?? ""), category: String(line.customer_label || "Rent") };
    }
    if (type === "management_fee_occurrence") {
      return managementFee(id);
    }
    if (type === "owner_paid_cost") return expense(await required("ips_expense_responsibilities", "id, property_id, finance_expense_item_id", id));
    if (type === "owner_invoice_payment") {
      const allocation = await read("owner_payment_allocations", "id, owner_invoice_line_id", id)
        ?? await required("owner_charge_cash_allocations", "id, property_id, owner_invoice_line_id", id);
      const line = await required("owner_invoice_lines", "id, property_id, source_type, source_id, recognized_on, reversal_of_id", value(allocation, "owner_invoice_line_id"));
      if (line.source_type === "management_fee") return managementFee(value(line, "source_id"), line);
      const responsibility = await required("ips_expense_responsibilities", "id, property_id, finance_expense_item_id", String(line.reversal_of_id ?? line.id), "owner_invoice_line_id");
      return expense(responsibility);
    }
    if (type === "owner_contribution" || type === "owner_reimbursement") {
      const event = await required("owner_cash_events", "id, property_id, unit_id", id);
      return { unit: await unit(event), name: identity.ownerName, category: type === "owner_contribution" ? "Owner Contribution" : "Owner Reimbursement" };
    }
    if (type === "reversal") {
      if (!fingerprint) throw new Error("Statement reversal fingerprint is missing.");
      const event = await read("owner_event_allocation_sets", "id, property_id, reversal_of_allocation_set_id", id, "source_line_id", fingerprint);
      if (!event) throw new Error("Statement reversal source is unavailable.");
      const original = await required("owner_event_allocation_sets", "id, property_id, source_type, source_line_id, source_fingerprint", value(event, "reversal_of_allocation_set_id"));
      return resolve(value(original, "source_type"), value(original, "source_line_id"), depth + 1, value(original, "source_fingerprint"));
    }
    if (type === "security_deposit_receipt" || type === "security_deposit_refund") {
      const event = await required("lease_deposit_events", "id, property_id, lease_deposit_id", id);
      const deposit = await required("lease_deposits", "id, lease_id", value(event, "lease_deposit_id"));
      const lease = await required("leases", "id, property_id, unit_id", value(deposit, "lease_id"));
      return { unit: await unit(lease), name: "", category: type === "security_deposit_receipt" ? "Security Deposit" : "Security Deposit Refund" };
    }
    // These sources have no unit assignment in their authoritative schema.
    if (type === "owner_component_transfer") {
      const transfer = await required("owner_component_transfer_lines", "id, transfer_instruction_id", id);
      await required("owner_component_transfer_instructions", "id, property_id", value(transfer, "transfer_instruction_id"));
      return { unit: "Property-level", name: identity.ownerName, category: "Balance Transfer" };
    }
    const propertySources = { owner_distribution: ["property_withdrawals", "Owner Distribution"], owner_close_correction: ["owner_close_corrections", "Correction"] } as const;
    const propertySource = propertySources[type as keyof typeof propertySources];
    if (propertySource) {
      await required(propertySource[0], "id, property_id", id);
      return { unit: "Property-level", name: identity.ownerName, category: propertySource[1] };
    }
    throw new Error("Statement transaction source type is unsupported.");
  }
  const lines = model.lines.filter(line => line.lineKind === "movement" && line.component === "ips_held_owner_cash" && !/^-?0\.00$/.test(line.signedAmount));
  if (lines.length > 10000) throw new Error("Statement has too many transactions to enrich safely.");
  const output: Record<number, StatementTransactionDetail> = {};
  for (let offset = 0; offset < lines.length; offset += 5) {
    await Promise.all(lines.slice(offset, offset + 5).map(async line => {
      if (!line.sources.length) throw new Error("Statement transaction has no source attribution.");
      const details: StatementTransactionDetail[] = [];
      for (const source of line.sources) details.push(await resolve(source.sourceType, source.sourceLineId, 0, source.sourceFingerprint));
      const joined = (key: keyof StatementTransactionDetail) => [...new Set(details.map(detail => detail[key]).filter(Boolean))].join(", ");
      output[line.lineNumber] = { unit: joined("unit"), name: joined("name"), category: joined("category") };
    }));
  }
  return output;
}
