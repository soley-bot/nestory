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

  if (totalRows <= loadedRows) {
    return;
  }

  throw new Error(
    `${sourceName} has ${totalRows.toLocaleString()} rows, which exceeds the ${maxReportSourceRows.toLocaleString()} row report source limit. Narrow the report scope before exporting.`,
  );
}
