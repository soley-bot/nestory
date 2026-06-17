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
  DEFAULT_PROPERTY_PAGE_SIZE,
  DEFAULT_PROPERTY_SORT,
  PROPERTY_PAGE_SIZE_OPTIONS,
} from "@/features/properties/property.filters";
import type { PropertyViewQuery } from "@/features/properties/property.types";

type PropertyFiltersProps = {
  viewQuery: PropertyViewQuery;
};

export function PropertyFilters({ viewQuery }: PropertyFiltersProps) {
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
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto]">
          <form className="flex min-w-0 gap-2" onSubmit={handleSearchSubmit}>
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
            <Button disabled={isPending} type="submit">
              Search
            </Button>
          </form>

          <Button
            aria-controls="property-advanced-search"
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
