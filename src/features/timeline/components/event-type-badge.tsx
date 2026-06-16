import { Badge } from "@/components/ui/badge";
import type { TimelineEventType } from "@/features/timeline/timeline.types";

const toneByType: Partial<
  Record<TimelineEventType, "accent" | "danger" | "neutral" | "success" | "warning">
> = {
  "Lease Started": "success",
  "Lease Ended": "warning",
  Maintenance: "warning",
  Repair: "danger",
  Renovation: "accent",
  Inspection: "neutral",
  "Rent Increase": "success",
  "Document Added": "neutral",
};

export function EventTypeBadge({ type }: { type: TimelineEventType }) {
  return <Badge tone={toneByType[type] ?? "neutral"}>{type}</Badge>;
}
