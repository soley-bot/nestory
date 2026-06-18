import type { ReactNode } from "react";
import { BadgeDollarSign, Building2, Hammer, Percent } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import type { TimelineSnapshot } from "@/features/timeline/timeline.types";

export function PropertyPerformanceSnapshot({
  snapshot,
}: {
  snapshot: TimelineSnapshot;
}) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">Portfolio snapshot</h2>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
        <SnapshotItem
          helper="Selected context"
          icon={<BadgeDollarSign size={16} />}
          label="Net income"
          value={<MoneyDisplay value={snapshot.netIncome} />}
        />
        <SnapshotItem
          helper="Across active units"
          icon={<Percent size={16} />}
          label="Occupancy"
          value={snapshot.occupancy}
        />
        <SnapshotItem
          helper="Last 12 months"
          icon={<Hammer size={16} />}
          label="Maintenance"
          value={<MoneyDisplay value={snapshot.maintenance} />}
        />
        <SnapshotItem
          helper="Active records"
          icon={<Building2 size={16} />}
          label="Properties"
          value={snapshot.propertyCount}
        />
      </div>
    </section>
  );
}

function SnapshotItem({
  helper,
  icon,
  label,
  value,
}: {
  helper: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface px-3 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0] text-muted">
          {label}
        </p>
        <span className="shrink-0 text-muted">{icon}</span>
      </div>
      <div className="mt-2 min-w-0 text-sm font-semibold">{value}</div>
      <p className="mt-1 min-w-0 break-words text-xs text-muted">{helper}</p>
    </div>
  );
}
