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
  const hasAdvancedFilters =
    viewQuery.status !== "all" ||
    viewQuery.archiveState !== "active" ||
    viewQuery.sort !== DEFAULT_PROPERTY_SORT ||
    viewQuery.pageSize !== DEFAULT_PROPERTY_PAGE_SIZE;
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters);
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;

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
    <div className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
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
                className="pl-9"
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
              className="h-9 w-9 shrink-0 px-0"
              disabled={isPending}
              title="Search properties"
              type="submit"
            >
              <Search size={15} />
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
              className="w-full sm:w-auto"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={15} />
              Filters
            </Button>
            <Link
              aria-label="Reset property filters"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              href={pathname}
              scroll={false}
              title="Reset filters"
            >
              <RotateCcw size={15} />
            </Link>
          </div>
        </div>

        {advancedOpen ? (
          <div
            className="grid gap-3 rounded-md border border-border bg-surface-muted p-3 lg:grid-cols-[minmax(150px,180px)_minmax(150px,180px)_minmax(150px,190px)_minmax(104px,120px)]"
            id="property-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by status"
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
      className="inline-flex h-9 rounded-md border border-border bg-surface-muted p-1"
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
