export function getInitialRecordId<TRecord extends { id: string }>(
  records: TRecord[],
  initialId?: string,
) {
  return initialId || records[0]?.id || "";
}

export function getSelectedRecord<TRecord extends { id: string }>({
  focusedRecordId,
  records,
  selectedRecordId,
}: {
  focusedRecordId?: string;
  records: TRecord[];
  selectedRecordId: string;
}): TRecord | null {
  return (
    records.find((record) => record.id === selectedRecordId) ??
    (focusedRecordId ? null : records[0] ?? null)
  );
}
