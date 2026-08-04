import { LeasingPropertyPreviewList } from "@/features/overview/components/leasing-property-preview-list";
import { MaintenancePropertyPreviewList } from "@/features/overview/components/maintenance-property-preview-list";
import { RecordsPropertyPreviewList } from "@/features/overview/components/records-property-preview-list";
import { OverviewSummary } from "@/features/overview/components/overview-summary";
import type {
  OverviewAttentionItem,
  OverviewLens,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { buildOverviewHref } from "@/features/overview/overview.filters";

type OperatingLens = Exclude<OverviewLens, "all">;

export function OverviewLensWorkspace({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const lens = query.lens as OperatingLens;
  const config = getLensConfig(data, query, lens);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        aria-label={`${config.title} operating work`}
        className="min-h-0 flex-1 overflow-y-auto [&>section]:border-y-0"
        data-slot="overview-operating-scroll"
      >
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
      </section>

      <OverviewSummary items={config.metrics} label={config.title} />
    </div>
  );
}

function getLensConfig(data: OverviewScreenData, query: OverviewViewQuery, lens: OperatingLens) {
  const maintenanceItem = attentionByLabel(data.attentionItems, "Open maintenance");
  const missingOwners = attentionByLabel(data.attentionItems, "Properties without owner link");
  const missingLeaseLinks = attentionByLabel(data.attentionItems, "Leases missing tenant link");
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
      { href: destinationHref("/reports/owner-activity", query, true), label: "Owner activity", value: String(data.recordsByProperty.length) },
      { href: destinationHref("/properties?ownerStatus=missing", query, false), label: "Missing owner links", value: missingOwners ? String(missingOwners.count) : "Not calculated" },
      { href: destinationHref("/documents", query, false), label: "Documents", value: String(data.recordsByProperty.reduce((sum, row) => sum + row.documentCount, 0)) },
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
