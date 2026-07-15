"use client";

import * as Popover from "@radix-ui/react-popover";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  RotateCcw,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import { SearchCombo } from "@/components/ui/search-combo";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_PROPERTY_PAGE_SIZE,
  DEFAULT_PROPERTY_SORT,
  PROPERTY_PAGE_SIZE_OPTIONS,
} from "@/features/properties/property.filters";
import type { PropertySummary } from "@/features/properties/data/properties";
import type {
  PropertyDisplayMode,
  PropertyViewQuery,
} from "@/features/properties/property.types";
import { cn } from "@/lib/utils";

type SelectOption = {
  label: string;
  value: string;
};

type ActivePropertyFilter = {
  defaultValue: string;
  label: string;
  param: string;
  value: string;
};

const statusFilterOptions = [
  { label: "All statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Under renovation", value: "under_renovation" },
  { label: "Inactive", value: "inactive" },
] satisfies SelectOption[];

const ownerFilterOptions = [
  { label: "All owner links", value: "all" },
  { label: "Missing owner link", value: "missing" },
] satisfies SelectOption[];

const netFilterOptions = [
  { label: "All net results", value: "all" },
  { label: "Negative net income", value: "negative" },
] satisfies SelectOption[];

const archiveFilterOptions = [
  { label: "Active records", value: "active" },
  { label: "Archived", value: "archived" },
  { label: "All records", value: "all" },
] satisfies SelectOption[];

const reviewFilterOptions = [
  { label: "All review states", value: "all" },
  { label: "Needs units", value: "needs_units" },
  { label: "Missing photos", value: "missing_photos" },
  { label: "Missing address", value: "missing_address" },
] satisfies SelectOption[];

const sortFilterOptions = [
  { label: "Code", value: "code_asc" },
  { label: "Name", value: "name_asc" },
  { label: "Status", value: "status_asc" },
  { label: "Lowest net income", value: "net_asc" },
  { label: "Net income", value: "net_desc" },
] satisfies SelectOption[];

type PropertyFiltersProps = {
  displayMode: PropertyDisplayMode;
  onDisplayModeChange: (mode: PropertyDisplayMode) => void;
  onSelectProperty: (propertyId: string) => void;
  properties: PropertySummary[];
  viewQuery: PropertyViewQuery;
};

export function PropertyFilters({
  displayMode,
  onDisplayModeChange,
  onSelectProperty,
  properties,
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
  const activeFilterChips = getActivePropertyFilters(viewQuery);
  const activeFilters = activeFilterChips.filter(
    (filter) => filter.param !== "query",
  ).length;
  const hasAdvancedFilters = activeFilters > 0;
  const hasAnyFilters = activeFilterChips.length > 0;
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const compactSelectClassName = "h-8 w-full px-2 text-[13px]";
  const propertySuggestions = getPropertySuggestions(properties, query);

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
    <div className="w-full min-w-0">
      <div>
        <div className="flex flex-col gap-2 text-[13px] lg:flex-row lg:items-center lg:justify-between">
          <SearchCombo
            ariaLabel="Search properties"
            className="lg:max-w-[520px]"
            disabled={isPending}
            onQueryChange={(value) =>
              setQueryState({
                source: viewQuery.query,
                value,
              })
            }
            onSubmit={handleSearchSubmit}
            placeholder="Search properties..."
            query={query}
            suggestions={propertySuggestions}
            onSuggestionSelect={(suggestion) => {
              const property = properties.find((item) => item.id === suggestion.id);
              setQueryState({
                source: viewQuery.query,
                value: property?.name ?? suggestion.label,
              });
              onSelectProperty(suggestion.id);
            }}
            submitLabel="Search properties"
          />

          <div className="flex min-w-0 items-center gap-1.5">
            <ViewModeToggle
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
            />
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring data-[state=open]:border-foreground sm:flex-none",
                    hasAdvancedFilters &&
                      "border-accent bg-accent-soft text-accent hover:bg-accent-soft",
                  )}
                  type="button"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filters</span>
                  {activeFilters > 0 ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-background">
                      {activeFilters}
                    </span>
                  ) : null}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  className="z-50 max-h-[min(720px,calc(100vh-8rem))] w-[min(calc(100vw-2rem),520px)] overflow-auto rounded-md border border-border bg-surface text-[13px] shadow-lg"
                  id="property-advanced-search"
                  side="bottom"
                  sideOffset={6}
                >
                  <div className="border-b border-border px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 text-sm font-semibold text-foreground">
                        Filter properties
                      </h2>
                      {hasAnyFilters ? (
                        <Link
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
                          href={pathname}
                          scroll={false}
                        >
                          <RotateCcw size={13} />
                          Reset
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeFilterChips.length > 0 ? (
                        activeFilterChips.map((filter) => (
                          <ActiveFilterChip
                            key={filter.param}
                            filter={filter}
                            onRemove={() =>
                              replaceParam(
                                filter.param,
                                filter.defaultValue,
                                filter.defaultValue,
                              )
                            }
                          />
                        ))
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    <FilterSection title="Record state">
                      <FilterField label="Status">
                        <SelectControl
                          ariaLabel="Filter by status"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("status", value, "all")
                          }
                          options={statusFilterOptions}
                          value={viewQuery.status}
                        />
                      </FilterField>

                      <FilterField label="Archive">
                        <SelectControl
                          ariaLabel="Filter by archive state"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("archiveState", value, "active")
                          }
                          options={archiveFilterOptions}
                          value={viewQuery.archiveState}
                        />
                      </FilterField>
                    </FilterSection>

                    <FilterSection title="Operational review">
                      <FilterField label="Owner link">
                        <SelectControl
                          ariaLabel="Filter by owner link"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("ownerStatus", value, "all")
                          }
                          options={ownerFilterOptions}
                          value={viewQuery.ownerStatus}
                        />
                      </FilterField>

                      <FilterField label="Review queue">
                        <SelectControl
                          ariaLabel="Filter by review need"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("review", value, "all")
                          }
                          options={reviewFilterOptions}
                          value={viewQuery.review}
                        />
                      </FilterField>

                      <FilterField label="Net result">
                        <SelectControl
                          ariaLabel="Filter by net income"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("netStatus", value, "all")
                          }
                          options={netFilterOptions}
                          value={viewQuery.netStatus}
                        />
                      </FilterField>
                    </FilterSection>

                    <FilterSection title="Table setup">
                      <FilterField label="Sort">
                        <SelectControl
                          ariaLabel="Sort properties"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("sort", value, DEFAULT_PROPERTY_SORT)
                          }
                          options={sortFilterOptions}
                          value={viewQuery.sort}
                        />
                      </FilterField>

                      <FilterField label="Rows">
                        <SelectControl
                          ariaLabel="Rows per page"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam(
                              "pageSize",
                              value,
                              String(DEFAULT_PROPERTY_PAGE_SIZE),
                            )
                          }
                          options={PROPERTY_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                            label: String(pageSize),
                            value: String(pageSize),
                          }))}
                          value={String(viewQuery.pageSize)}
                        />
                      </FilterField>
                    </FilterSection>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted">
                    <span>
                      Showing {properties.length}{" "}
                      {properties.length === 1 ? "property" : "properties"} on this
                      page
                    </span>
                    <Popover.Close asChild>
                      <button
                        className="inline-flex h-7 items-center rounded-md border border-border px-2.5 font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                        type="button"
                      >
                        Done
                      </button>
                    </Popover.Close>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {hasAnyFilters ? (
              <Link
                aria-label="Reset property filters"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-surface px-2 text-accent outline-none transition-colors hover:bg-surface-muted hover:text-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={pathname}
                scroll={false}
                title="Reset filters"
              >
                <RotateCcw size={14} />
                <span className="hidden sm:inline">Reset</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
        {title}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1 text-xs font-medium text-foreground-muted">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ActiveFilterChip({
  filter,
  onRemove,
}: {
  filter: ActivePropertyFilter;
  onRemove: () => void;
}) {
  return (
    <button
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-1 text-left text-xs text-foreground outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus-ring"
      onClick={onRemove}
      title={`Remove ${filter.label} filter`}
      type="button"
    >
      <span className="font-semibold">{filter.label}</span>
      <span className="min-w-0 truncate text-muted">{filter.value}</span>
      <X aria-hidden="true" className="shrink-0 text-muted" size={12} />
    </button>
  );
}

function getActivePropertyFilters(
  viewQuery: PropertyViewQuery,
): ActivePropertyFilter[] {
  const filters: ActivePropertyFilter[] = [];
  const query = viewQuery.query.trim();

  if (query) {
    filters.push({
      defaultValue: "",
      label: "Search",
      param: "query",
      value: query,
    });
  }

  if (viewQuery.status !== "all") {
    filters.push({
      defaultValue: "all",
      label: "Status",
      param: "status",
      value: getOptionLabel(statusFilterOptions, viewQuery.status),
    });
  }

  if (viewQuery.archiveState !== "active") {
    filters.push({
      defaultValue: "active",
      label: "Archive",
      param: "archiveState",
      value: getOptionLabel(archiveFilterOptions, viewQuery.archiveState),
    });
  }

  if (viewQuery.ownerStatus !== "all") {
    filters.push({
      defaultValue: "all",
      label: "Owner",
      param: "ownerStatus",
      value: getOptionLabel(ownerFilterOptions, viewQuery.ownerStatus),
    });
  }

  if (viewQuery.review !== "all") {
    filters.push({
      defaultValue: "all",
      label: "Review",
      param: "review",
      value: getOptionLabel(reviewFilterOptions, viewQuery.review),
    });
  }

  if (viewQuery.netStatus !== "all") {
    filters.push({
      defaultValue: "all",
      label: "Net",
      param: "netStatus",
      value: getOptionLabel(netFilterOptions, viewQuery.netStatus),
    });
  }

  if (viewQuery.sort !== DEFAULT_PROPERTY_SORT) {
    filters.push({
      defaultValue: DEFAULT_PROPERTY_SORT,
      label: "Sort",
      param: "sort",
      value: getOptionLabel(sortFilterOptions, viewQuery.sort),
    });
  }

  if (viewQuery.pageSize !== DEFAULT_PROPERTY_PAGE_SIZE) {
    filters.push({
      defaultValue: String(DEFAULT_PROPERTY_PAGE_SIZE),
      label: "Rows",
      param: "pageSize",
      value: String(viewQuery.pageSize),
    });
  }

  return filters;
}

function getOptionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getPropertySuggestions(properties: PropertySummary[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? properties.filter((property) =>
        [
          property.name,
          property.code,
          property.type,
          property.owner,
          property.address,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : properties;

  return matches.slice(0, 6).map((property) => ({
    description: `${property.code} / ${property.type}`,
    id: property.id,
    label: property.name,
    meta: property.status,
  }));
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
      className="hidden h-8 rounded-md border border-border bg-surface-muted p-0.5 text-xs md:inline-flex"
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
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring",
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
