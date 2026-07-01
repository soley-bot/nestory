"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_LEASE_ARCHIVE_STATE,
  DEFAULT_LEASE_PAGE_SIZE,
  DEFAULT_LEASE_SORT,
  LEASE_PAGE_SIZE_OPTIONS,
} from "@/features/leases/lease.filters";
import type {
  LeasePropertyOption,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

type LeaseFiltersProps = {
  properties: LeasePropertyOption[];
  units: LeaseUnitOption[];
  viewQuery: LeaseViewQuery;
};

export function LeaseFilters({ properties, units, viewQuery }: LeaseFiltersProps) {
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
    viewQuery.unitId !== "all" ||
    viewQuery.status !== "all" ||
    viewQuery.tenantStatus !== "all" ||
    viewQuery.archiveState !== DEFAULT_LEASE_ARCHIVE_STATE ||
    viewQuery.endsWithinDays !== null ||
    viewQuery.endMonth !== "" ||
    viewQuery.sort !== DEFAULT_LEASE_SORT ||
    viewQuery.pageSize !== DEFAULT_LEASE_PAGE_SIZE;
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters);
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const compactSelectClassName = "h-8 px-2 text-[13px]";
  const visibleUnitOptions =
    viewQuery.propertyId === "all"
      ? units
      : units.filter(
          (unit) =>
            unit.propertyId === viewQuery.propertyId || unit.id === viewQuery.unitId,
        );

  function replaceParam(
    name: string,
    value: string,
    defaultValue: string,
    deleteNames: string[] = [],
  ) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (value === defaultValue || value.trim() === "") {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }

    nextParams.delete("page");
    nextParams.delete("leaseId");
    for (const deleteName of deleteNames) {
      nextParams.delete(deleteName);
    }
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
    <div className="border-b border-border bg-surface px-4 py-3 sm:px-6 lg:px-6">
      <div className="space-y-2.5">
        <div className="flex flex-col gap-2.5 text-[13px] xl:flex-row xl:items-center">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={handleSearchSubmit}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search leases</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={16}
              />
              <SearchInput
                className="h-8 pl-9"
                onChange={(event) =>
                  setQueryState({
                    source: viewQuery.query,
                    value: event.target.value,
                  })
                }
                placeholder="Search tenant, unit, property, or term"
                value={query}
              />
            </label>
            <Button
              aria-label="Search leases"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search leases"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-controls="lease-advanced-search"
              aria-expanded={advancedOpen}
              className="h-8 w-full gap-1.5 px-2.5 sm:w-auto"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              Filters
            </Button>
            <Link
              aria-label="Reset lease filters"
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
            className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(160px,220px)_minmax(160px,220px)_minmax(132px,150px)_minmax(132px,160px)_minmax(132px,150px)_minmax(132px,160px)_minmax(84px,104px)]"
            id="lease-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter leases by property"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("propertyId", value, "all", ["unitId"])
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

            <SelectControl
              ariaLabel="Filter leases by unit"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("unitId", value, "all")}
              options={[
                { label: "All units", value: "all" },
                ...visibleUnitOptions.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
              value={viewQuery.unitId}
            />

            <SelectControl
              ariaLabel="Filter leases by status"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("status", value, "all")}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Current", value: "current" },
                { label: "Active", value: "active" },
                { label: "Draft", value: "draft" },
                { label: "Notice", value: "notice_given" },
                { label: "Ended", value: "ended" },
                { label: "Terminated", value: "terminated" },
                { label: "Cancelled", value: "cancelled" },
              ]}
              value={viewQuery.status}
            />

            <SelectControl
              ariaLabel="Filter leases by tenant link"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("tenantStatus", value, "all")
              }
              options={[
                { label: "All tenant links", value: "all" },
                { label: "Missing tenant link", value: "missing" },
              ]}
              value={viewQuery.tenantStatus}
            />

            <SelectControl
              ariaLabel="Filter leases by archive state"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("archiveState", value, DEFAULT_LEASE_ARCHIVE_STATE)
              }
              options={[
                { label: "Active records", value: "active" },
                { label: "Archived", value: "archived" },
                { label: "All records", value: "all" },
              ]}
              value={viewQuery.archiveState}
            />

            <SelectControl
              ariaLabel="Sort leases"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("sort", value, DEFAULT_LEASE_SORT)
              }
              options={[
                { label: "Newest start", value: "start_desc" },
                { label: "Ending soon", value: "end_asc" },
                { label: "Tenant", value: "tenant_asc" },
                { label: "Rent", value: "rent_desc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Lease rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_LEASE_PAGE_SIZE))
              }
              options={LEASE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
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
