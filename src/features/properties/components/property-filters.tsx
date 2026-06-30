"use client";

import * as Popover from "@radix-ui/react-popover";
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
  const activeFilters = [
    viewQuery.status !== "all",
    viewQuery.ownerStatus !== "all",
    viewQuery.netStatus !== "all",
    viewQuery.archiveState !== "active",
    viewQuery.sort !== DEFAULT_PROPERTY_SORT,
    viewQuery.pageSize !== DEFAULT_PROPERTY_PAGE_SIZE,
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
    <div className="border-b border-border bg-background px-4 py-2 sm:px-6 lg:px-6">
      <div className="space-y-1.5">
        <div className="flex flex-col gap-2 text-[13px] lg:flex-row lg:items-center lg:justify-between">
          <form
            className="flex min-w-0 flex-1 gap-1.5 lg:max-w-[460px]"
            onSubmit={handleSearchSubmit}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search properties</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                size={16}
              />
              <Input
                className="h-8 border-border bg-surface pl-9 text-[13px]"
                onChange={(event) =>
                  setQueryState({
                    source: viewQuery.query,
                    value: event.target.value,
                  })
                }
                placeholder="Search properties..."
                type="search"
                value={query}
              />
            </label>
            <Button
              aria-label="Search properties"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search properties"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex min-w-0 items-center gap-1.5">
            <ViewModeToggle
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
            />
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted data-[state=open]:border-foreground sm:flex-none",
                    hasAdvancedFilters &&
                      "border-accent bg-accent-soft text-accent hover:bg-accent-soft",
                  )}
                  type="button"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filters</span>
                  {activeFilters > 0 ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {activeFilters}
                    </span>
                  ) : null}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  className="z-50 w-[min(calc(100vw-2rem),420px)] rounded-md border border-border bg-surface p-2 text-[13px] shadow-lg"
                  id="property-advanced-search"
                  side="bottom"
                  sideOffset={6}
                >
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <SelectControl
                      ariaLabel="Filter by status"
                      className={compactSelectClassName}
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
                      ariaLabel="Filter by owner link"
                      className={compactSelectClassName}
                      onValueChange={(value) =>
                        replaceParam("ownerStatus", value, "all")
                      }
                      options={[
                        { label: "All owner links", value: "all" },
                        { label: "Missing owner link", value: "missing" },
                      ]}
                      value={viewQuery.ownerStatus}
                    />

                    <SelectControl
                      ariaLabel="Filter by net income"
                      className={compactSelectClassName}
                      onValueChange={(value) =>
                        replaceParam("netStatus", value, "all")
                      }
                      options={[
                        { label: "All net results", value: "all" },
                        { label: "Negative net income", value: "negative" },
                      ]}
                      value={viewQuery.netStatus}
                    />

                    <SelectControl
                      ariaLabel="Filter by archive state"
                      className={compactSelectClassName}
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
                      className={compactSelectClassName}
                      onValueChange={(value) =>
                        replaceParam("sort", value, DEFAULT_PROPERTY_SORT)
                      }
                      options={[
                        { label: "Code", value: "code_asc" },
                        { label: "Name", value: "name_asc" },
                        { label: "Status", value: "status_asc" },
                        { label: "Lowest net income", value: "net_asc" },
                        { label: "Net income", value: "net_desc" },
                      ]}
                      value={viewQuery.sort}
                    />

                    <SelectControl
                      ariaLabel="Rows per page"
                      className={compactSelectClassName}
                      onValueChange={(value) =>
                        replaceParam(
                          "pageSize",
                          value,
                          String(DEFAULT_PROPERTY_PAGE_SIZE),
                        )
                      }
                      options={PROPERTY_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                        label: String(pageSize),
                        value: String(pageSize),
                      }))}
                      value={String(viewQuery.pageSize)}
                    />
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {hasAnyFilters ? (
              <Link
                aria-label="Reset property filters"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-surface px-2 text-accent transition-colors hover:bg-surface-muted hover:text-accent"
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
