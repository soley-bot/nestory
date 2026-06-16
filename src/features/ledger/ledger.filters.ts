import type { LedgerEntry } from "@/features/ledger/ledger.types";

type LedgerFilterOptions = {
  direction: string;
  propertyId: string;
  query: string;
};

export function filterLedgerEntries(
  entries: LedgerEntry[],
  { direction, propertyId, query }: LedgerFilterOptions,
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
    const haystack = [
      entry.category,
      entry.description,
      entry.direction,
      entry.propertyCode,
      entry.propertyName,
      entry.unitNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return matchesDirection && matchesProperty && matchesQuery;
  });
}
