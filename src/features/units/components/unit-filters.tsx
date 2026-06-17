"use client";

import type { FormEvent, ReactNode } from "react";
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
  DEFAULT_UNIT_ARCHIVE_STATE,
  DEFAULT_UNIT_PAGE_SIZE,
  DEFAULT_UNIT_SORT,
  UNIT_PAGE_SIZE_OPTIONS,
} from "@/features/units/unit.filters";
import type {
  UnitDisplayMode,
  UnitPropertyOption,
  UnitViewQuery,
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
  const hasAdvancedFilters =
    viewQuery.propertyId !== "all" ||
    viewQuery.status !== "all" ||
    viewQuery.archiveState !== DEFAULT_UNIT_ARCHIVE_STATE ||
    viewQuery.sort !== DEFAULT_UNIT_SORT ||
    viewQuery.pageSize !== DEFAULT_UNIT_PAGE_SIZE;
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
              <span className="sr-only">Search units</span>
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
                placeholder="Search unit, property, tenant, or record"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label="Search units"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search units"
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
              aria-controls="unit-advanced-search"
              aria-expanded={advancedOpen}
              className="h-8 w-full gap-1.5 px-2.5 sm:w-auto"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              Filters
            </Button>
            <Link
              aria-label="Reset unit filters"
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
            className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(160px,210px)_minmax(132px,150px)_minmax(132px,150px)_minmax(132px,160px)_minmax(84px,104px)]"
            id="unit-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by property"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("propertyId", value, "all")}
              options={[
                { label: "All properties", value: "all" },
                ...properties.map((property) => ({
                  label: property.label,
                  value: property.id,
                })),
              ]}
              value={viewQuery.propertyId}
            />

            <SelectControl
              ariaLabel="Filter by status"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("status", value, "all")}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Occupied", value: "occupied" },
                { label: "Vacant", value: "vacant" },
                { label: "Reserved", value: "reserved" },
                { label: "Maintenance", value: "maintenance" },
                { label: "Inactive", value: "inactive" },
              ]}
              value={viewQuery.status}
            />

            <SelectControl
              ariaLabel="Filter by archive state"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("archiveState", value, DEFAULT_UNIT_ARCHIVE_STATE)
              }
              options={[
                { label: "Active records", value: "active" },
                { label: "Archived", value: "archived" },
                { label: "All records", value: "all" },
              ]}
              value={viewQuery.archiveState}
            />

            <SelectControl
              ariaLabel="Sort units"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("sort", value, DEFAULT_UNIT_SORT)}
              options={[
                { label: "Property", value: "property_asc" },
                { label: "Unit", value: "unit_asc" },
                { label: "Status", value: "status_asc" },
                { label: "Rent", value: "rent_desc" },
                { label: "Ledger net", value: "net_desc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_UNIT_PAGE_SIZE))
              }
              options={UNIT_PAGE_SIZE_OPTIONS.map((pageSize) => ({
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
  icon: ReactNode;
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
