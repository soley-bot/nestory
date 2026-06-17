"use client";

import type { FormEvent } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
  LedgerViewQuery,
} from "@/features/ledger/ledger.types";

type LedgerFiltersProps = {
  properties: LedgerPropertyOption[];
  viewQuery: LedgerViewQuery;
};

export function LedgerFilters({ properties, viewQuery }: LedgerFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
    const formData = new FormData(event.currentTarget);
    const nextQuery = String(formData.get("query") ?? "").trim();

    replaceParam("query", nextQuery, "");
  }

  return (
    <div className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(180px,240px)_minmax(150px,180px)_minmax(130px,160px)_minmax(130px,170px)_minmax(104px,120px)]">
        <form className="flex min-w-0 gap-2" onSubmit={handleSearchSubmit}>
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search ledger entries</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              size={16}
            />
            <Input
              key={viewQuery.query}
              className="pl-9"
              defaultValue={viewQuery.query}
              name="query"
              placeholder="Search category or notes"
              type="search"
            />
          </label>
          <Button disabled={isPending} type="submit">
            Search
          </Button>
        </form>

        <SelectControl
          ariaLabel="Filter by property"
          onValueChange={(value) => replaceParam("propertyId", value, "all")}
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
          ariaLabel="Filter by direction"
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
          onValueChange={(value) => replaceParam("sort", value, DEFAULT_LEDGER_SORT)}
          options={[
            { label: "Newest first", value: "date_desc" },
            { label: "Oldest first", value: "date_asc" },
            { label: "Highest amount", value: "amount_desc" },
            { label: "Lowest amount", value: "amount_asc" },
            { label: "Property", value: "property_asc" },
          ]}
          value={viewQuery.sort}
        />

        <div className="flex gap-2">
          <SelectControl
            ariaLabel="Rows per page"
            onValueChange={(value) =>
              replaceParam("pageSize", value, String(DEFAULT_LEDGER_PAGE_SIZE))
            }
            options={LEDGER_PAGE_SIZE_OPTIONS.map((pageSize) => ({
              label: String(pageSize),
              value: String(pageSize),
            }))}
            value={String(viewQuery.pageSize)}
          />
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            href={pathname}
            scroll={false}
          >
            Reset
          </Link>
        </div>
      </div>
    </div>
  );
}
