import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

export type OverviewDetailView = "attention" | "readiness";

export function OverviewDetailPage({
  data,
  query,
  view,
}: {
  data: OverviewScreenData;
  query: OverviewViewQuery;
  view: OverviewDetailView;
}) {
  const overviewHref = `/overview?month=${query.month}`;

  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5">
      <PageBreadcrumb
        current={view === "attention" ? "Needs attention" : "Statement readiness"}
        items={[{ href: overviewHref, label: "Overview" }]}
      />
      {view === "attention" ? (
        <AttentionWorkspace data={data} />
      ) : (
        <ReadinessWorkspace data={data} />
      )}
    </main>
  );
}

function AttentionWorkspace({ data }: { data: OverviewScreenData }) {
  return (
    <section className="mt-5">
      <header className="border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold text-foreground">Needs attention</h1>
          <Badge tone={data.attentionItems.length > 0 ? "warning" : "success"}>
            {data.attentionItems.length} queues
          </Badge>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          Open operating checks across leasing, maintenance, occupancy, and finance.
        </p>
      </header>
      {data.attentionItems.length > 0 ? (
        <ul className="divide-y divide-border">
          {data.attentionItems.map((item) => (
            <li key={item.id}>
              <Link
                className="group flex min-h-16 items-center gap-3 px-1 py-3 hover:bg-surface-muted"
                href={item.href}
              >
                <Badge tone={item.tone}>{item.count}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block truncate text-xs text-foreground-muted">{item.helper}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
                  {item.actionLabel}
                  <ArrowRight aria-hidden="true" size={13} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-sm text-foreground-muted">No operating checks need attention.</p>
      )}
    </section>
  );
}

function ReadinessWorkspace({ data }: { data: OverviewScreenData }) {
  const readiness = data.propertyPerformance.summary.statementReadiness;
  return (
    <section className="mt-5">
      <header className="border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold text-foreground">Statement readiness</h1>
          <Badge tone={readiness.blockedCount > 0 ? "warning" : "success"}>
            {readiness.readyCount} ready
          </Badge>
          <span className="text-xs text-foreground-muted">of {readiness.totalCount}</span>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          Review each property before preparing owner statements.
        </p>
      </header>
      <div className="divide-y divide-border">
        {data.propertyPerformance.rows.map((row) => (
          <Link
            className="flex min-h-14 items-center gap-3 px-1 py-3 hover:bg-surface-muted"
            href={row.href}
            key={row.propertyId}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{row.label}</span>
              <span className="block text-xs text-foreground-muted">
                {row.statementBlockers > 0
                  ? `${row.statementBlockers} statement blockers`
                  : "Ready for statement review"}
              </span>
            </span>
            <Badge tone={row.statementBlockers > 0 ? "warning" : "success"}>
              {row.statementBlockers > 0 ? "Review" : "Ready"}
            </Badge>
            <ArrowRight aria-hidden="true" className="text-foreground-muted" size={14} />
          </Link>
        ))}
      </div>
    </section>
  );
}
