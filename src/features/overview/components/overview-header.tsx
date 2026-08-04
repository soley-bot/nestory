"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import { OverviewMonthPicker } from "@/features/overview/components/overview-month-picker";
import type {
  OverviewLens,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

const lenses: Array<{ label: string; value: OverviewLens }> = [
  { label: "Portfolio", value: "all" },
  { label: "Leasing", value: "leasing" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Records", value: "records" },
];

export function OverviewHeader({
  query,
}: {
  query: OverviewViewQuery;
}) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const activeLensLabel = lenses.find((lens) => lens.value === query.lens)?.label ?? "Portfolio";
  const breadcrumb = (
    <PageBreadcrumb
      current={activeLensLabel}
      items={[{ href: `/overview?month=${query.month}`, label: "Overview" }]}
    />
  );
  const target = mounted ? document.getElementById("workspace-page-tools") : null;

  return (
    <>
      {target ? createPortal(breadcrumb, target) : breadcrumb}
      <header className="min-w-0 px-1">
        <div
          className="flex min-w-0 flex-col gap-2 py-2 md:flex-row md:items-center"
          data-slot="overview-header-row"
        >
          <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">Overview</h1>
          <nav
            aria-label="Overview lenses"
            className="order-3 flex min-w-0 gap-4 overflow-x-auto md:order-none md:flex-1"
          >
            {lenses.map((lens) => {
              const active = lens.value === query.lens;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 border-b-2 px-0.5 py-2 text-[13px] font-medium text-foreground",
                    active
                      ? "border-foreground"
                      : "border-transparent text-foreground-muted hover:border-border hover:text-foreground",
                  )}
                  href={buildLensHref(query, lens.value)}
                  key={lens.value}
                >
                  {lens.label}
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0">
            <OverviewMonthPicker query={query} />
          </div>
        </div>
      </header>
    </>
  );
}

function buildLensHref(query: OverviewViewQuery, lens: OverviewLens) {
  return buildOverviewHref(query, { lens });
}
