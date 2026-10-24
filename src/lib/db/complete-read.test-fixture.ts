/** Synthetic PostgREST-style reader. It never connects to a database. */
export type CappedReadRow = Record<string, unknown>;
export type CappedRead = {
  table: string;
  select?: string;
  filters: { method: string; column: string; value: unknown }[];
  range?: [number, number];
  orders: { column: string; ascending: boolean; nullsFirst?: boolean }[];
  returnedRows?: number;
  count?: number | null;
};
type Result = { data: CappedReadRow[] | null; count: number | null; error: { message: string } | null };
type ColumnValue = string | number | boolean | null | undefined;

export function createCappedReadHarness(
  tables: Record<string, CappedReadRow[]>,
  options: {
    apiRowCap?: number;
    transformResult?: (read: CappedRead, result: Result) => Result;
  } = {},
) {
  const reads: CappedRead[] = [];
  const client = {
    storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ signedUrl: `https://synthetic.invalid/${path}` })), error: null }) }) },
    from(table: string) {
      const read: CappedRead = { table, filters: [], orders: [] };
      const predicates: ((row: CappedReadRow) => boolean)[] = [];
      let exactCount = false;
      let head = false;
      let limit: number | undefined;
      const filter = (method: string, column: string, value: unknown, predicate: (value: ColumnValue) => boolean) => {
        read.filters.push({ method, column, value });
        const getValue = columnAccessor(column);
        predicates.push(row => predicate(getValue(row)));
        return query;
      };
      const result = (): Result => {
        let data = (tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row)));
        const count = exactCount ? data.length : null;
        if (read.select?.includes("property:properties!")) {
          data = data.map(row => ({ ...row, property: (tables.properties ?? []).find(property => property.id === row.property_id) ?? null }));
        }
        const orders = read.orders.map(order => ({ ...order, getValue: columnAccessor(order.column) }));
        data = [...data].sort((a, b) => {
          for (const order of orders) {
            const left = order.getValue(a);
            const right = order.getValue(b);
            if (left === right) continue;
            if (left == null) return order.nullsFirst ? -1 : 1;
            if (right == null) return order.nullsFirst ? 1 : -1;
            const comparison = left < right ? -1 : 1;
            return order.ascending ? comparison : -comparison;
          }
          return 0;
        });
        const from = read.range?.[0] ?? 0;
        const size = Math.min(options.apiRowCap ?? 1000, limit ?? Infinity, read.range ? read.range[1] - from + 1 : Infinity);
        data = head ? [] : data.slice(from, from + size);
        let response: Result = { data, count, error: null };
        response = options.transformResult?.(read, response) ?? response;
        read.returnedRows = response.data?.length ?? 0;
        read.count = response.count;
        reads.push(read);
        return response;
      };
      const query = {
        select(value: string, config?: { count?: string; head?: boolean }) { read.select = value; exactCount = config?.count === "exact"; head = config?.head ?? false; return query; },
        eq(column: string, value: unknown) { return filter("eq", column, value, actual => actual === value); },
        neq(column: string, value: unknown) { return filter("neq", column, value, actual => actual !== value); },
        is(column: string, value: unknown) { return filter("is", column, value, actual => (actual ?? null) === value); },
        in(column: string, values: unknown[]) { const accepted = new Set(values); return filter("in", column, values, actual => accepted.has(actual)); },
        not(column: string, operator: string, value: unknown) {
          const excluded = operator === "in" ? new Set(String(value).slice(1, -1).split(",")) : undefined;
          return filter("not", column, value, actual => excluded ? !excluded.has(String(actual)) : (actual ?? null) !== value);
        },
        gte(column: string, value: string | number) { return filter("gte", column, value, actual => (actual as string | number) >= value); },
        lte(column: string, value: string | number) { return filter("lte", column, value, actual => (actual as string | number) <= value); },
        gt(column: string, value: string | number) { return filter("gt", column, value, actual => (actual as string | number) > value); },
        lt(column: string, value: string | number) { return filter("lt", column, value, actual => (actual as string | number) < value); },
        order(column: string, config: { ascending?: boolean; nullsFirst?: boolean } = {}) { read.orders.push({ column, ascending: config.ascending ?? true, nullsFirst: config.nullsFirst }); return query; },
        range(from: number, to: number) { read.range = [from, to]; return query; },
        limit(size: number) { limit = size; return query; },
        returns() { return query; },
        maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; },
        then<T = Result, U = never>(resolve?: ((value: Result) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => U | PromiseLike<U>) | null) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return query;
    },
  };
  return { client, reads };
}

// Parse column paths once per filter/order, not on every row of every page.
// Only accessors are reused: each read still evaluates the current table data.
function columnAccessor(column: string): (row: CappedReadRow) => ColumnValue {
  const relation = /^(\w+)\((\w+)\)$/.exec(column);
  if (!relation) return row => row[column] as ColumnValue;
  const [, relationName, relationColumn] = relation;
  return row => (row[relationName] as CappedReadRow | undefined)?.[relationColumn] as ColumnValue;
}
