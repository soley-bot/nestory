"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_TIMELINE_PAGE_SIZE,
  DEFAULT_TIMELINE_SORT,
  TIMELINE_PAGE_SIZE_OPTIONS,
} from "@/features/timeline/timeline.filters";
import type {
  TimelinePropertyOption,
  TimelineViewQuery,
} from "@/features/timeline/timeline.types";

type TimelineFiltersProps = {
  eventTypes: string[];
  properties: TimelinePropertyOption[];
  viewQuery: TimelineViewQuery;
};

export function TimelineFilters({
  eventTypes,
  properties,
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
  const hasAdvancedFilters =
    viewQuery.propertyId !== "all" ||
    viewQuery.eventType !== "all" ||
    viewQuery.archiveState !== "active" ||
    viewQuery.sort !== DEFAULT_TIMELINE_SORT ||
    viewQuery.pageSize !== DEFAULT_TIMELINE_PAGE_SIZE;
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters);
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const compactSelectClassName = "h-8 px-2 text-[13px]";

  function replaceParam(name: string, value: string, defaultValue: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (value === defaultValue || value.trim() === "") {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
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
    <div className="border-b border-border bg-surface px-4 py-3 sm:px-6 lg:px-8">
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2.5 text-[13px] xl:flex-row xl:items-center">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={handleSearchSubmit}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search timeline records</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={16}
              />
              <Input
                className="h-8 pl-9"
                onChange={(event) =>
                  setQueryState({
                    source: viewQuery.query,
                    value: event.target.value,
                  })
                }
                placeholder="Search title or notes"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label="Search timeline records"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search timeline records"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-controls="timeline-advanced-search"
              aria-expanded={advancedOpen}
              className="h-8 w-full gap-1.5 px-2.5 sm:w-auto"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              Filters
            </Button>
            <Link
              aria-label="Reset timeline filters"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              href={pathname}
              scroll={false}
              title="Reset filters"
            >
              <RotateCcw size={14} />
            </Link>
          </div>
        </div>

        {advancedOpen ? (
          <div
            className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(160px,210px)_minmax(132px,170px)_minmax(132px,150px)_minmax(132px,160px)_minmax(84px,104px)]"
            id="timeline-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by property"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("propertyId", value, "all")}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
