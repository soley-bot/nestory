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
  { label: "Property finance", value: "finance" },
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
      current={<OverviewMonthPicker query={query} />}
      items={[
        { href: `/overview?month=${query.month}`, label: "Overview" },
        { href: buildLensHref(query, query.lens), label: activeLensLabel },
      ]}
    />
  );
  const target = mounted ? document.getElementById("workspace-page-tools") : null;

  return (
    <>
      {target ? createPortal(breadcrumb, target) : breadcrumb}
      <header className="min-w-0 border-b border-border px-1">
      <nav
        aria-label="Overview lenses"
        className="flex min-w-0 gap-4 overflow-x-auto"
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
      </header>
    </>
  );
}

function buildLensHref(query: OverviewViewQuery, lens: OverviewLens) {
  return buildOverviewHref(query, { lens });
}
