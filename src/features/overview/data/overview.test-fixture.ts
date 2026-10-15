import { vi } from "vitest";
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
  const client = {
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
  return { client, requests };
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
