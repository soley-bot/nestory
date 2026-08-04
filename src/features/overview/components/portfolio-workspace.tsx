import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OverviewSummary } from "@/features/overview/components/overview-summary";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

export function PortfolioWorkspace({
  data,
  query,
}: {
  data: OverviewScreenData;
  query: OverviewViewQuery;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        aria-label="Portfolio operating work"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-slot="overview-operating-scroll"
      >
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold">Properties</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Occupancy and current operating records.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
            href="/properties"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-3 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
          <span>Property</span>
          <span>Occupied</span>
          <span>Units</span>
        </div>
        <div>
          {data.occupancyByProperty.length > 0 ? (
            <div className="divide-y divide-border">
            {data.occupancyByProperty.map((property) => (
              <Link
                className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-3 px-3 py-3 text-sm hover:bg-surface-muted"
                href={property.href}
                key={property.href}
              >
                <span className="truncate font-medium">{property.label}</span>
                <span className="tabular-nums">{property.percent}%</span>
                <span className="tabular-nums">{property.totalUnits}</span>
              </Link>
            ))}
            </div>
          ) : (
            <p className="px-3 py-8 text-sm text-foreground-muted">
              No properties are available.
            </p>
          )}
        </div>
        {data.attentionTotal > 0 ? (
          <Link
            className="flex items-center gap-2 border-t border-warning/25 bg-warning-soft/10 px-3 py-3 text-sm hover:bg-warning-soft/20"
            href={`/overview/attention?month=${query.month}`}
          >
            <span className="mr-auto font-medium">Needs attention</span>
            <span className="tabular-nums text-foreground-muted">
              {data.attentionTotal} open checks
            </span>
            <ArrowRight size={14} />
          </Link>
        ) : null}
      </section>

      <OverviewSummary
        label="Portfolio"
        items={[
          { label: "Properties", value: data.workspaceSetup.propertyCount },
          { label: "Units", value: data.workspaceSetup.unitCount },
          { label: "Active leases", value: data.workspaceSetup.activeLeaseCount },
          { label: "Open checks", value: data.attentionTotal },
        ]}
      />
    </div>
  );
}
