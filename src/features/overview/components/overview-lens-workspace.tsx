import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  OverviewLeaseEndingDonut,
  OverviewOccupancyBars,
} from "@/features/overview/components/overview-charts";
import type {
  OverviewAttentionItem,
  OverviewLens,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { buildOverviewHref } from "@/features/overview/components/overview-header";

type OperatingLens = Exclude<OverviewLens, "all" | "finance">;

type QueueItem = {
  detail: string;
  href: string;
  label: string;
  value: string;
};

export function OverviewLensWorkspace({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const lens = query.lens as OperatingLens;
  const config = getLensConfig(data, query, lens);

  return (
    <div className="space-y-3">
      <section aria-label={`${config.title} metrics`} className="grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {config.metrics.map((metric) => (
          <Link className="border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-muted sm:border-r xl:border-b-0" href={metric.href} key={metric.label}>
            <p className="text-xs text-foreground-muted">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{metric.value}</p>
          </Link>
        ))}
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{config.title} priorities</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">Ranked operating work from current portfolio data.</p>
          </div>
          <div className="hidden divide-y divide-border sm:block">
            {config.queue.map((item) => (
              <Link className="grid gap-1 px-3 py-3 hover:bg-surface-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" href={item.href} key={item.label}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">{item.detail}</p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground">{item.value}</span>
              </Link>
            ))}
          </div>
          <ul
            aria-label={`${config.title} priority cards`}
            className="divide-y divide-border sm:hidden"
          >
            {config.queue.map((item) => (
              <li key={item.label}>
                <Link className="block px-3 py-3" href={item.href}>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {item.detail}
                  </p>
                  <p className="mt-1 text-xs font-semibold tabular-nums">
                    {item.value}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="rounded-lg border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold text-foreground">Attention and readiness</h2>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={config.attentionCount > 0 ? "warning" : "success"}>{config.attentionCount} open</Badge>
            <span className="text-xs text-foreground-muted">current checks</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-foreground-muted">{config.readiness}</p>
          <Link className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline" href={config.actionHref}>{config.actionLabel}</Link>
        </aside>
      </div>

      <section className="rounded-lg border border-border bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Supporting evidence</h2>
        <div className="mt-3 h-56">
          {lens === "leasing" ? <OverviewLeaseEndingDonut points={data.leaseEndings} /> : <OverviewOccupancyBars points={data.occupancyByProperty} />}
        </div>
      </section>
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
    actionHref: destinationHref("/leases?status=current&sort=end_asc", query, false), actionLabel: "Open leasing work", attentionCount: vacant + expiring,
    metrics: [
      { href: destinationHref("/units?occupancy=unoccupied", query, false), label: "Vacancy and lease gaps", value: String(vacant) },
      { href: destinationHref("/leases?status=current&endsWithin=60d&sort=end_asc", query, false), label: "Lease expiries", value: String(expiring) },
      { href: destinationHref("/leases?status=current", query, false), label: "Active leases", value: String(data.workspaceSetup.activeLeaseCount) },
      { href: buildOverviewHref(query, { lens: "leasing" }), label: "Properties ranked", value: String(data.occupancyByProperty.length) },
    ],
    queue: data.occupancyByProperty.map((row) => ({ detail: `${row.occupiedUnits}/${row.totalUnits} occupied`, href: row.href, label: row.label, value: `${row.percent}%` })),
    readiness: vacant > 0 ? `${vacant} units need occupancy or lease follow-up.` : "No vacancy or lease gaps are visible in current data.", title: "Leasing",
  };

  if (lens === "maintenance") return {
    actionHref: destinationHref("/maintenance?review=open", query, true), actionLabel: "Open maintenance work", attentionCount: maintenanceItem?.count ?? 0,
    metrics: [
      { href: destinationHref("/maintenance?review=open", query, true), label: "Open work", value: String(maintenanceItem?.count ?? 0) },
      { href: destinationHref("/bills-expenses?expenseType=maintenance&status=paid&dateBasis=paid", query, true), label: "Paid maintenance cost", value: "Not calculated" },
      { href: destinationHref("/bills-expenses?expenseType=maintenance", query, true), label: "Maintenance expenses", value: "Open module" },
      { href: "/maintenance", label: "Properties with work", value: "Open module" },
    ],
    queue: maintenanceItem ? attentionQueue([maintenanceItem], { detail: "", href: "", label: "", value: "" }) : [{ detail: "No open work is visible in Overview data.", href: destinationHref("/maintenance?review=open", query, true), label: "Open work", value: "0" }],
    readiness: "Maintenance cost is not separated from other paid property expenses in Overview data; open the real expense module for exact records.", title: "Maintenance",
  };

  return {
    actionHref: destinationHref("/reports/owner-statement", query, true), actionLabel: "Open reporting work", attentionCount: (missingOwners?.count ?? 0) + (missingLeaseLinks?.count ?? 0),
    metrics: [
      { href: buildOverviewHref(query, { lens: "records", review: "statement-blocked" }), label: "Statement blockers", value: String(statementBlockers) },
      { href: destinationHref("/properties?ownerStatus=missing", query, false), label: "Missing owner links", value: missingOwners ? String(missingOwners.count) : "Not calculated" },
      { href: "/reports", label: "Statements ready", value: String(data.propertyPerformance.summary.statementReadiness.readyCount) },
      { href: destinationHref("/leases?status=current&tenantStatus=missing", query, false), label: "Missing lease links", value: missingLeaseLinks ? String(missingLeaseLinks.count) : "Not calculated" },
    ],
    queue: [
      { detail: "Properties not ready for owner reporting", href: buildOverviewHref(query, { lens: "records", review: "statement-blocked" }), label: "Statement blockers", value: String(statementBlockers) },
      { detail: "Open the property owner-link review", href: destinationHref("/properties?ownerStatus=missing", query, false), label: "Missing owner links", value: missingOwners ? String(missingOwners.count) : "Not calculated" },
      { detail: "Leases without a linked tenant record", href: destinationHref("/leases?status=current&tenantStatus=missing", query, false), label: "Missing lease links", value: missingLeaseLinks ? String(missingLeaseLinks.count) : "Not calculated" },
    ],
    readiness: statementBlockers > 0 ? `${statementBlockers} properties need reporting review.` : "Visible properties pass current statement readiness checks.", title: "Records",
  };
}

function attentionByLabel(items: OverviewAttentionItem[], label: string) { return items.find((item) => item.label === label); }
function attentionQueue(items: OverviewAttentionItem[], fallback: QueueItem): QueueItem[] {
  return items.length ? items.map((item) => ({ detail: item.helper, href: item.href, label: item.label, value: String(item.count) })) : [fallback];
}

function destinationHref(base: string, query: OverviewViewQuery, supportsMonth: boolean) {
  const [path, search = ""] = base.split("?");
  const params = new URLSearchParams(search);
  if (supportsMonth) params.set("month", query.month);
  if (query.propertyId !== "all") params.set("propertyId", query.propertyId);
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}
