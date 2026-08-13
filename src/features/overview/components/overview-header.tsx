"use client";

import Link from "next/link";
import { WorkspaceHeaderPortal } from "@/components/layout/workspace-header-portal";
import { OverviewMonthPicker } from "@/features/overview/components/overview-month-picker";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import type { OverviewLens, OverviewViewQuery } from "@/features/overview/overview.types";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

const lenses: Array<{ label: string; value: OverviewLens }> = [
  { label: "Portfolio", value: "all" },
  { label: "Leasing", value: "leasing" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Records", value: "records" },
];

export function OverviewHeader({
  primaryAction,
  query,
}: {
  primaryAction?: OverviewAttentionItem;
  query: OverviewViewQuery;
}) {
  return (
    <WorkspaceHeaderPortal>
      <OverviewHeaderContent primaryAction={primaryAction} query={query} />
    </WorkspaceHeaderPortal>
  );
}

export function OverviewHeaderContent({
  primaryAction,
  query,
}: {
  primaryAction?: OverviewAttentionItem;
  query: OverviewViewQuery;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4" data-slot="overview-header-row">
        <h1 className="shrink-0 text-base font-medium">Overview</h1>
        <nav aria-label="Overview lenses" className="hidden min-w-0 items-center gap-1 md:flex">
          {lenses.map((lens) => {
            const active = lens.value === query.lens;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                href={buildOverviewHref(query, { lens: lens.value })}
                key={lens.value}
              >
                {lens.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {primaryAction ? (
            <Link
              className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              href={primaryAction.href}
            >
              {primaryAction.actionLabel}
            </Link>
          ) : null}
          <OverviewMonthPicker query={query} />
        </div>
    </div>
  );
}
