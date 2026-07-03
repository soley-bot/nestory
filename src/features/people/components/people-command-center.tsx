import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  FileCheck2,
  Gauge,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getPeopleInsights,
  type PeopleInsightMetric,
  type PeopleRelationshipStat,
} from "@/features/people/people.insights";
import type { PeopleBadgeTone, PeopleSummary } from "@/features/people/people.types";
import { cn } from "@/lib/utils";

type PeopleCommandCenterProps = {
  people: PeopleSummary[];
  totalCount: number;
};

export function PeopleCommandCenter({
  people,
  totalCount,
}: PeopleCommandCenterProps) {
  const insights = getPeopleInsights(people, totalCount);

  return (
    <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6">
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Gauge className="text-muted" size={16} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Relationship command center</h2>
                <p className="truncate text-xs text-muted">
                  Tenant, owner, vendor, and staff readiness from active records.
                </p>
              </div>
            </div>
            <Link
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium hover:bg-surface-muted"
              href="/people-reports"
              prefetch={false}
            >
              <FileCheck2 size={14} />
              Reports
            </Link>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 2xl:grid-cols-4">
            {insights.metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <AlertTriangle className="text-muted" size={16} />
            <h2 className="text-sm font-semibold">Attention queues</h2>
            <Badge className="ml-auto px-2 text-xs" tone="neutral">
              {insights.visibleCount}/{insights.totalCount} loaded
            </Badge>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {insights.attentionQueues.map((queue) => (
              <Link
                className="group rounded-md border border-border bg-surface-muted/45 px-3 py-2 transition-colors hover:border-[#c9d0da] hover:bg-surface-muted"
                href={queue.href}
                key={queue.id}
                prefetch={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">
                      {queue.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                      {queue.description}
                    </p>
                  </div>
                  <Badge className="px-2 text-xs" tone={queue.tone}>
                    {queue.count}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-2 lg:grid-cols-4">
        {insights.relationshipStats.map((stat) => (
          <RelationshipCard key={stat.label} stat={stat} />
        ))}
      </section>
    </main>
  );
}

function MetricCard({ metric }: { metric: PeopleInsightMetric }) {
  return (
    <Link
      className="group min-w-0 rounded-md border border-border bg-surface-muted/45 px-3 py-2.5 transition-colors hover:border-[#c9d0da] hover:bg-surface-muted"
      href={metric.href}
      prefetch={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            {metric.label}
          </p>
          <p className="mt-1 text-lg font-semibold leading-none">{metric.value}</p>
          <p className="mt-1 truncate text-xs text-muted">{metric.helper}</p>
        </div>
        <ArrowUpRight
          className="mt-0.5 text-muted transition-colors group-hover:text-foreground"
          size={14}
        />
      </div>
    </Link>
  );
}

function RelationshipCard({ stat }: { stat: PeopleRelationshipStat }) {
  const progress =
    stat.count === 0 ? 0 : Math.round((stat.readyCount / stat.count) * 100);

  return (
    <Link
      className="min-w-0 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:border-[#c9d0da] hover:bg-surface-muted"
      href={stat.href}
      prefetch={false}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <UsersRound className="shrink-0 text-muted" size={15} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{stat.label}</p>
            <p className="truncate text-xs text-muted">{stat.helper}</p>
          </div>
        </div>
        <Badge className="px-2 text-xs" tone={stat.tone}>
          {stat.readyCount}/{stat.count}
        </Badge>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn("h-full rounded-full", getProgressClass(stat.tone))}
          style={{ width: `${progress}%` }}
        />
      </div>
    </Link>
  );
}

function getProgressClass(tone?: PeopleBadgeTone) {
  if (tone === "success") {
    return "bg-success";
  }

  if (tone === "danger") {
    return "bg-danger";
  }

  if (tone === "warning") {
    return "bg-warning";
  }

  return "bg-muted";
}
