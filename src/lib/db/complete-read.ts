type CompleteReadResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};

export const DEFAULT_COMPLETE_READ_MAX_ROWS = 100000;

/**
 * Read a complete, counted relation through the caller's scoped client.
 * Each callback must build a fresh query with count: "exact" and a stable
 * order ending in a unique key. Short responses can be a server row cap,
 * not the end of the relation. Never return a partial aggregate as complete.
 *
 * Counts and identities detect observable drift; separate HTTP requests do
 * not provide a database snapshot, including equal-count concurrent edits.
 */
export async function readCompleteRows<T>({
  readPage,
  getRowId,
  context,
  pageSize = 500,
  maxRows = DEFAULT_COMPLETE_READ_MAX_ROWS,
  compareRows,
}: {
  readPage: (from: number, to: number) => PromiseLike<CompleteReadResult<T>>;
  getRowId: (row: NoInfer<T>) => string;
  context: string;
  pageSize?: number;
  maxRows?: number;
  compareRows?: (previous: NoInfer<T>, current: NoInfer<T>) => number;
}): Promise<T[]> {
  const fail = (reason: string): never => { throw new Error(`${context}: ${reason}`); };
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) fail("Invalid page size.");
  if (maxRows !== undefined && (!Number.isSafeInteger(maxRows) || maxRows < 0)) fail("Invalid row limit.");

  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | undefined;
  while (true) {
    const from = rows.length;
    const to = expectedCount === undefined ? from + pageSize - 1 : Math.min(from + pageSize, expectedCount) - 1;
    let result: CompleteReadResult<T>;
    try {
      result = await readPage(from, to);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "The query failed.");
    }
    if (result.error) fail(result.error.message);
    const count = result.count;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      fail("An exact row count is required. Reload and try again.");
    }
    if (expectedCount !== undefined && count !== expectedCount) {
      fail("The row count changed while loading. Reload and try again.");
    }
    expectedCount = count as number;
    if (maxRows !== undefined && expectedCount > maxRows) fail(`The result exceeds the supported ${maxRows} rows. Narrow the selection.`);
    if (!Array.isArray(result.data)) fail("The query returned no row data.");
    const batch = result.data as T[];
    if (batch.length > to - from + 1 || from + batch.length > expectedCount) fail("The returned rows do not match the requested range and count.");
    for (const row of batch) {
      const id = getRowId(row);
      if (typeof id !== "string" || !id || ids.has(id)) fail("Missing or repeated row identity while loading. Reload and try again.");
      if (compareRows && rows.length > 0 && compareRows(rows[rows.length - 1], row) >= 0) fail("The row order changed while loading. Reload and try again.");
      ids.add(id);
      rows.push(row);
    }
    if (rows.length === expectedCount) return rows;
    if (batch.length === 0) fail("The result ended before all counted rows were read. Reload and try again.");
  }
}
