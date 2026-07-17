import Link from "next/link";
import { LeasingPropertyPreviewList } from "@/features/overview/components/leasing-property-preview-list";
import { MaintenancePropertyPreviewList } from "@/features/overview/components/maintenance-property-preview-list";
import { RecordsPropertyPreviewList } from "@/features/overview/components/records-property-preview-list";
import type {
  OverviewAttentionItem,
  OverviewLens,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { buildOverviewHref } from "@/features/overview/overview.filters";

type OperatingLens = Exclude<OverviewLens, "all" | "finance">;

export function OverviewLensWorkspace({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const lens = query.lens as OperatingLens;
  const config = getLensConfig(data, query, lens);

  return (
    <div className="min-w-0 space-y-3">
      <section aria-label={`${config.title} metrics`} className="grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {config.metrics.map((metric) => (
          <Link className="border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-muted sm:border-r xl:border-b-0" href={metric.href} key={metric.label}>
            <p className="text-xs text-foreground-muted">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{metric.value}</p>
          </Link>
        ))}
      </section>

      {lens === "leasing" ? (
        <LeasingPropertyPreviewList
          expiringLeaseCount={data.leaseRiskCount}
          month={query.month}
          rows={data.occupancyByProperty}
        />
      ) : lens === "maintenance" ? (
        <MaintenancePropertyPreviewList rows={data.maintenanceByProperty} />
      ) : (
        <RecordsPropertyPreviewList rows={data.recordsByProperty} />
      )}
    </div>
  );
}

function getLensConfig(data: OverviewScreenData, query: OverviewViewQuery, lens: OperatingLens) {
  const maintenanceItem = attentionByLabel(data.attentionItems, "Open maintenance");
  const missingOwners = attentionByLabel(data.attentionItems, "Properties without owner link");
  const missingLeaseLinks = attentionByLabel(data.attentionItems, "Leases missing tenant link");
  const statementBlockers = data.propertyPerformance.summary.statementReadiness.blockedCount;
  const vacant = data.occupancyByProperty.reduce((sum, row) => sum + row.unoccupiedUnits, 0);
  const expiring = data.leaseRiskCount;

  if (lens === "leasing") return {
    metrics: [
      { href: destinationHref("/units?occupancy=unoccupied", query, false), label: "Vacancy and lease gaps", value: String(vacant) },
      { href: destinationHref("/leases?status=current&endsWithin=60d&sort=end_asc", query, false), label: "Lease expiries", value: String(expiring) },
      { href: destinationHref("/leases?status=current", query, false), label: "Active leases", value: String(data.workspaceSetup.activeLeaseCount) },
      { href: buildOverviewHref(query, { lens: "leasing" }), label: "Properties ranked", value: String(data.occupancyByProperty.length) },
    ],
    title: "Leasing",
  };

  if (lens === "maintenance") return {
    metrics: [
      { href: destinationHref("/maintenance?review=open", query, true), label: "Open work", value: String(maintenanceItem?.count ?? 0) },
      { href: destinationHref("/maintenance?review=overdue", query, true), label: "Overdue", value: String(data.maintenanceByProperty.reduce((sum, row) => sum + row.overdueCount, 0)) },
      { href: destinationHref("/maintenance?review=high_priority", query, true), label: "High priority", value: String(data.maintenanceByProperty.reduce((sum, row) => sum + row.urgentCount, 0)) },
      { href: destinationHref("/maintenance?review=open", query, true), label: "Properties with work", value: String(data.maintenanceByProperty.length) },
    ],
    title: "Maintenance",
  };

  return {
    metrics: [
      { href: buildOverviewHref(query, { lens: "records", review: "statement-blocked" }), label: "Statement blockers", value: String(statementBlockers) },
      { href: destinationHref("/properties?ownerStatus=missing", query, false), label: "Missing owner links", value: missingOwners ? String(missingOwners.count) : "Not calculated" },
      { href: "/reports", label: "Statements ready", value: String(data.propertyPerformance.summary.statementReadiness.readyCount) },
      { href: destinationHref("/leases?status=current&tenantStatus=missing", query, false), label: "Missing lease links", value: missingLeaseLinks ? String(missingLeaseLinks.count) : "Not calculated" },
    ],
    title: "Records",
  };
}

function attentionByLabel(items: OverviewAttentionItem[], label: string) { return items.find((item) => item.label === label); }

function destinationHref(base: string, query: OverviewViewQuery, supportsMonth: boolean) {
  const [path, search = ""] = base.split("?");
  const params = new URLSearchParams(search);
  if (supportsMonth) params.set("month", query.month);
  if (query.propertyId !== "all") params.set("propertyId", query.propertyId);
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}
