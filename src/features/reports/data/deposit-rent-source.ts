import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import type { OwnerReportFact } from "./owner-report-model";

type Scope = { organizationId: string; propertyIds: readonly string[]; unitId?: string; periodEnd: string };
export type DepositRentEvent = {
  id: string; lease_deposit_id: string; property_id: string; unit_id: string | null;
  event_type: "received" | "refunded" | "retained" | "applied" | "reversed";
  event_date: string; amount: string; currency: string; reversal_of_id: string | null;
};
export type DepositRentAllocation = {
  id: string; application_id: string; application_amount: string; deposit_event_id: string;
  lease_deposit_id: string; invoice_id: string; invoice_line_id: string; property_id: string; unit_id: string | null;
  currency: string; settlement_date: string; custodian: "ips" | "owner"; owner_person_id: string | null;
  signed_amount: string; reversal_of_allocation_id: string | null; reversal_of_application_id: string | null;
  custody_confirmation_id: string; line_type: "rent";
};

// Pure validation of supplied snapshot evidence; never an authorization/read
// certification boundary. A client payload cannot authorize report export.
// Recognition stays review_required unless the caller explicitly supplies the
// proposed application-date policy for a synthetic/review projection.
export function normalizeDepositRentSources(scope: Scope, packet: {
  organizationId: string; events: readonly DepositRentEvent[]; allocations: readonly DepositRentAllocation[];
}, cashRecognition: "review_required" | "application_date" = "review_required") {
  if (packet.organizationId !== scope.organizationId || !["review_required", "application_date"].includes(cashRecognition)) throw new Error("Deposit source scope or policy mismatch.");
  const sourceScope = (row: { property_id: string; unit_id: string | null; currency: string }) => {
    if (!scope.propertyIds.includes(row.property_id) || row.currency !== "USD"
      || scope.unitId && row.unit_id !== null && row.unit_id !== scope.unitId) throw new Error("Deposit source scope mismatch.");
  };
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString().slice(0, 10) !== value || value > scope.periodEnd) throw new Error("Invalid deposit source date.");
  };
  const events = new Map<string, DepositRentEvent>();
  for (const row of packet.events) {
    sourceScope(row); date(row.event_date);
    if (!row.id || !row.lease_deposit_id || events.has(row.id) || parseExactMoneyToCents(row.amount) <= BigInt(0)
      || !["received", "refunded", "retained", "applied", "reversed"].includes(row.event_type)
      || (row.event_type === "reversed") !== Boolean(row.reversal_of_id)) throw new Error("Invalid or duplicate custody event.");
    events.set(row.id, row);
  }
  const allocations = new Map<string, DepositRentAllocation>();
  const groups = new Map<string, DepositRentAllocation[]>();
  const pairedEvents = new Set<string>();
  for (const row of packet.allocations) {
    sourceScope(row); date(row.settlement_date);
    if (!row.id || allocations.has(row.id) || !row.application_id || !row.invoice_id || !row.invoice_line_id || !row.custody_confirmation_id
      || row.line_type !== "rent" || !["ips", "owner"].includes(row.custodian)
      || (row.custodian === "owner") !== Boolean(row.owner_person_id)) throw new Error("Invalid deposit rent allocation.");
    const event = events.get(row.deposit_event_id);
    const signed = parseExactMoneyToCents(row.signed_amount);
    if (!event || event.lease_deposit_id !== row.lease_deposit_id || event.property_id !== row.property_id
      || event.unit_id !== row.unit_id || event.currency !== row.currency || event.event_date !== row.settlement_date
      || event.amount !== row.application_amount || signed === BigInt(0)
      || (signed < BigInt(0)) !== Boolean(row.reversal_of_allocation_id)
      || Boolean(row.reversal_of_application_id) !== Boolean(row.reversal_of_allocation_id)
      || event.event_type !== (signed < BigInt(0) ? "reversed" : "applied")) throw new Error("Missing or inconsistent paired custody release.");
    allocations.set(row.id, row);
    groups.set(row.application_id, [...(groups.get(row.application_id) ?? []), row]);
  }
  const facts: OwnerReportFact[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (pairedEvents.has(first.deposit_event_id)) throw new Error("Custody event linked to multiple applications.");
    pairedEvents.add(first.deposit_event_id);
    const immutableHeader = (row: DepositRentAllocation) => JSON.stringify([row.deposit_event_id, row.lease_deposit_id,
      row.invoice_id, row.property_id, row.unit_id, row.currency, row.settlement_date, row.custodian, row.owner_person_id,
      row.custody_confirmation_id, row.application_amount, row.reversal_of_application_id]);
    if (group.some(row => immutableHeader(row) !== immutableHeader(first)) || new Set(group.map(row => row.invoice_line_id)).size !== group.length) throw new Error("Application header or line fan-out mismatch.");
    const sum = group.reduce((total, row) => total + parseExactMoneyToCents(row.signed_amount), BigInt(0));
    if ((sum < BigInt(0) ? -sum : sum) !== parseExactMoneyToCents(first.application_amount)) throw new Error("Application allocation conservation failed.");
    if (first.reversal_of_application_id) {
      const originals = groups.get(first.reversal_of_application_id);
      if (!originals || originals.length !== group.length) throw new Error("Full reversal original evidence missing.");
      for (const row of group) {
        const original = allocations.get(row.reversal_of_allocation_id!);
        if (!original || original.reversal_of_allocation_id || original.application_id !== first.reversal_of_application_id
          || original.invoice_id !== row.invoice_id || original.invoice_line_id !== row.invoice_line_id
          || original.lease_deposit_id !== row.lease_deposit_id || original.custodian !== row.custodian
          || original.custody_confirmation_id !== row.custody_confirmation_id || original.owner_person_id !== row.owner_person_id
          || row.settlement_date < original.settlement_date || events.get(row.deposit_event_id)?.reversal_of_id !== original.deposit_event_id
          || parseExactMoneyToCents(row.signed_amount) !== -parseExactMoneyToCents(original.signed_amount)) throw new Error("Reversal lineage or custody mismatch.");
      }
    }
    for (const row of group) facts.push({ sourceType: "deposit_rent_allocation", sourceId: row.id,
      organizationId: scope.organizationId, propertyId: row.property_id, unitId: row.unit_id, currency: "USD", category: "Rent",
      description: `Rent settled from ${row.custodian === "ips" ? "IPS" : "owner"} deposit custody; no new cash receipt`,
      obligationId: row.invoice_id, reversalOfSourceKey: row.reversal_of_allocation_id ? `deposit_rent_allocation:${row.reversal_of_allocation_id}` : null,
      kind: "deposit_rent_settlement", settledOn: row.settlement_date, signedAmount: row.signed_amount, applicationId: row.application_id,
      depositEventId: row.deposit_event_id, invoiceLineId: row.invoice_line_id, custodian: row.custodian, ownerPersonId: row.owner_person_id, cashRecognition });
  }
  const reversals = new Set<string>();
  for (const event of events.values()) {
    let sign = event.event_type === "received" ? BigInt(1) : BigInt(-1);
    if (event.reversal_of_id) {
      const original = events.get(event.reversal_of_id);
      if (!original || original.reversal_of_id || reversals.has(original.id) || original.lease_deposit_id !== event.lease_deposit_id
        || original.property_id !== event.property_id || original.unit_id !== event.unit_id || original.currency !== event.currency
        || original.amount !== event.amount || event.event_date < original.event_date) throw new Error("Custody reversal lineage mismatch.");
      reversals.add(original.id);
      if (pairedEvents.has(original.id) && !pairedEvents.has(event.id)) throw new Error("Linked custody reversal requires a paired rent reversal.");
      sign = original.event_type === "received" ? BigInt(-1) : BigInt(1);
    }
    facts.push({ sourceType: "lease_deposit_event", sourceId: event.id, organizationId: scope.organizationId,
      propertyId: event.property_id, unitId: event.unit_id, currency: "USD", category: "Deposit custody", description: event.event_type,
      obligationId: event.lease_deposit_id, reversalOfSourceKey: event.reversal_of_id ? `lease_deposit_event:${event.reversal_of_id}` : null,
      kind: "custody", eventOn: event.event_date, signedAmount: `${sign < BigInt(0) ? "-" : ""}${event.amount}` });
  }
  return { facts, sourceCoverage: "unverified" as const,
    unlinkedAppliedEventIds: [...events.values()].filter(event => event.event_type === "applied" && !pairedEvents.has(event.id)).map(event => event.id) };
}
