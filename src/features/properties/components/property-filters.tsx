"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_PROPERTY_PAGE_SIZE,
  DEFAULT_PROPERTY_SORT,
  PROPERTY_PAGE_SIZE_OPTIONS,
} from "@/features/properties/property.filters";
import type {
  PropertyDisplayMode,
  PropertyViewQuery,
} from "@/features/properties/property.types";
import { cn } from "@/lib/utils";

type PropertyFiltersProps = {
  displayMode: PropertyDisplayMode;
  onDisplayModeChange: (mode: PropertyDisplayMode) => void;
  viewQuery: PropertyViewQuery;
};

export function PropertyFilters({
  displayMode,
  onDisplayModeChange,
  viewQuery,
}: PropertyFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const activeFilters = [
    viewQuery.status !== "all",
    viewQuery.archiveState !== "active",
    viewQuery.sort !== DEFAULT_PROPERTY_SORT,
    viewQuery.pageSize !== DEFAULT_PROPERTY_PAGE_SIZE,
  ].filter(Boolean).length;
  const hasSearchQuery = viewQuery.query.trim().length > 0;
  const hasAdvancedFilters = activeFilters > 0;
  const hasAnyFilters = hasSearchQuery || hasAdvancedFilters;
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
              <span className="sr-only">Search properties</span>
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
                placeholder="Search property, code, owner, or address"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label="Search properties"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search properties"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <ViewModeToggle
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
            />
            <Button
              aria-controls="property-advanced-search"
              aria-expanded={advancedOpen}
              className={cn(
                "h-8 w-full gap-1.5 px-2.5 sm:w-auto",
                hasAdvancedFilters &&
                  "border-accent bg-accent-soft text-accent hover:bg-accent-soft",
              )}
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {activeFilters > 0 ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
            <Link
              aria-label="Reset property filters"
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                hasAnyFilters && "border-accent/40 text-accent",
              )}
              href={pathname}
              scroll={false}
              title="Reset filters"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </Link>
          </div>
        </div>

        {hasAnyFilters ? (
          <div
            aria-label="Active property filters"
            className="flex flex-wrap items-center gap-1.5 text-xs"
          >
            {hasSearchQuery ? (
              <FilterChip label="Search" value={viewQuery.query} />
            ) : null}
            {viewQuery.status !== "all" ? (
              <FilterChip
                label="Status"
                value={formatFilterValue(viewQuery.status)}
              />
            ) : null}
            {viewQuery.archiveState !== "active" ? (
              <FilterChip
                label="Archive"
                value={formatFilterValue(viewQuery.archiveState)}
              />
            ) : null}
            {viewQuery.sort !== DEFAULT_PROPERTY_SORT ? (
              <FilterChip
                label="Sort"
                value={formatFilterValue(viewQuery.sort)}
              />
            ) : null}
            {viewQuery.pageSize !== DEFAULT_PROPERTY_PAGE_SIZE ? (
              <FilterChip label="Rows" value={String(viewQuery.pageSize)} />
            ) : null}
          </div>
        ) : null}

        {advancedOpen ? (
          <div
            className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(132px,160px)_minmax(132px,160px)_minmax(132px,170px)_minmax(84px,104px)]"
            id="property-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by status"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("status", value, "all")}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Active", value: "active" },
                { label: "Under renovation", value: "under_renovation" },
                { label: "Inactive", value: "inactive" },
              ]}
              value={viewQuery.status}
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
              ariaLabel="Sort properties"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("sort", value, DEFAULT_PROPERTY_SORT)
              }
              options={[
                { label: "Code", value: "code_asc" },
                { label: "Name", value: "name_asc" },
                { label: "Status", value: "status_asc" },
                { label: "Net income", value: "net_desc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_PROPERTY_PAGE_SIZE))
              }
              options={PROPERTY_PAGE_SIZE_OPTIONS.map((pageSize) => ({
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

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/20 bg-accent-soft px-2 py-1 text-accent">
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </span>
  );
}

function formatFilterValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ViewModeToggle({
  displayMode,
  onDisplayModeChange,
}: {
  displayMode: PropertyDisplayMode;
  onDisplayModeChange: (mode: PropertyDisplayMode) => void;
}) {
  return (
    <div
      aria-label="Property view"
      className="inline-flex h-8 rounded-md border border-border bg-surface-muted p-0.5 text-xs"
      role="group"
    >
      <ViewModeButton
        active={displayMode === "table"}
        icon={<Table2 size={14} />}
        label="Table"
        onClick={() => onDisplayModeChange("table")}
      />
      <ViewModeButton
        active={displayMode === "cards"}
        icon={<LayoutGrid size={14} />}
        label="Cards"
        onClick={() => onDisplayModeChange("cards")}
      />
    </div>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted transition-colors hover:text-foreground",
        active && "bg-surface text-foreground shadow-sm",
      )}
      onClick={onClick}
      title={`${label} view`}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
