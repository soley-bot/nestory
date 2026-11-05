import { vi } from "vitest";
import type { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database";

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
type LedgerSummaryArgs = Database["public"]["Functions"]["get_overview_ledger_summary"]["Args"];
type LedgerSummaryFixtureResult = { data: unknown; error: { message: string } | null };

// This deliberately implements filters, ordering, projections and server caps.
// It measures request/row counts, not database latency, SQL plans or RLS.
export function createOverviewFixture(
  tables: Record<string, OverviewFixtureResult> = {},
  serverCap = 1_000,
  ledgerSummaryResult?: LedgerSummaryFixtureResult,
) {
  const requests: OverviewFixtureRequest[] = [];
  const rpcRequests: Array<{ args: LedgerSummaryArgs; name: string; returnedMonths: number }> = [];
  const client = {
    rpc: vi.fn(async (name: string, args: LedgerSummaryArgs) => {
      if (name !== "get_overview_ledger_summary") throw new Error(`Unsupported fixture RPC: ${name}`);
      const request = { args, name, returnedMonths: 0 };
      rpcRequests.push(request);
      if (ledgerSummaryResult) return ledgerSummaryResult;
      // This models the public response shape; database tests separately verify
      // the SQL aggregation and RLS rather than treating this mock as evidence.
      const rows = (tables.ledger_entries?.data ?? []).map((value) => ({
        organization_id: fixtureOrganizationId, archived_at: null, currency: "USD", ...(value as Row),
      })).filter((row) => row.organization_id === args.p_organization_id
        && row.archived_at === null
        && (!args.p_property_id || (row as Row).property_id === args.p_property_id)
        && String((row as Row).transaction_date) >= (args.p_financial_start_date ?? "0001-01-01"));
      const months = new Map<string, { amount: number; currency: unknown; direction: unknown; transaction_date: string }>();
      for (const row of rows as Row[]) {
        if (String(row.transaction_date) < args.p_window_from || String(row.transaction_date) >= args.p_window_before) continue;
        const transaction_date = `${String(row.transaction_date).slice(0, 7)}-01`;
        const key = `${transaction_date}:${row.currency}:${row.direction}`;
        const month = months.get(key) ?? { amount: 0, currency: row.currency, direction: row.direction, transaction_date };
        month.amount += Math.round(Number(row.amount) * 100);
        months.set(key, month);
      }
      request.returnedMonths = months.size;
      return { error: null, data: {
        ledger_entry_count: rows.length,
        large_recent_expense_count: rows.filter((row) => {
          const entry = row as Row;
          return entry.direction === "expense" && Number(entry.amount) >= args.p_large_expense_threshold
            && String(entry.transaction_date) >= args.p_recent_expense_from
            && String(entry.transaction_date) < args.p_recent_expense_before;
        }).length,
        months: Array.from(months.values(), (month) => ({ ...month, amount: month.amount / 100 })),
      } };
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
