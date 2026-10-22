import { readCompleteRows } from "@/lib/db/complete-read";

// These are application work/memory bounds, independent of PostgREST max_rows.
export const maxReportSourceRows = 100_000;
export const maxReportDocumentRows = 5_000;
export const reportSourcePageSize = 500;
export const reportSourceBatchSize = 100;
export const reportDocumentSelect =
  "id, property_id, unit_id, lease_id, ledger_entry_id, timeline_event_id, file_name";

export type ReportSourcePage<T> = PromiseLike<{
  count: number | null;
  data: T[] | null;
  error: { message: string } | null;
}>;

/** Complete live reads, not a database snapshot. Stable counts and identities
 * detect truncation and some concurrent changes, not same-count edits. */
export function readReportSource<T>(
  sourceName: string,
  readPage: (from: number, to: number) => ReportSourcePage<T>,
  getRowId: (row: T) => string,
  compareRows?: (previous: T, current: T) => number,
) {
  return readCompleteRows({
    context: sourceName, readPage, getRowId, compareRows,
    pageSize: reportSourcePageSize, maxRows: maxReportSourceRows,
  });
}

export function readReportSourceById<T extends { id: string }>(
  sourceName: string,
  readPage: (from: number, to: number) => ReportSourcePage<T>,
) {
  return readReportSource(sourceName, readPage, row => row.id,
    (previous, current) => compareReportKeys(previous.id, current.id));
}

export function compareReportKeys(previous: string, current: string) {
  return previous < current ? -1 : previous > current ? 1 : 0;
}

/** Keep ID filters bounded as well as response pages. Batches must be disjoint. */
export async function readReportSourceBatches<T>(
  sourceName: string,
  ids: Iterable<string>,
  readBatch: (ids: string[]) => Promise<T[]>,
  getRowId: (row: T) => string,
) {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < uniqueIds.length; offset += reportSourceBatchSize) {
    const batch = await readBatch(uniqueIds.slice(offset, offset + reportSourceBatchSize));
    assertReportSourceWithinLimit(sourceName, rows.length + batch.length);
    for (const row of batch) {
      const id = getRowId(row);
      if (!id || seen.has(id)) throw new Error(`${sourceName}: duplicate or missing source identity.`);
      seen.add(id);
      rows.push(row);
    }
  }
  return rows;
}

export function assertCompleteReportSource(
  sourceName: string,
  result: { count: number | null; data: unknown[] | null },
  maxRows = maxReportSourceRows,
) {
  if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 || !Array.isArray(result.data)) {
    throw new Error(`${sourceName}: complete source count or data is unavailable.`);
  }
  assertReportSourceWithinLimit(sourceName, result.count, maxRows);
  if (result.count !== result.data.length) {
    throw new Error(`${sourceName}: source is incomplete or its count is inconsistent.`);
  }
}

export function assertReportSourceWithinLimit(
  sourceName: string,
  totalRows: number,
  maxRows = maxReportSourceRows,
) {
  if (!Number.isSafeInteger(totalRows) || totalRows < 0) throw new Error(`${sourceName}: invalid source count.`);
  if (totalRows > maxRows) {
    throw new Error(`${sourceName} has ${totalRows.toLocaleString()} rows, which exceeds the ${maxRows.toLocaleString()} row report source limit. Narrow the report scope before exporting.`);
  }
}
