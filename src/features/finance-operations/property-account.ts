import type { PropertyAccountEntry } from "@/features/finance-operations/finance-operations.types";

export function sortPropertyAccountEntriesNewestFirst(
  entries: readonly PropertyAccountEntry[],
) {
  return [...entries].sort(
    (left, right) =>
      compareDescending(left.date, right.date) ||
      compareDescending(left.createdAt, right.createdAt) ||
      compareDescending(left.sourceType, right.sourceType) ||
      compareDescending(left.id, right.id),
  );
}

function compareDescending(left: string, right: string) {
  return right.localeCompare(left);
}
