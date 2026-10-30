import { vi } from "vitest";
import type { OverviewSummary } from "./overview-summary.types";
import type { createSupabaseServerClient } from "@/lib/db/server";

export const fixtureOrganizationId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;
type Filter = { column: string; operator: string; value: unknown };
export type OverviewFixtureRequest = {
  columns: string;
  filters: Filter[];
  from?: number;
  head: boolean;
  orders: Array<{ ascending: boolean; column: string }>;
  returnedRows: number;
  table: string;
  to?: number;
};
export type OverviewFixtureResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
  errorAtFrom?: number;
};

// This deliberately implements filters, ordering, projections and server caps.
// It measures request/row counts, not database latency, SQL plans or RLS.
export function createOverviewFixture(
  tables: Record<string, OverviewFixtureResult> = {},
  serverCap = 1_000,
) {
  const requests: OverviewFixtureRequest[] = [];
  const rpcRequests: Array<{ name: string; args: Record<string, string | undefined> }> = [];
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, string | undefined>) => {
      rpcRequests.push({ name, args });
      const failure = Object.values(tables).find(table => table.error)?.error;
      if (failure) return { data: null, error: failure };
      if (tables.ledger_entries?.count === null) return { data: null, error: { message: "exact count is missing" } };
      return { data: aggregateOverviewFixture(tables, args), error: null };
    }),
    from: vi.fn((table: string) => {
      const result = tables[table] ?? {};
      const rows = (result.data ?? []).map((value, index) => ({
        id: `${table}-${String(index).padStart(6, "0")}`,
        organization_id: fixtureOrganizationId,
        archived_at: null,
        status: "active",
        primary_email: null,
        primary_phone: null,
        email: null,
        phone: null,
        ended_on: null,
        authority_kind: "authoritative",
        start_date: "2020-01-01",
        end_date: "2099-12-31",
        ...(value as Row),
      }));
      const request: OverviewFixtureRequest = {
        columns: "*", filters: [], head: false, orders: [], returnedRows: 0, table,
      };
      let limit = serverCap;
      const filter = (operator: string, column: string, value: unknown) => {
        request.filters.push({ column, operator, value });
        return query;
      };
      const execute = () => {
        const snapshot = { ...request, filters: [...request.filters], orders: [...request.orders] };
        requests.push(snapshot);
        if (result.error && (request.from ?? 0) >= (result.errorAtFrom ?? 0)) {
          return { count: null, data: null, error: result.error };
        }
        const filtered = rows.filter((row) => request.filters.every((condition) => matches(row, condition)));
        filtered.sort((left, right) => {
          for (const order of request.orders) {
            const first = (left as Row)[order.column];
            const second = (right as Row)[order.column];
            const comparison = first === second ? 0 : String(first) < String(second) ? -1 : 1;
            if (comparison) return order.ascending ? comparison : -comparison;
          }
          return 0;
        });
        const from = request.from ?? 0;
        const take = Math.min(serverCap, limit, request.to === undefined ? serverCap : request.to - from + 1);
        const data = request.head ? null : filtered.slice(from, from + take).map((row) =>
          request.columns === "*" ? row : Object.fromEntries(request.columns.split(",").map((column) => {
            const key = column.trim();
            return [key, (row as Row)[key]];
          })),
        );
        snapshot.returnedRows = data?.length ?? 0;
        return {
          count: result.count === undefined ? filtered.length : result.count,
          data,
          error: null,
        };
      };
      const query = {
        eq: (column: string, value: unknown) => filter("eq", column, value),
        gte: (column: string, value: unknown) => filter("gte", column, value),
        in: (column: string, value: unknown[]) => filter("in", column, value),
        is: (column: string, value: unknown) => filter("eq", column, value),
        limit: (value: number) => { limit = value; return query; },
        lt: (column: string, value: unknown) => filter("lt", column, value),
        lte: (column: string, value: unknown) => filter("lte", column, value),
        match: (values: Row) => { Object.entries(values).forEach(([column, value]) => filter("eq", column, value)); return query; },
        neq: (column: string, value: unknown) => filter("neq", column, value),
        not: (column: string, operator: string, value: unknown) => {
          if (operator !== "is") throw new Error(`Unsupported fixture operator: ${operator}`);
          return filter("neq", column, value);
        },
        or: (value: string) => {
          if (value !== "email.not.is.null,phone.not.is.null") throw new Error(`Unsupported fixture OR: ${value}`);
          return filter("contact", "", null);
        },
        order: (column: string, options: { ascending: boolean }) => {
          request.orders.push({ column, ...options }); return query;
        },
        range: (from: number, to: number) => { request.from = from; request.to = to; return query; },
        select: (columns: string, options?: { head?: boolean }) => {
          request.columns = columns; request.head = options?.head ?? false; return query;
        },
        then: (resolve: (value: ReturnType<typeof execute>) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve().then(execute).then(resolve, reject),
      };
      return query;
    }),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
  return { client, requests, rpcRequests };
}

function matches(row: Row, { column, operator, value }: Filter) {
  const actual = row[column];
  if (operator === "eq") return actual === value;
  if (operator === "neq") return actual !== null && actual !== undefined && actual !== value;
  if (operator === "in") return (value as unknown[]).includes(actual);
  if (operator === "contact") return row.email !== null || row.phone !== null;
  if (actual === null || actual === undefined) return false;
  const first = typeof value === "number" ? Number(actual) : String(actual);
  const second = typeof value === "number" ? value : String(value);
  if (operator === "gte") return first >= second;
  if (operator === "lt") return first < second;
  if (operator === "lte") return first <= second;
  throw new Error(`Unsupported fixture operator: ${operator}`);
}


// Independent in-memory oracle for the SQL wire contract. It deliberately reads
// the whole synthetic dataset; the loader sees only this aggregate RPC response.
function aggregateOverviewFixture(tables: Record<string, OverviewFixtureResult>, args: Record<string, string | undefined>): OverviewSummary {
  type FixtureRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows = (table: string): FixtureRow[] => (tables[table]?.data ?? []).map((value, index) => ({
    id: `${table}-${String(index).padStart(6, "0")}`, organization_id: fixtureOrganizationId, archived_at: null,
    status: "active", primary_email: null, primary_phone: null, email: null, phone: null, ended_on: null,
    authority_kind: "authoritative", start_date: "2020-01-01", end_date: "2099-12-31", ...value as Row,
  })).filter(row => row.organization_id === args.p_organization_id && !row.archived_at);
  const scoped = (row: FixtureRow) => !args.p_property_id || row.property_id === args.p_property_id;
  const today = args.p_today!;
  const month = args.p_month!;
  const date = (value: string, days: number) => new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const monthDate = (offset: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 10);
  const properties = rows("properties").filter(p => p.status !== "inactive" && (!args.p_property_id || p.id === args.p_property_id));
  const propertyIds = new Set(properties.map(p => p.id));
  const units = rows("units").filter(u => u.status !== "inactive" && propertyIds.has(u.property_id));
  const leases = rows("current_leases").filter(l => scoped(l) && ["active", "notice_given"].includes(l.status));
  const operational = leases.filter(l => {
    const p = properties.find(p => p.id === l.property_id);
    return p?.rental_structure === "single_space" ? l.unit_id === null : p?.rental_structure === "multi_unit" && units.some(u => u.id === l.unit_id && u.property_id === p.id);
  });
  const leased = new Set(operational.map(l => l.unit_id));
  const people = rows("people");
  const peopleIds = new Set(people.map(p => p.id));
  const roles = rows("person_roles").filter(r => r.status === "active" && peopleIds.has(r.person_id));
  const ownerProperties = new Set(rows("property_owners").filter(o => o.is_primary && !o.ended_on).map(o => o.property_id));
  const tasks = rows("tasks").filter(t => scoped(t) && ["pending", "scheduled", "in_progress", "blocked", "ready_for_review"].includes(t.status));
  const ledger = rows("ledger_entries").filter(l => scoped(l) && l.transaction_date >= (args.p_financial_start_date ?? "0001-01-01"));
  const ledgerStart = [monthDate(-5), args.p_financial_start_date ?? ""].sort().at(-1)!;
  const buckets = new Map<string, OverviewSummary["ledger"][number]>();
  for (const l of ledger.filter(l => l.transaction_date >= ledgerStart && l.transaction_date < monthDate(1))) {
    const key = [l.transaction_date.slice(0, 7), l.direction, l.currency ?? "USD"].join(":");
    const bucket = buckets.get(key) ?? { transaction_date: `${l.transaction_date.slice(0, 7)}-01`, direction: l.direction, currency: l.currency ?? "USD", amount: 0 };
    bucket.amount = (Math.round(bucket.amount * 100) + Math.round(l.amount * 100)) / 100;
    buckets.set(key, bucket);
  }
  const terms = rows("lease_terms").filter(t => t.authority_kind === "authoritative" && ["active", "expired", "terminated", "upcoming"].includes(t.status) && t.start_date <= today && t.end_date >= today);
  const monthly = operational.flatMap(l => { const resolved = terms.filter(t => t.lease_id === l.id); return resolved.length === 1 && resolved[0].payment_frequency === "monthly" ? resolved : []; });
  const endingMonths = new Map<string, number>();
  for (const l of operational) { const key = l.lease_end_date.slice(0, 7); endingMonths.set(key, (endingMonths.get(key) ?? 0) + 1); }
  const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  return {
    counts: {
      activeLeaseCount: operational.length, currentLeaseCount: leases.length, invalidScopeLeases: leases.length - operational.length,
      largeRecentExpenseCount: ledger.filter(l => l.direction === "expense" && l.amount >= 1000 && l.transaction_date >= date(today, -30) && l.transaction_date <= today).length,
      leaseGapUnits: units.filter(u => !leased.has(u.id)).length,
      leasesEndingSoon: operational.filter(l => l.lease_end_date >= today && l.lease_end_date <= date(today, 60)).length,
      missingTenantLeases: operational.filter(l => !l.primary_tenant_person_id).length,
      missingOwnerLinks: properties.filter(p => !ownerProperties.has(p.id)).length,
      openMaintenanceCount: tasks.length,
      peopleMissingContacts: people.filter(p => !hasText(p.primary_email) && !hasText(p.primary_phone) && !rows("person_contacts").some(c => c.person_id === p.id && (hasText(c.email) || hasText(c.phone)))).length,
      peopleWithoutRoles: people.filter(p => !roles.some(r => r.person_id === p.id)).length,
      vacantUnits: units.filter(u => !leased.has(u.id) && u.status === "vacant").length, peopleCount: people.length,
      tenantCount: roles.filter(r => r.role === "tenant").length, ledgerEntryCount: ledger.length,
      occupiedUnits: units.filter(u => leased.has(u.id)).length, unitCount: units.length,
    },
    expectedRent: { leaseCount: monthly.length, amount: monthly.reduce((sum, t) => sum + t.rent_amount, 0) },
    ledger: [...buckets.values()],
    leaseEndings: [...endingMonths].map(([month, count]) => ({ month, count })),
    properties: properties.map(p => {
      const pu = units.filter(u => u.property_id === p.id);
      const pt = tasks.filter(t => t.property_id === p.id);
      const rank: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
      pt.sort((a, b) => (rank[b.priority] ?? 2) - (rank[a.priority] ?? 2) || (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
      return { id: p.id, code: p.code, name: p.name,
        documentCount: rows("documents").filter(d => d.property_id === p.id).length,
        missingTenantLinks: operational.filter(l => l.property_id === p.id && !l.primary_tenant_person_id).length,
        ownerLinked: ownerProperties.has(p.id), totalUnits: pu.length,
        occupiedUnits: pu.filter(u => leased.has(u.id)).length,
        unoccupiedUnits: pu.filter(u => !leased.has(u.id)).length,
        vacantUnits: pu.filter(u => !leased.has(u.id) && u.status === "vacant").length,
        blockedCount: pt.filter(t => t.status === "blocked").length, openCount: pt.length,
        overdueCount: pt.filter(t => t.due_date && t.due_date < today).length,
        urgentCount: pt.filter(t => ["urgent", "high"].includes(t.priority)).length,
        cases: pt.slice(0, 6).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.due_date })),
      };
    }),
  };
}
