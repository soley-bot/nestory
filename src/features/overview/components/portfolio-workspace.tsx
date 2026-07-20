import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PropertyScorecard } from "@/features/overview/components/property-scorecard";
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
  const summary = data.propertyPerformance.summary;
  const readiness = summary.statementReadiness;
  const readinessParams = new URLSearchParams({ month: query.month });
  if (query.propertyId !== "all") {
    readinessParams.set("propertyId", query.propertyId);
  }
  return (
    <div className="space-y-2.5">
      <PropertyScorecard query={query} rows={data.propertyPerformance.rows} />
      <section className="flex flex-wrap items-center gap-2 border-y border-border px-1 py-2">
        <span className="text-xs font-semibold text-foreground">Statement readiness</span>
        <Badge tone={readiness.blockedPropertyCount > 0 ? "warning" : "success"}>
          {readiness.readyPropertyCount} ready {readiness.readyPropertyCount === 1 ? "property" : "properties"}
        </Badge>
        <span className="text-xs text-foreground-muted">
          {readiness.totalPropertyCount} total {readiness.totalPropertyCount === 1 ? "property" : "properties"}
        </span>
        <Link
          className="ml-auto inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground-muted hover:text-foreground"
          href={`/overview/readiness?${readinessParams.toString()}`}
        >
          Review readiness
          <ArrowRight aria-hidden="true" size={13} />
        </Link>
      </section>
    </div>
  );
}
