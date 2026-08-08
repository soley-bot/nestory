"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { FilterPopover } from "@/components/ui/filter-popover";
import { SearchCombo } from "@/components/ui/search-combo";
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
  const advancedFilterCount = getAdvancedFilterCount(viewQuery);
  const hasActiveFilters =
    viewQuery.query.trim().length > 0 ||
    advancedFilterCount > 0 ||
    viewQuery.endsWithinDays !== null ||
    viewQuery.endMonth !== "";
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
    <div className="w-full min-w-0">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <SearchCombo
          ariaLabel="Search leases"
          disabled={isPending}
          onQueryChange={(value) =>
            setQueryState({
              source: viewQuery.query,
              value,
            })
          }
          onSubmit={handleSearchSubmit}
          placeholder="Search tenant, unit, property, or term"
          query={query}
          submitLabel="Search leases"
        />

        <FilterPopover
          activeCount={advancedFilterCount}
          contentClassName="w-[min(760px,calc(100vw-2rem))]"
          description="Narrow leases by property, unit, lifecycle, record state, sort, or page size."
          id="lease-advanced-search"
          title="Filter leases"
        >
          <div className="grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
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
            {hasActiveFilters ? (
              <div className="flex justify-end sm:col-span-2 lg:col-span-4">
                <Link
                  aria-label="Reset lease filters"
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

function getAdvancedFilterCount(viewQuery: LeaseViewQuery) {
  return [
    viewQuery.propertyId !== "all",
    viewQuery.unitId !== "all",
    viewQuery.status !== "all",
    viewQuery.tenantStatus !== "all",
    viewQuery.archiveState !== DEFAULT_LEASE_ARCHIVE_STATE,
    viewQuery.sort !== DEFAULT_LEASE_SORT,
    viewQuery.pageSize !== DEFAULT_LEASE_PAGE_SIZE,
  ].filter(Boolean).length;
}
