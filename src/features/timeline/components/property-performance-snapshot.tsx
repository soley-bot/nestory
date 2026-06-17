import { BadgeDollarSign, Building2, Hammer, Percent } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { MetricTile } from "@/components/data/metric-tile";
import type { TimelineSnapshot } from "@/features/timeline/timeline.types";

export function PropertyPerformanceSnapshot({
  snapshot,
}: {
  snapshot: TimelineSnapshot;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        helper="Selected context"
        icon={<BadgeDollarSign size={16} />}
        label="Net income"
        value={<MoneyDisplay value={snapshot.netIncome} size="large" />}
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
        value={<MoneyDisplay value={snapshot.maintenance} size="large" />}
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
