"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { FilterPopover } from "@/components/ui/filter-popover";
import { Input } from "@/components/ui/input";
import { SearchCombo } from "@/components/ui/search-combo";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_TIMELINE_PAGE_SIZE,
  DEFAULT_TIMELINE_SORT,
  TIMELINE_PAGE_SIZE_OPTIONS,
} from "@/features/timeline/timeline.filters";
import type {
  TimelinePropertyOption,
  TimelineUnitOption,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";

type TimelineFiltersProps = {
  eventTypes: string[];
  properties: TimelinePropertyOption[];
  units: TimelineUnitOption[];
  viewQuery: TimelineViewQuery;
};

export function TimelineFilters({
  eventTypes,
  properties,
  units,
  viewQuery,
}: TimelineFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const advancedFilterCount = getAdvancedFilterCount(viewQuery);
  const hasActiveFilters =
    advancedFilterCount > 0 || viewQuery.query.trim().length > 0;
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const compactSelectClassName = "h-8 px-2 text-[13px]";
  const compactInputClassName = "h-8 px-2 text-[13px]";
  const unitOptions =
    viewQuery.propertyId === "all"
      ? units
      : units.filter((unit) => unit.propertyId === viewQuery.propertyId);

  function replaceParam(name: string, value: string, defaultValue: string) {
    replaceParams({
      [name]: value === defaultValue || value.trim() === "" ? null : value,
    });
  }

  function replaceParams(updates: Record<string, string | null>) {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const [name, value] of Object.entries(updates)) {
      if (!value || value.trim() === "") {
        nextParams.delete(name);
      } else {
        nextParams.set(name, value);
      }
    }

    nextParams.delete("page");
    nextParams.delete("eventId");
    const queryString = nextParams.toString();

    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    replaceParam("query", query.trim(), "");
  }

  return (
    <div className="w-full min-w-0">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <SearchCombo
          ariaLabel="Search timeline records"
          disabled={isPending}
          onQueryChange={(value) =>
            setQueryState({
              source: viewQuery.query,
              value,
            })
          }
          onSubmit={handleSearchSubmit}
          placeholder="Search title, notes, property, unit, tenant, ledger, or document"
          query={query}
          submitLabel="Search timeline records"
        />

        <FilterPopover
          activeCount={advancedFilterCount}
          contentClassName="w-[min(640px,calc(100vw-2rem))]"
          description="Narrow records by property, unit, date, type, record state, sort, or page size."
          id="timeline-advanced-search"
          title="Filter records"
        >
          <div className="grid gap-2 text-[13px] md:grid-cols-2">
            <SelectControl
              ariaLabel="Filter by property"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParams({
                  propertyId: value === "all" ? null : value,
                  unitId: null,
                })
              }
              options={[
                { label: "All properties", value: "all" },
                ...properties.map((item) => ({
                  label: item.label,
                  value: item.id,
                })),
              ]}
              value={viewQuery.propertyId}
            />

            <SelectControl
              ariaLabel="Filter by unit"
              className={compactSelectClassName}
              disabled={unitOptions.length === 0}
              onValueChange={(value) => replaceParam("unitId", value, "all")}
              options={[
                { label: "All units", value: "all" },
                ...unitOptions.map((item) => ({
                  label: item.label,
                  value: item.id,
                })),
              ]}
              value={viewQuery.unitId ?? "all"}
            />

            <Input
              aria-label="Filter timeline from date"
              className={compactInputClassName}
              onChange={(event) =>
                replaceParam("dateFrom", event.currentTarget.value, "")
              }
              type="date"
              value={viewQuery.dateFrom ?? ""}
            />

            <Input
              aria-label="Filter timeline to date"
              className={compactInputClassName}
              onChange={(event) =>
                replaceParam("dateTo", event.currentTarget.value, "")
              }
              type="date"
              value={viewQuery.dateTo ?? ""}
            />

            <SelectControl
              ariaLabel="Filter by event type"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("eventType", value, "all")}
              options={[
                { label: "All event types", value: "all" },
                ...eventTypes.map((item) => ({ label: item, value: item })),
              ]}
              value={viewQuery.eventType}
            />

            <SelectControl
              ariaLabel="Filter by archive state"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("archiveState", value, "active")
              }
              options={[
                { label: "Active records", value: "active" },
                { label: "Archived", value: "archived" },
                { label: "All records", value: "all" },
              ]}
              value={viewQuery.archiveState}
            />

            <SelectControl
              ariaLabel="Sort timeline records"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("sort", value, DEFAULT_TIMELINE_SORT)
              }
              options={[
                { label: "Newest first", value: "date_desc" },
                { label: "Oldest first", value: "date_asc" },
                { label: "Type", value: "type_asc" },
                { label: "Property", value: "property_asc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_TIMELINE_PAGE_SIZE))
              }
              options={TIMELINE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                label: String(pageSize),
                value: String(pageSize),
              }))}
              value={String(viewQuery.pageSize)}
            />

            {hasActiveFilters ? (
              <div className="flex justify-end md:col-span-2">
                <Link
                  aria-label="Reset timeline filters"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  href={pathname}
                  scroll={false}
                >
                  <RotateCcw size={14} />
                  Reset
                </Link>
              </div>
            ) : null}
          </div>
        </FilterPopover>
      </div>
    </div>
  );
}

function getAdvancedFilterCount(viewQuery: TimelineViewQuery) {
  return [
    viewQuery.propertyId !== "all",
    (viewQuery.unitId ?? "all") !== "all",
    Boolean(viewQuery.dateFrom),
    Boolean(viewQuery.dateTo),
    viewQuery.eventType !== "all",
    viewQuery.archiveState !== "active",
    viewQuery.sort !== DEFAULT_TIMELINE_SORT,
    viewQuery.pageSize !== DEFAULT_TIMELINE_PAGE_SIZE,
  ].filter(Boolean).length;
}
