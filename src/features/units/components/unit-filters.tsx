"use client";

import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { RegisterNavigation } from "@/components/data/use-register-navigation";
import { SearchCombo } from "@/components/ui/search-combo";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_UNIT_ARCHIVE_STATE,
  DEFAULT_UNIT_PAGE_SIZE,
  DEFAULT_UNIT_SORT,
  UNIT_PAGE_SIZE_OPTIONS,
  parseUnitSearchParams,
} from "@/features/units/unit.filters";
import {
  type UnitPropertyOption,
  type UnitViewQuery,
} from "@/features/units/unit.types";
import { cn } from "@/lib/utils";

type UnitFiltersProps = {
  navigation: RegisterNavigation;
  properties: UnitPropertyOption[];
  viewQuery: UnitViewQuery;
};

export function UnitFilters({
  navigation,
  properties,
  viewQuery,
}: UnitFiltersProps) {
  const pathname = usePathname();
  const { isPending, pendingParams, replaceParam, search } = navigation;
  const selectedQuery = pendingParams
    ? parseUnitSearchParams(Object.fromEntries(pendingParams))
    : viewQuery;
  // Sort order and page size change presentation, not which units are shown, so
  // they are not counted as filters.
  const activeFilters = [
    viewQuery.propertyId !== "all",
    viewQuery.status !== "all",
    viewQuery.occupancy !== "all",
    viewQuery.leaseStatus !== "all",
    viewQuery.archiveState !== DEFAULT_UNIT_ARCHIVE_STATE,
  ].filter(Boolean).length;
  const hasSearchQuery = viewQuery.query.trim().length > 0;
  const hasAdvancedFilters = activeFilters > 0;
  const hasAnyFilters = hasSearchQuery || hasAdvancedFilters;
  const query = search.query;
  const compactSelectClassName = "h-8 w-full px-2 text-sm";

  return (
    <div aria-busy={isPending} className="w-full min-w-0">
      <div>
        <div className="flex items-center gap-2 text-sm lg:justify-between">
          <SearchCombo
            ariaLabel="Search units"
            className="basis-0 sm:basis-0 lg:max-w-none"
            disabled={isPending}
            onQueryChange={search.onQueryChange}
            onCompositionChange={search.onCompositionChange}
            onSubmit={search.onSubmit}
            placeholder="Search property, unit, owner or tenant"
            query={query}
            showSubmitButton={false}
            submitLabel="Search units"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground sm:flex-none",
                    hasAdvancedFilters &&
                      "border-primary/40 bg-accent text-accent-foreground hover:bg-accent",
                  )}
                  type="button"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filters</span>
                  {activeFilters > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
                      {activeFilters}
                    </span>
                  ) : null}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  aria-busy={isPending}
                  className="z-50 w-[min(calc(100vw-2rem),460px)] rounded-md border border-border bg-card text-sm shadow-lg"
                  id="unit-advanced-search"
                  side="bottom"
                  sideOffset={6}
                >
                  <h2 className="border-b border-border px-3 py-2.5 text-sm font-semibold text-foreground">
                    Filter units
                  </h2>
                  <div className="grid gap-2 p-3 sm:grid-cols-2">
                    <FilterField label="Property">
                      <SelectControl
                        ariaLabel="Filter by property"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam("propertyId", value, "all")
                        }
                        options={[
                          { label: "All properties", value: "all" },
                          ...properties.map((property) => ({
                            label: property.label,
                            value: property.id,
                          })),
                        ]}
                        value={selectedQuery.propertyId}
                      />
                    </FilterField>

                    <FilterField label="Occupancy">
                      <SelectControl
                        ariaLabel="Filter by occupancy"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam("occupancy", value, "all")
                        }
                        options={[
                          { label: "All units", value: "all" },
                          { label: "Occupied", value: "occupied" },
                          { label: "No lease", value: "unoccupied" },
                        ]}
                        value={selectedQuery.occupancy}
                      />
                    </FilterField>

                    <FilterField label="Operational state">
                      <SelectControl
                        ariaLabel="Filter by operational state"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam("status", value, "all")
                        }
                        options={[
                          { label: "All states", value: "all" },
                          { label: "Occupied", value: "occupied" },
                          { label: "Vacant", value: "vacant" },
                          { label: "Reserved", value: "reserved" },
                          { label: "Maintenance", value: "maintenance" },
                          { label: "Inactive", value: "inactive" },
                        ]}
                        value={selectedQuery.status}
                      />
                    </FilterField>

                    <FilterField label="Lease link">
                      <SelectControl
                        ariaLabel="Filter by lease link"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam("leaseStatus", value, "all")
                        }
                        options={[
                          { label: "All units", value: "all" },
                          { label: "No active lease", value: "missing" },
                        ]}
                        value={selectedQuery.leaseStatus}
                      />
                    </FilterField>

                    <FilterField label="Archive">
                      <SelectControl
                        ariaLabel="Filter by archive state"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam(
                            "archiveState",
                            value,
                            DEFAULT_UNIT_ARCHIVE_STATE,
                          )
                        }
                        options={[
                          { label: "Active records", value: "active" },
                          { label: "Archived", value: "archived" },
                          { label: "All records", value: "all" },
                        ]}
                        value={selectedQuery.archiveState}
                      />
                    </FilterField>

                    <FilterField label="Sort">
                      <SelectControl
                        ariaLabel="Sort units"
                        className={compactSelectClassName}
                        onValueChange={(value) =>
                          replaceParam("sort", value, DEFAULT_UNIT_SORT)
                        }
                        options={[
                          { label: "Property", value: "property_asc" },
                          { label: "Unit", value: "unit_asc" },
                          { label: "Occupancy", value: "status_asc" },
                          { label: "Rent", value: "rent_desc" },
                          { label: "Ledger net", value: "net_desc" },
                        ]}
                        value={selectedQuery.sort}
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
                            String(DEFAULT_UNIT_PAGE_SIZE),
                          )
                        }
                        options={UNIT_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                          label: String(pageSize),
                          value: String(pageSize),
                        }))}
                        value={String(selectedQuery.pageSize)}
                      />
                    </FilterField>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {hasAnyFilters ? (
              <Link
                aria-label="Reset unit filters"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-card px-2 text-primary outline-none transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                href={pathname}
                onNavigate={navigation.cancelPending}
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

function FilterField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </div>
  );
}
