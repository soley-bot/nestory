import type { LedgerEntry } from "@/features/ledger/ledger.types";

type LedgerFilterOptions = {
  archiveState?: "active" | "archived" | "all";
  direction: string;
  propertyId: string;
  query: string;
};

export function filterLedgerEntries(
  entries: LedgerEntry[],
  { archiveState = "active", direction, propertyId, query }: LedgerFilterOptions,
) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return entries.filter((entry) => {
    const matchesDirection =
      direction === "all" || entry.direction === direction;
    const matchesProperty =
      propertyId === "all" || entry.propertyId === propertyId;
    const matchesArchiveState =
      archiveState === "all" ||
      (archiveState === "archived"
        ? Boolean(entry.archivedAt)
        : !entry.archivedAt);
    const haystack = [
      entry.category,
      entry.description,
      entry.direction,
      entry.propertyCode,
      entry.propertyName,
      entry.relatedTimelineEvent?.title ?? "",
      entry.unitNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return matchesArchiveState && matchesDirection && matchesProperty && matchesQuery;
  });
}
