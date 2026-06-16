import { BadgeDollarSign, Building2, Hammer, Percent } from "lucide-react";
import { MetricTile } from "@/components/data/metric-tile";
import type { TimelineSnapshot } from "@/features/timeline/timeline.types";

export function PropertyPerformanceSnapshot({
  snapshot,
}: {
  snapshot: TimelineSnapshot;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <MetricTile
        helper="Selected context"
        icon={<BadgeDollarSign size={16} />}
        label="Net income"
        value={snapshot.netIncome}
      />
      <MetricTile
        helper="Across active units"
        icon={<Percent size={16} />}
        label="Occupancy"
        value={snapshot.occupancy}
      />
      <MetricTile
        helper="Last 12 months"
        icon={<Hammer size={16} />}
        label="Maintenance"
        value={snapshot.maintenance}
      />
      <MetricTile
        helper="Active records"
        icon={<Building2 size={16} />}
        label="Properties"
        value={snapshot.propertyCount}
      />
    </div>
  );
}
