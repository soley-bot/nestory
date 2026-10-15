export type CompleteRowsResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Read complete supporting data using fresh, identically scoped query builders.
 * Callers must use deterministic ordering with a unique final tie-breaker.
 * Continue until an empty page: a server may cap responses below pageSize.
 * These range reads are not a transaction snapshot; use a database aggregate or
 * snapshot RPC when a calculation requires consistency across concurrent writes.
 */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<CompleteRowsResult<T>>,
  pageSize = 500,
): Promise<CompleteRowsResult<T>> {
  assertPositiveSize(pageSize, "Page");
  const rows: T[] = [];
  const seenIds = new Set<string>();
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    if (!Array.isArray(result.data)) {
      throw new Error("Complete read returned malformed rows");
    }
    if (result.data.length > pageSize) {
      throw new Error("Complete read exceeded its requested page size");
    }
    if (result.data.length === 0) return { data: rows, error: null };

    for (const row of result.data) {
      if (row && typeof row === "object" && "id" in row && typeof row.id === "string") {
        if (seenIds.has(row.id)) {
          throw new Error("Complete read repeated a row; ordering or data changed during pagination");
        }
        seenIds.add(row.id);
      }
      rows.push(row);
    }
    from += result.data.length;
  }
}

/** Keep related-ID filters bounded without losing rows within an ID batch. */
export async function readAllRowsByIds<T>(
  ids: readonly string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<CompleteRowsResult<T>>,
  batchSize = 100,
  pageSize = 500,
): Promise<CompleteRowsResult<T>> {
  assertPositiveSize(batchSize, "ID batch");
  assertPositiveSize(pageSize, "Page");
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  for (let start = 0; start < uniqueIds.length; start += batchSize) {
    const batch = uniqueIds.slice(start, start + batchSize);
    const result = await readAllRows((from, to) => fetchPage(batch, from, to), pageSize);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}

function assertPositiveSize(size: number, label: string) {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error(`${label} size must be a positive integer`);
  }
}
