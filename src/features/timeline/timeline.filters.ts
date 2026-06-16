import type { TimelineEvent } from "@/features/timeline/timeline.types";

export type TimelineFilterInput = {
  eventType: string;
  propertyId: string;
  query: string;
};

export function filterTimelineEvents(
  events: TimelineEvent[],
  filters: TimelineFilterInput,
) {
  const queryTokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return events.filter((event) => {
    const matchesEventType =
      filters.eventType === "all" || event.eventType === filters.eventType;
    const matchesProperty =
      filters.propertyId === "all" || event.propertyId === filters.propertyId;
    const searchable = [
      event.title,
      event.description,
      event.propertyName,
      event.propertyCode,
      event.unitNumber,
      event.relatedDocument,
      event.relatedLease,
      event.relatedLedgerEntry,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      matchesEventType &&
      matchesProperty &&
      (queryTokens.length === 0 ||
        queryTokens.every((token) => searchable.includes(token)))
    );
  });
}
