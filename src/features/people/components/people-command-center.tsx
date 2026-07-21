"use client";

import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, FileCheck2, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PeopleInsights } from "@/features/people/people.insights";

type PeopleCommandCenterProps = {
  insights: PeopleInsights;
};

export function PeopleCommandCenter({ insights }: PeopleCommandCenterProps) {
  if (insights.totalCount === 0) {
    return null;
  }

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
  const attentionCount = insights.attentionQueues.reduce(
    (total, queue) => total + queue.count,
    0,
  );

  return (
    <section
      aria-label="People summary"
      className="shrink-0 border-b border-border bg-surface px-4 py-1.5 sm:px-6"
      role="region"
    >
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-label={`Directory overview: ${insights.totalCount} people, ${
              attentionCount > 0 ? `${attentionCount} issues to review` : "all clear"
            }`}
            className="flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
            type="button"
          >
            <UsersRound aria-hidden="true" className="size-4 shrink-0 text-muted" />
            <span className="font-semibold text-foreground">Directory overview</span>
            <span className="truncate text-muted">
              {insights.totalCount} people
              {attentionCount > 0 ? ` · ${attentionCount} to review` : " · All clear"}
            </span>
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            aria-label="People overview"
            className="z-50 w-[min(440px,calc(100vw-2rem))] rounded-md border border-border bg-surface p-3 shadow-lg outline-none"
            role="dialog"
            sideOffset={6}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">Directory overview</p>
                <p className="mt-0.5 text-xs text-muted">Counts and records that need attention.</p>
              </div>
              <Link
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href="/people-reports"
                prefetch={false}
              >
                <FileCheck2 aria-hidden="true" size={14} />
                Reports
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
              {metrics.map((metric) => (
                <Link
                  className="min-w-0 bg-surface px-3 py-2.5 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                  href={metric.href}
                  key={metric.label}
                  prefetch={false}
                >
                  <p className="truncate text-[11px] font-medium text-muted">{metric.label}</p>
                  <p className="mt-0.5 truncate text-base font-semibold tabular-nums text-foreground">{metric.value}</p>
                </Link>
              ))}
            </div>

            <div className="mt-3 space-y-1">
              <p className="px-1 text-[11px] font-semibold uppercase text-muted">Needs attention</p>
              {insights.attentionQueues.map((queue) => (
                <Link
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 text-xs outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                  href={queue.href}
                  key={queue.id}
                  prefetch={false}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{queue.label}</span>
                    <span className="block truncate text-muted">{queue.description}</span>
                  </span>
                  <Badge className="shrink-0 px-1.5 text-[10px]" tone={queue.tone}>
                    {queue.count}
                  </Badge>
                </Link>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </section>
  );
}
