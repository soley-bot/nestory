import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <div className="space-y-3">
      <section
        aria-label="Portfolio counts"
        className="grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-4"
      >
        <Count label="Properties" value={data.workspaceSetup.propertyCount} />
        <Count label="Units" value={data.workspaceSetup.unitCount} />
        <Count label="Active leases" value={data.workspaceSetup.activeLeaseCount} />
        <Count label="Open checks" value={data.attentionTotal} />
      </section>

      <section className="overflow-hidden border-y border-border">
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
      </section>

      {data.attentionTotal > 0 ? (
        <Link
          className="flex items-center gap-2 border-y border-border px-3 py-3 text-sm hover:bg-surface-muted"
          href={`/overview/attention?month=${query.month}`}
        >
          <span className="mr-auto font-medium">Needs attention</span>
          <span className="tabular-nums text-foreground-muted">
            {data.attentionTotal} open checks
          </span>
          <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
