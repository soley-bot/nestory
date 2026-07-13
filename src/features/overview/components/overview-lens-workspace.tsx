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

type OperatingLens = Exclude<OverviewLens, "all" | "finance">;

type QueueItem = {
  detail: string;
  href: string;
  label: string;
  value: string;
};

export function OverviewLensWorkspace({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const lens = query.lens as OperatingLens;
  const config = getLensConfig(data, lens);

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
          <div className="divide-y divide-border">
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

function getLensConfig(data: OverviewScreenData, lens: OperatingLens) {
  const maintenanceItems = matchingAttention(data.attentionItems, /maintenance|repair|bill|expense/i);
  const recordsItems = matchingAttention(data.attentionItems, /record|missing|owner|document|statement/i);
  const statementBlockers = data.propertyPerformance.summary.statementReadiness.blockedCount;
  const vacant = data.occupancyByProperty.reduce((sum, row) => sum + row.unoccupiedUnits, 0);
  const expiring = data.leaseEndings.reduce((sum, row) => sum + row.count, 0);

  if (lens === "leasing") return {
    actionHref: "/leases?status=current&sort=end_asc", actionLabel: "Open leasing work", attentionCount: vacant + expiring,
    metrics: [
      { href: "/units?occupancy=unoccupied", label: "Vacancy and lease gaps", value: String(vacant) },
      { href: "/leases?status=current&endsWithin=60d&sort=end_asc", label: "Lease expiries", value: String(expiring) },
      { href: "/leases?status=current", label: "Active leases", value: String(data.workspaceSetup.activeLeaseCount) },
      { href: "/properties", label: "Properties ranked", value: String(data.occupancyByProperty.length) },
    ],
    queue: data.occupancyByProperty.map((row) => ({ detail: `${row.occupiedUnits}/${row.totalUnits} occupied`, href: row.href, label: row.label, value: `${row.percent}%` })),
    readiness: vacant > 0 ? `${vacant} units need occupancy or lease follow-up.` : "No vacancy or lease gaps are visible in current data.", title: "Leasing",
  };

  if (lens === "maintenance") return {
    actionHref: "/maintenance?review=open", actionLabel: "Open maintenance work", attentionCount: countItems(maintenanceItems),
    metrics: [
      { href: "/maintenance?review=open", label: "Open work", value: String(countItems(maintenanceItems)) },
      { href: "/bills-expenses?status=paid", label: "Paid maintenance cost", value: "Unavailable" },
      { href: "/bills-expenses?status=open", label: "Unpaid bills", value: String(countMatching(maintenanceItems, /bill/i)) },
      { href: "/maintenance", label: "Properties with work", value: "Open module" },
    ],
    queue: attentionQueue(maintenanceItems, { detail: "No open work is visible in Overview data.", href: "/maintenance?review=open", label: "Open work", value: "0" }),
    readiness: "Maintenance cost is not separated from other paid property expenses in Overview data; open the real expense module for exact records.", title: "Maintenance",
  };

  return {
    actionHref: "/reports/owner-statement", actionLabel: "Open reporting work", attentionCount: countItems(recordsItems) + statementBlockers,
    metrics: [
      { href: "/overview?lens=records&review=statement-blocked", label: "Statement blockers", value: String(statementBlockers) },
      { href: "/properties?ownerStatus=missing", label: "Missing record links", value: String(countItems(recordsItems)) },
      { href: "/reports", label: "Statements ready", value: String(data.propertyPerformance.summary.statementReadiness.readyCount) },
      { href: "/people?status=missing_contact", label: "Owner and contact review", value: "Open queue" },
    ],
    queue: [
      { detail: "Properties not ready for owner reporting", href: "/overview?lens=records&review=statement-blocked", label: "Statement blockers", value: String(statementBlockers) },
      { detail: "Open the property owner-link review", href: "/properties?ownerStatus=missing", label: "Missing record links", value: String(countItems(recordsItems)) },
    ],
    readiness: statementBlockers > 0 ? `${statementBlockers} properties need reporting review.` : "Visible properties pass current statement readiness checks.", title: "Records",
  };
}

function matchingAttention(items: OverviewAttentionItem[], pattern: RegExp) { return items.filter((item) => pattern.test(`${item.label} ${item.helper}`)); }
function countItems(items: OverviewAttentionItem[]) { return items.reduce((sum, item) => sum + item.count, 0); }
function countMatching(items: OverviewAttentionItem[], pattern: RegExp) { return countItems(matchingAttention(items, pattern)); }
function attentionQueue(items: OverviewAttentionItem[], fallback: QueueItem): QueueItem[] {
  return items.length ? items.map((item) => ({ detail: item.helper, href: item.href, label: item.label, value: String(item.count) })) : [fallback];
}
