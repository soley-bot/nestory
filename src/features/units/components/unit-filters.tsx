"use client";

import * as Popover from "@radix-ui/react-popover";
import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  RotateCcw,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { SearchCombo } from "@/components/ui/search-combo";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_UNIT_ARCHIVE_STATE,
  DEFAULT_UNIT_PAGE_SIZE,
  DEFAULT_UNIT_SORT,
  UNIT_PAGE_SIZE_OPTIONS,
} from "@/features/units/unit.filters";
import {
  UNIT_STATUS_OPTIONS,
  type UnitDisplayMode,
  type UnitPropertyOption,
  type UnitViewQuery,
} from "@/features/units/unit.types";
import { cn } from "@/lib/utils";

type UnitFiltersProps = {
  displayMode: UnitDisplayMode;
  onDisplayModeChange: (mode: UnitDisplayMode) => void;
  properties: UnitPropertyOption[];
  viewQuery: UnitViewQuery;
};

export function UnitFilters({
  displayMode,
  onDisplayModeChange,
  properties,
  viewQuery,
}: UnitFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const activeFilters = [
    viewQuery.propertyId !== "all",
    viewQuery.status !== "all",
    viewQuery.occupancy !== "all",
    viewQuery.leaseStatus !== "all",
    viewQuery.archiveState !== DEFAULT_UNIT_ARCHIVE_STATE,
    viewQuery.sort !== DEFAULT_UNIT_SORT,
    viewQuery.pageSize !== DEFAULT_UNIT_PAGE_SIZE,
  ].filter(Boolean).length;
  const hasSearchQuery = viewQuery.query.trim().length > 0;
  const hasAdvancedFilters = activeFilters > 0;
  const hasAnyFilters = hasSearchQuery || hasAdvancedFilters;
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const compactSelectClassName = "h-8 w-full px-2 text-[13px]";

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
            ariaLabel="Search units"
            className="lg:max-w-[560px]"
            disabled={isPending}
            onQueryChange={(value) =>
              setQueryState({
                source: viewQuery.query,
                value,
              })
            }
            onSubmit={handleSearchSubmit}
            placeholder="Search unit, property, tenant, or record"
            query={query}
            submitLabel="Search units"
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
                  className="z-50 w-[min(calc(100vw-2rem),460px)] rounded-md border border-border bg-surface text-[13px] shadow-lg"
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
                      value={viewQuery.propertyId}
                      />
                    </FilterField>

                    <FilterField label="Status">
                      <SelectControl
                      ariaLabel="Filter by status"
                      className={compactSelectClassName}
                      onValueChange={(value) => replaceParam("status", value, "all")}
                      options={[
                        { label: "All statuses", value: "all" },
                        ...UNIT_STATUS_OPTIONS,
                      ]}
                      value={viewQuery.status}
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
                        { label: "All occupancy states", value: "all" },
                        { label: "Not occupied", value: "unoccupied" },
                      ]}
                      value={viewQuery.occupancy}
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
                        { label: "All lease links", value: "all" },
                        { label: "Missing active lease", value: "missing" },
                      ]}
                      value={viewQuery.leaseStatus}
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
                      value={viewQuery.archiveState}
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
                        { label: "Status", value: "status_asc" },
                        { label: "Rent", value: "rent_desc" },
                        { label: "Ledger net", value: "net_desc" },
                      ]}
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
                          String(DEFAULT_UNIT_PAGE_SIZE),
                        )
                      }
                      options={UNIT_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                        label: String(pageSize),
                        value: String(pageSize),
                      }))}
                      value={String(viewQuery.pageSize)}
                      />
                    </FilterField>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {hasAnyFilters ? (
              <Link
                aria-label="Reset unit filters"
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

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1 text-xs font-medium text-foreground-muted">
      <span>{label}</span>
      {children}
    </div>
  );
}

function ViewModeToggle({
  displayMode,
  onDisplayModeChange,
}: {
  displayMode: UnitDisplayMode;
  onDisplayModeChange: (mode: UnitDisplayMode) => void;
}) {
  return (
    <div
      aria-label="Unit view"
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
  icon: ReactNode;
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
