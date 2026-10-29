import { createCappedReadHarness as createReadHarness } from "@/lib/db/complete-read.test-fixture";
import type { CappedReadRow } from "@/lib/db/complete-read.test-fixture";
import { matchesSearchText } from "@/lib/search/text";
import { formatPropertyStatus, normalizePropertyStatus } from "./property-summary";
import { formatLeaseStatus, formatUnitStatus } from "@/features/units/data/unit-summary";

export type { CappedReadRow } from "@/lib/db/complete-read.test-fixture";

type RpcRead = { name: string; args: Record<string, unknown> };
type RpcResult = { data: unknown; error: { message: string } | null };
type FixtureOptions = NonNullable<Parameters<typeof createReadHarness>[1]> & {
  transformRpcResult?: (read: RpcRead, result: RpcResult) => RpcResult;
};

// Keep the real financial read fence active. Scalar RPC responses are computed
// from fixture records before the synthetic table cap, as in the SQL contract.
// This tests loader wiring, not PostgreSQL/RLS execution.
export function createCappedReadHarness(tables: Record<string, CappedReadRow[]>, options: FixtureOptions = {}) {
  const harness = createReadHarness(tables, options);
  const rpcReads: RpcRead[] = [];
  const context = { generation: 2, status: "open", financial_start_date: "2026-10-01", enforced: true };
  return {
    ...harness,
    rpcReads,
    client: {
      ...harness.client,
      async rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
        const read = { name, args };
        rpcReads.push(read);
        let data: unknown;
        if (name === "get_financial_write_context") data = context;
        else if (name === "get_financial_report_context") data = { context, source_revision: "4" };
        else if (name === "get_portfolio_ledger_totals") data = ledgerTotals(tables, args);
        else if (name === "get_property_register_page" || name === "get_unit_register_page") data = registerPage(tables, name, args);
        else throw new Error(`Unexpected property/unit fixture RPC: ${name}`);
        const result = { data, error: null };
        return options.transformRpcResult?.(read, result) ?? result;
      },
    },
  };
}

function ledgerTotals(tables: Record<string, CappedReadRow[]>, args: Record<string, unknown>) {
  const groups = new Map<string, CappedReadRow & { amount: number; entry_count: number }>();
  const periodStart = string(args.p_period_start);
  for (const kind of ["property", "unit"] as const) {
    const ids = new Set((args[`p_${kind}_ids`] ?? []) as string[]);
    for (const row of visible(tables, "ledger_entries", args.p_organization_id)) {
      if (!ids.has(string(row[`${kind}_id`]))) continue;
      const category = string(row.category).toLowerCase();
      const bucket = {
        scope_type: kind, scope_id: row[`${kind}_id`], currency: row.currency, direction: row.direction,
        transaction_date: periodStart && string(row.transaction_date) >= periodStart ? periodStart : "0001-01-01",
        category: !periodStart ? "" : `${/rent|lease/.test(category) ? "rent " : ""}${/maintenance|repair|renovation|service/.test(category) ? "maintenance" : ""}`,
      };
      const key = JSON.stringify(bucket);
      const total = groups.get(key) ?? { ...bucket, amount: 0, entry_count: 0 };
      total.amount += Number(row.amount);
      total.entry_count += 1;
      groups.set(key, total);
    }
  }
  return [...groups.values()];
}

function registerPage(tables: Record<string, CappedReadRow[]>, name: string, args: Record<string, unknown>) {
  const filters = (args.p_filters ?? {}) as Record<string, unknown>;
  const org = args.p_organization_id;
  const properties = new Map(visible(tables, "properties", org, true).map(row => [row.id, row]));
  const people = new Map(visible(tables, "people", org, true).map(row => [row.id, row]));
  const owners = groupBy(visible(tables, "property_owners", org).filter(row => row.ended_on == null), "property_id");
  const units = groupBy(visible(tables, "units", org, true), "property_id");
  const leases = visible(tables, "current_leases", org);
  const propertyLeases = groupBy(leases, "property_id");
  const unitLeases = groupBy(leases, "unit_id");
  const propertyLedger = groupBy(visible(tables, "ledger_entries", org), "property_id");
  const unitLedger = groupBy(visible(tables, "ledger_entries", org), "unit_id");
  const timelines = groupBy(visible(tables, "timeline_events", org), "unit_id");
  const photos = groupBy(visible(tables, "asset_photos", org), "property_id");
  const images = groupBy(visible(tables, "documents", org).filter(row => ["image/jpeg", "image/png", "image/webp"].includes(string(row.mime_type))), "property_id");
  const ownerNames = (propertyId: unknown) => (owners.get(propertyId) ?? []).map(row => {
    const person = people.get(row.person_id) ?? row.person as CappedReadRow | undefined;
    return `${string(person?.display_name)} ${string(person?.legal_name)}`;
  });
  const primaryName = (propertyId: unknown) => {
    const owner = (owners.get(propertyId) ?? []).find(row => row.is_primary);
    const person = owner && (people.get(owner.person_id) ?? owner.person as CappedReadRow | undefined);
    return person?.display_name;
  };
  const query = string(filters.query);
  const sort = string(filters.sort);
  let selected: { row: CappedReadRow; net: number; rent?: number; activeLease?: boolean; property?: CappedReadRow }[];
  if (name === "get_property_register_page") {
    selected = [...properties.values()].flatMap(row => {
      const currentUnits = (units.get(row.id) ?? []).filter(unit => unit.archived_at == null);
      const currentLeases = (propertyLeases.get(row.id) ?? []).filter(lease => ["active", "notice_given"].includes(string(lease.status)));
      const leasedUnitCount = new Set(currentLeases.map(lease => lease.unit_id).filter(Boolean)).size;
      const missingLease = currentUnits.length ? currentUnits.length > leasedUnitCount : currentLeases.length === 0;
      const net = netTotal(propertyLedger.get(row.id) ?? []);
      if (!matchesArchive(row, filters.archiveState) || (filters.status !== "all" && filters.status && normalizePropertyStatus(string(row.status)) !== filters.status)
        || (filters.ownerStatus === "missing" && (owners.get(row.id) ?? []).some(owner => owner.is_primary))
        || (filters.netStatus === "negative" && net >= 0)
        || (filters.leaseStatus === "missing" && !missingLease) || (filters.leaseStatus === "current" && missingLease)
        || (filters.review === "needs_units" && currentUnits.length > 0)
        || (filters.review === "missing_address" && (row.address ?? "No address recorded") !== "No address recorded")
        || (filters.review === "missing_photos" && ((photos.get(row.id)?.length ?? 0) > 0 || (images.get(row.id)?.length ?? 0) > 0))) return [];
      const search = [row.name, row.code, row.property_type, primaryName(row.id) ?? row.owner ?? "No owner recorded", row.address ?? "No address recorded", formatPropertyStatus(string(row.status)), ...ownerNames(row.id), ...(units.get(row.id) ?? []).map(unit => unit.unit_number)];
      return matchesSearchText(query, search.map(string)) ? [{ row, net }] : [];
    });
    selected.sort((a, b) => (sort === "net_desc" ? b.net - a.net : sort === "net_asc" ? a.net - b.net : sort === "name_asc" ? natural(a.row.name, b.row.name) : sort === "status_asc" ? natural(normalizePropertyStatus(string(a.row.status)), normalizePropertyStatus(string(b.row.status))) : 0)
      || natural(a.row.code, b.row.code) || string(a.row.id).localeCompare(string(b.row.id)));
  } else {
    selected = visible(tables, "units", org, true).flatMap(row => {
      const property = properties.get(row.property_id);
      const current = (unitLeases.get(row.id) ?? []).filter(lease => ["active", "notice_given", "draft"].includes(string(lease.status))).sort((a, b) => Number(b.status !== "draft") - Number(a.status !== "draft") || string(b.lease_start_date).localeCompare(string(a.lease_start_date)) || string(b.id).localeCompare(string(a.id)))[0];
      const activeLease = current?.status === "active" || current?.status === "notice_given";
      if (!matchesArchive(row, filters.archiveState) || (filters.propertyId && filters.propertyId !== "all" && row.property_id !== filters.propertyId)
        || (filters.status && filters.status !== "all" && string(row.status).trim().toLowerCase() !== filters.status)
        || (filters.leaseStatus === "missing" && activeLease) || (filters.occupancy === "occupied" && !activeLease) || (filters.occupancy === "unoccupied" && activeLease)) return [];
      const latest = (timelines.get(row.id) ?? []).toSorted((a, b) => string(b.event_date).localeCompare(string(a.event_date)) || string(b.id).localeCompare(string(a.id)))[0];
      const names = ownerNames(row.property_id);
      const search = [row.unit_number, property?.code ?? "Unknown", property?.name ?? "Unknown property", primaryName(row.property_id), row.floor ?? "Not set", formatUnitStatus(string(row.status)), current ? `${current.tenant_name} / ${formatLeaseStatus(string(current.status))}` : "No lease", latest?.title, ...(names.length ? names : [property?.owner])];
      const rent = activeLease ? Number(current?.monthly_rent_amount ?? 0) : row.current_rent_currency ? Number(row.current_rent_amount ?? 0) : 0;
      return matchesSearchText(query, search.map(string)) ? [{ row, property, activeLease, rent, net: netTotal(unitLedger.get(row.id) ?? []) }] : [];
    });
    selected.sort((a, b) => (sort === "rent_desc" ? (b.rent ?? 0) - (a.rent ?? 0) : sort === "net_desc" ? b.net - a.net : sort === "status_asc" ? Number(b.activeLease) - Number(a.activeLease) : sort === "unit_asc" ? natural(a.row.unit_number, b.row.unit_number) : Number(a.row.archived_at != null) - Number(b.row.archived_at != null))
      || natural(a.property?.code, b.property?.code) || (sort === "property_asc" ? natural(a.property?.name, b.property?.name) : 0)
      || natural(a.row.unit_number, b.row.unit_number) || string(a.row.id).localeCompare(string(b.row.id)));
  }
  const pageSize = Math.min(100, Math.max(1, Number(args.p_page_size ?? 10)));
  const page = Math.min(Math.max(1, Number(args.p_page ?? 1)), Math.max(1, Math.ceil(selected.length / pageSize)));
  return { total_count: selected.length, ids: selected.slice((page - 1) * pageSize, page * pageSize).map(item => item.row.id) };
}

function visible(tables: Record<string, CappedReadRow[]>, name: string, org: unknown, includeArchived = false) {
  return (tables[name] ?? []).filter(row => row.organization_id === org && (includeArchived || row.archived_at == null));
}
function groupBy(rows: CappedReadRow[], key: string) {
  const grouped = new Map<unknown, CappedReadRow[]>();
  for (const row of rows) {
    const group = grouped.get(row[key]) ?? [];
    group.push(row);
    grouped.set(row[key], group);
  }
  return grouped;
}
function matchesArchive(row: CappedReadRow, archive: unknown) {
  return archive === "all" || (archive === "archived" ? row.archived_at != null : row.archived_at == null);
}
function netTotal(rows: CappedReadRow[]) {
  return rows.reduce((total, row) => total + Number(row.amount) * (row.direction === "expense" ? -1 : 1), 0);
}
function string(value: unknown) { return value == null ? "" : String(value); }
function natural(a: unknown, b: unknown) { return string(a).localeCompare(string(b), undefined, { numeric: true, sensitivity: "base" }); }
