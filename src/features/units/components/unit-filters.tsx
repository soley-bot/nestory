"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
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
  UnitPropertyOption,
  UnitViewQuery,
} from "@/features/units/unit.types";

type UnitFiltersProps = {
  properties: UnitPropertyOption[];
  viewQuery: UnitViewQuery;
};

export function UnitFilters({ properties, viewQuery }: UnitFiltersProps) {
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
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto]">
          <form className="flex min-w-0 gap-2" onSubmit={handleSearchSubmit}>
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search units</span>
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
                placeholder="Search unit, property, tenant, or record"
                type="search"
                value={query}
              />
            </label>
            <Button disabled={isPending} type="submit">
              Search
            </Button>
          </form>

          <Button
            aria-controls="unit-advanced-search"
            aria-expanded={advancedOpen}
            className="w-full lg:w-auto"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            <SlidersHorizontal size={15} />
            Advanced search
          </Button>
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={pathname}
            scroll={false}
          >
            Reset
          </Link>
        </div>

        {advancedOpen ? (
          <div
            className="grid gap-3 rounded-md border border-border bg-surface-muted p-3 lg:grid-cols-[minmax(180px,240px)_minmax(140px,170px)_minmax(140px,170px)_minmax(150px,180px)_minmax(104px,120px)]"
            id="unit-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by property"
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
