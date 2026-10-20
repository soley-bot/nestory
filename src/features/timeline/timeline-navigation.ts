import type { TimelineEventType, TimelineScope } from "@/features/timeline/timeline.types";
import { buildHref } from "@/lib/url/href";

const TIMELINE_PATHS: Record<TimelineScope, string> = {
  global: "/timeline",
  property: "/property-timeline",
  maintenance: "/maintenance-timeline",
  financial: "/financial-timeline",
};

export const MAINTENANCE_TIMELINE_EVENT_TYPES = [
  "Maintenance",
  "Repair",
  "Renovation",
  "Inspection",
] as const satisfies readonly TimelineEventType[];

export function timelineScopeIncludesEvent(
  scope: TimelineScope,
  event: { event_type?: string; cost_amount?: number | null; ledger_entry_id?: string | null },
) {
  if (scope === "maintenance") {
    return MAINTENANCE_TIMELINE_EVENT_TYPES.some((type) => type === event.event_type);
  }
  if (scope === "financial") {
    return event.cost_amount != null || event.ledger_entry_id != null;
  }
  return true;
}

export function buildTimelineEventHref(
  scope: TimelineScope,
  eventId: string,
  query?: string,
) {
  return buildHref(TIMELINE_PATHS[scope], {
    archiveState: "all",
    eventId,
    query,
  });
}
