export const maxReportSourceRows = 5_000;
export const reportSourceRangeEnd = maxReportSourceRows - 1;
export const reportDocumentSelect =
  "id, property_id, unit_id, lease_id, ledger_entry_id, timeline_event_id, file_name";

export function assertCompleteReportSource(
  sourceName: string,
  result: { count: number | null; data: unknown[] | null },
) {
  const loadedRows = result.data?.length ?? 0;
  const totalRows = result.count ?? loadedRows;

  assertReportSourceWithinLimit(sourceName, totalRows);

  if (totalRows <= loadedRows) {
    return;
  }

  throwReportSourceLimitError(sourceName, totalRows);
}

export function assertReportSourceWithinLimit(
  sourceName: string,
  totalRows: number,
) {
  if (totalRows <= maxReportSourceRows) {
    return;
  }

  throwReportSourceLimitError(sourceName, totalRows);
}

function throwReportSourceLimitError(sourceName: string, totalRows: number): never {
  throw new Error(
    `${sourceName} has ${totalRows.toLocaleString()} rows, which exceeds the ${maxReportSourceRows.toLocaleString()} row report source limit. Narrow the report scope before exporting.`,
  );
}
