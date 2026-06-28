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
  DEFAULT_LEDGER_PAGE_SIZE,
  DEFAULT_LEDGER_SORT,
  LEDGER_PAGE_SIZE_OPTIONS,
} from "@/features/ledger/ledger.filters";
import type {
  LedgerPropertyOption,
  LedgerUnitOption,
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";

type LedgerFiltersProps = {
  properties: LedgerPropertyOption[];
  units: LedgerUnitOption[];
  viewQuery: LedgerViewQuery;
};

export function LedgerFilters({ properties, units, viewQuery }: LedgerFiltersProps) {
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
    viewQuery.direction !== "all" ||
    viewQuery.archiveState !== "active" ||
    viewQuery.period !== "all" ||
    viewQuery.dateFrom !== "" ||
    viewQuery.dateTo !== "" ||
    viewQuery.minAmount !== null ||
    viewQuery.sort !== DEFAULT_LEDGER_SORT ||
    viewQuery.pageSize !== DEFAULT_LEDGER_PAGE_SIZE;
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
    nextParams.delete("entryId");
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
              <span className="sr-only">Search ledger entries</span>
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
                placeholder="Search category or notes"
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label="Search ledger entries"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search ledger entries"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-controls="ledger-advanced-search"
              aria-expanded={advancedOpen}
              className="h-8 w-full gap-1.5 px-2.5 sm:w-auto"
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              Filters
            </Button>
            <Link
              aria-label="Reset ledger filters"
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
            className="grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px] lg:grid-cols-[minmax(180px,240px)_minmax(180px,240px)_minmax(150px,180px)_minmax(130px,160px)_minmax(130px,170px)_minmax(84px,104px)]"
            id="ledger-advanced-search"
          >
            <SelectControl
              ariaLabel="Filter by property"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("propertyId", value, "all", ["unitId"])
              }
              options={[
                { label: "All properties", value: "all" },
                ...properties.map((propertyOption) => ({
                  label: propertyOption.label,
                  value: propertyOption.id,
                })),
              ]}
              value={viewQuery.propertyId}
            />

            <SelectControl
              ariaLabel="Filter by unit"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("unitId", value, "all")}
              options={[
                { label: "All units", value: "all" },
                ...visibleUnitOptions.map((unitOption) => ({
                  label: unitOption.label,
                  value: unitOption.id,
                })),
              ]}
              value={viewQuery.unitId}
            />

            <SelectControl
              ariaLabel="Filter by direction"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("direction", value, "all")}
              options={[
                { label: "All directions", value: "all" },
                { label: "Income", value: "income" },
                { label: "Expense", value: "expense" },
              ]}
              value={viewQuery.direction}
            />

            <SelectControl
              ariaLabel="Filter by archive state"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("archiveState", value, "active")
              }
              options={[
                { label: "Active", value: "active" },
                { label: "Archived", value: "archived" },
                { label: "All records", value: "all" },
              ]}
              value={viewQuery.archiveState}
            />

            <SelectControl
              ariaLabel="Sort ledger entries"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("sort", value, DEFAULT_LEDGER_SORT)
              }
              options={[
                { label: "Newest first", value: "date_desc" },
                { label: "Oldest first", value: "date_asc" },
                { label: "Highest amount", value: "amount_desc" },
                { label: "Lowest amount", value: "amount_asc" },
                { label: "Property", value: "property_asc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_LEDGER_PAGE_SIZE))
              }
              options={LEDGER_PAGE_SIZE_OPTIONS.map((pageSize) => ({
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
