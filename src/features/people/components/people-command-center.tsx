import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PeopleInsights } from "@/features/people/people.insights";

type PeopleCommandCenterProps = {
  insights: PeopleInsights;
};

export function PeopleCommandCenter({ insights }: PeopleCommandCenterProps) {
  const staff = insights.relationshipStats.find(
    (stat) => stat.label === "Staff readiness",
  );
  const metrics = [
    ...insights.metrics,
    ...(staff
      ? [
          {
            href: staff.href,
            label: "Staff",
            value: `${staff.readyCount}/${staff.count}`,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-label="People summary"
      className="shrink-0 border-b border-border bg-surface px-4 py-2 sm:px-6"
      role="region"
    >
      <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
        <div
          className="flex min-w-0 flex-1 overflow-x-auto rounded-md border border-border"
          data-mobile-summary-strip="people-metrics"
        >
          {metrics.map((metric) => (
            <Link
              className="min-w-[112px] flex-1 border-r border-border px-2.5 py-2 outline-none transition-colors last:border-r-0 hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
              href={metric.href}
              key={metric.label}
              prefetch={false}
            >
              <p className="truncate text-[11px] font-semibold uppercase text-muted">
                {metric.label}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">
                {metric.value}
              </p>
            </Link>
          ))}
        </div>

        <div
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto"
          data-mobile-summary-strip="people-attention"
        >
          {insights.attentionQueues.map((queue) => (
            <Link
              className="inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={queue.href}
              key={queue.id}
              prefetch={false}
            >
              <span className="truncate">{queue.label}</span>
              <Badge className="px-1.5 text-[10px]" tone={queue.tone}>
                {queue.count}
              </Badge>
            </Link>
          ))}
          <Link
            aria-label="People reports"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
            href="/people-reports"
            prefetch={false}
          >
            <FileCheck2 aria-hidden="true" size={14} />
            Reports
          </Link>
        </div>
      </div>
    </section>
  );
}
