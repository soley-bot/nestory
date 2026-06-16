import { BadgeDollarSign, Building2, Hammer, Percent } from "lucide-react";
import { MetricTile } from "@/components/data/metric-tile";

export function PropertyPerformanceSnapshot() {
  return (
    <div className="grid grid-cols-4 gap-3">
      <MetricTile
        helper="Selected context"
        icon={<BadgeDollarSign size={16} />}
        label="Net income"
        value="$18,420"
      />
      <MetricTile
        helper="Across active units"
        icon={<Percent size={16} />}
        label="Occupancy"
        value="87%"
      />
      <MetricTile
        helper="Last 12 months"
        icon={<Hammer size={16} />}
        label="Maintenance"
        value="$3,280"
      />
      <MetricTile
        helper="Active records"
        icon={<Building2 size={16} />}
        label="Properties"
        value="4"
      />
    </div>
  );
}
