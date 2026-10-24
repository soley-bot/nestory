import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { CappedReadRow } from "@/lib/db/complete-read.test-fixture";

/** Generated in memory only. No client, environment, network, auth, or email access. */
export const SCALE_ORGANIZATION_ID = "91000000-0000-4000-8000-000000000001";
export const FOREIGN_ORGANIZATION_ID = "91000000-0000-4000-8000-000000000002";
type Tables = Record<string, CappedReadRow[]>;

export function scaleId(kind: number, index: number) {
  return `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function property(index: number) {
  return {
    id: scaleId(1, index), organization_id: SCALE_ORGANIZATION_ID,
    code: `P${String(index).padStart(5, "0")}`, name: `Synthetic property ${index}`,
    property_type: "Apartment", owner: null, address: `Synthetic address ${index}`,
    status: "active", registered_date: "2024-01-01", rental_structure: "multi_unit" as const,
    acquisition_date: null, notes: null, archived_at: null, edit_version: "1",
  };
}

function unit(index: number, propertyId: string) {
  return {
    id: scaleId(2, index), organization_id: SCALE_ORGANIZATION_ID, property_id: propertyId,
    unit_number: `U${String(index).padStart(5, "0")}`, status: "occupied", archived_at: null,
    current_rent_amount: 1000 + index, current_rent_currency: "USD",
    floor: null, size_sqm: null, bedroom_count: null, bathroom_count: null,
  };
}

function lease(index: number, propertyId: string, unitId: string) {
  return {
    id: scaleId(3, index), organization_id: SCALE_ORGANIZATION_ID, property_id: propertyId,
    unit_id: unitId, tenant_name: `Synthetic tenant ${index}`, primary_tenant_person_id: scaleId(4, index),
    status: "active", archived_at: null, lease_start_date: "2024-01-01", lease_end_date: "2030-12-31",
    monthly_rent_amount: 1000 + index, monthly_rent_currency: "USD",
  };
}

function ledger(index: number, propertyId: string, unitId: string, amount: number) {
  return {
    id: scaleId(5, index), organization_id: SCALE_ORGANIZATION_ID, property_id: propertyId,
    unit_id: unitId, direction: "income", amount, currency: "USD", category: "rent",
    archived_at: null, transaction_date: "2026-10-01", description: "Synthetic rent",
  };
}

function financeContext(properties: ReturnType<typeof property>[], units: ReturnType<typeof unit>[]): ScopedFinanceContext {
  return { properties, units, leases: [], terms: [], billing_terms: [], people: [], owner_assignments: [] };
}

export function makePortfolioScaleFixture(size: number) {
  const properties = Array.from({ length: size }, (_, i) => property(i + 1));
  const units = properties.map((p, i) => unit(i + 1, p.id));
  const tables: Tables = {
    properties: [...properties], units: [...units],
    current_leases: units.map((u, i) => lease(i + 1, u.property_id, u.id)),
    ledger_entries: units.map((u, i) => ledger(i + 1, u.property_id, u.id, i + 1)),
    property_owners: [], people: [], timeline_events: [], documents: [],
  };
  for (const [i, p] of properties.entries()) {
    const person = { id: scaleId(6, i + 1), organization_id: SCALE_ORGANIZATION_ID, display_name: `Synthetic owner ${i + 1}`, archived_at: null };
    tables.people.push(person);
    tables.property_owners.push({
      id: scaleId(7, i + 1), organization_id: SCALE_ORGANIZATION_ID, property_id: p.id,
      person_id: person.id, person, ownership_percent: 100, is_primary: true,
      archived_at: null, ended_on: null, started_on: "2024-01-01",
    });
  }
  // Deliberately conflicting parent IDs ensure missing organization predicates
  // are observable in this API-boundary test. This does not model database RLS.
  tables.properties.push({ ...property(size + 1), organization_id: FOREIGN_ORGANIZATION_ID });
  tables.units.push({ ...unit(size + 1, properties[0].id), organization_id: FOREIGN_ORGANIZATION_ID });
  tables.current_leases.push({ ...lease(size + 1, properties[0].id, units[0].id), organization_id: FOREIGN_ORGANIZATION_ID });
  tables.ledger_entries.push({ ...ledger(size + 1, properties[0].id, units[0].id, 999999), organization_id: FOREIGN_ORGANIZATION_ID });
  return {
    tables, properties, units, context: financeContext(properties, units),
    expected: { count: size, totalLedgerUsd: size * (size + 1) / 2, lastPropertyId: properties.at(-1)!.id, lastUnitId: units.at(-1)!.id },
  };
}

export function makeDensePropertyScaleFixture() {
  const properties = [property(1)];
  const units = Array.from({ length: 1201 }, (_, i) => unit(i + 1, properties[0].id));
  const tables: Tables = {
    properties, units: [...units],
    current_leases: units.map((u, i) => lease(i + 1, u.property_id, u.id)),
    ledger_entries: Array.from({ length: 6001 }, (_, i) => ledger(i + 1, properties[0].id, units[0].id, 1)),
    timeline_events: Array.from({ length: 1200 }, (_, i) => ({
      id: scaleId(8, i + 1), organization_id: SCALE_ORGANIZATION_ID, property_id: properties[0].id,
      unit_id: units[0].id, archived_at: null, event_date: "2026-10-21", event_type: "note",
      title: `Synthetic newer event ${i + 1}`, description: null, lease_id: null,
      ledger_entry_id: null, cost_amount: null, cost_currency: null,
    })),
    property_owners: [], people: [], documents: [],
  };
  tables.timeline_events.push({
    id: scaleId(8, 1201), organization_id: SCALE_ORGANIZATION_ID, property_id: properties[0].id,
    unit_id: units[1].id, archived_at: null, event_date: "2024-01-01", event_type: "note",
    title: "Synthetic older event from the next unit", description: null, lease_id: null,
    ledger_entry_id: null, cost_amount: null, cost_currency: null,
  });
  tables.units.push({ ...unit(1202, properties[0].id), organization_id: FOREIGN_ORGANIZATION_ID });
  tables.ledger_entries.push({ ...ledger(6002, properties[0].id, units[0].id, 999999), organization_id: FOREIGN_ORGANIZATION_ID });
  return { tables, properties, units, expected: { units: 1201, ledgerRows: 6001, ledgerUsd: 6001, timelineRows: 1201 } };
}

/** One invoice per unit per calendar month, October 2023 through September 2026. */
export function makeInvoiceHistoryScaleFixture(unitCount: number) {
  const properties = Array.from({ length: unitCount }, (_, i) => property(i + 1));
  const units = properties.map((p, i) => unit(i + 1, p.id));
  const tables: Tables = {
    tenant_invoice_balances: [], tenant_invoice_lines: [], finance_receipt_allocations: [],
    owner_collection_confirmation_allocations: [], deposit_rent_allocations: [], rent_policy_versions: [],
  };
  const invoiceIds: string[] = [];
  for (let month = 0; month < 36; month++) {
    const year = 2023 + Math.floor((9 + month) / 12);
    const monthNumber = (9 + month) % 12 + 1;
    const prefix = `${year}-${String(monthNumber).padStart(2, "0")}`;
    for (let index = 0; index < unitCount; index++) {
      const serial = month * unitCount + index + 1;
      const invoiceId = scaleId(11, serial);
      const lineId = scaleId(12, serial);
      const incomeId = scaleId(13, serial);
      invoiceIds.push(invoiceId);
      tables.tenant_invoice_balances.push({
        id: invoiceId, organization_id: SCALE_ORGANIZATION_ID, property_id: properties[index].id,
        unit_id: units[index].id, lease_id: null, invoice_number: `SYN-${serial}`,
        recipient_label: `Synthetic tenant ${index + 1}`, issue_date: `${prefix}-01`, due_date: `${prefix}-05`,
        lifecycle: "issued", currency: "USD",
      });
      tables.tenant_invoice_lines.push({
        id: lineId, organization_id: SCALE_ORGANIZATION_ID, invoice_id: invoiceId,
        income_item_id: incomeId, amount: "100.03", line_type: "rent",
      });
      tables.finance_receipt_allocations.push({
        id: scaleId(14, serial), organization_id: SCALE_ORGANIZATION_ID, income_item_id: incomeId, signed_amount: "40.02",
      });
      tables.owner_collection_confirmation_allocations.push({
        id: scaleId(15, serial), organization_id: SCALE_ORGANIZATION_ID, invoice_line_id: lineId, signed_amount: "10.00",
      });
      tables.deposit_rent_allocations.push({
        id: scaleId(16, serial), organization_id: SCALE_ORGANIZATION_ID, invoice_id: invoiceId,
        invoice_line_id: lineId, property_id: properties[index].id, signed_amount: "10.01",
      });
    }
  }
  // Every source has a second-organization sentinel that would match its
  // relationship predicate. None may affect IDs, source links, or totals.
  for (const [table, rows] of Object.entries(tables)) {
    if (rows.length === 0) continue;
    tables[table].push({
      ...rows[0], id: scaleId(99, invoiceIds.length + Object.keys(tables).indexOf(table)),
      organization_id: FOREIGN_ORGANIZATION_ID, amount: "999999.99", signed_amount: "999999.99",
    });
  }
  return {
    tables, context: financeContext(properties, units), invoiceIds,
    expected: {
      invoices: unitCount * 36,
      sourceLinks: unitCount * 36 * 4,
      chargesCents: BigInt(unitCount * 36) * BigInt(10003),
      receiptsCents: BigInt(unitCount * 36) * BigInt(5002),
      depositsCents: BigInt(unitCount * 36) * BigInt(1001),
      outstandingCents: BigInt(unitCount * 36) * BigInt(4000),
    },
  };
}

export function makeOwnerActivityScaleFixture(propertyCount = 1000, entriesPerProperty = 36) {
  const properties = Array.from({ length: propertyCount }, (_, i) => property(i + 1));
  const entries = properties.flatMap((p, index) => Array.from({ length: entriesPerProperty }, (_, offset) => ({
    organization_id: SCALE_ORGANIZATION_ID, property_id: p.id, event_date: "2026-10-15",
    amount: "0.01", balance_effect: "0.01", category: "rent_income", label: "Synthetic recorded rent",
    source_type: "tenant_invoice_payment", source_id: scaleId(17, index * entriesPerProperty + offset + 1),
  })));
  const tables: Tables = { property_account_entries: [
    ...entries,
    { ...entries[0], organization_id: FOREIGN_ORGANIZATION_ID, source_id: scaleId(99, 1), amount: "999999.99" },
    { ...entries[0], property_id: scaleId(99, 2), source_id: scaleId(99, 3), amount: "999999.99" },
  ] };
  return { tables, context: financeContext(properties, []), expected: { properties: propertyCount, rows: propertyCount * entriesPerProperty, cents: BigInt(propertyCount * entriesPerProperty), entriesPerProperty } };
}

/** Test oracle uses integer cents independently of the application's formatter. */
export function expectedUsd(cents: bigint) {
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `USD ${whole}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
