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
import { SearchInput } from "@/components/ui/search-input";
import { SelectControl } from "@/components/ui/select-control";
import {
  DEFAULT_PEOPLE_ARCHIVE_STATE,
  DEFAULT_PEOPLE_PAGE_SIZE,
  DEFAULT_PEOPLE_SORT,
  PEOPLE_PAGE_SIZE_OPTIONS,
} from "@/features/people/people.filters";
import type {
  PeopleDisplayMode,
  PeopleViewQuery,
  PersonRoleValue,
} from "@/features/people/people.types";
import { cn } from "@/lib/utils";

type PeopleFiltersProps = {
  displayMode: PeopleDisplayMode;
  lockedRole?: PersonRoleValue;
  onDisplayModeChange: (mode: PeopleDisplayMode) => void;
  searchPlaceholder?: string;
  viewQuery: PeopleViewQuery;
};

export function PeopleFilters({
  displayMode,
  lockedRole,
  onDisplayModeChange,
  searchPlaceholder = "Search name, contact, role, lease, or property",
  viewQuery,
}: PeopleFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const hasLockedRole = Boolean(lockedRole);
  const activeFilters = [
    viewQuery.role !== "all" && !hasLockedRole,
    viewQuery.status !== "all",
    viewQuery.archiveState !== DEFAULT_PEOPLE_ARCHIVE_STATE,
    viewQuery.sort !== DEFAULT_PEOPLE_SORT,
    viewQuery.pageSize !== DEFAULT_PEOPLE_PAGE_SIZE,
  ].filter(Boolean).length;
  const hasSearchQuery = viewQuery.query.trim().length > 0;
  const hasAdvancedFilters = activeFilters > 0;
  const hasAnyFilters = hasSearchQuery || hasAdvancedFilters;
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
    <div className="border-b border-border bg-surface px-4 py-2.5 sm:px-6 lg:px-6">
      <div className="space-y-2">
        <div className="flex flex-col gap-2 text-[13px] xl:flex-row xl:items-center">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={handleSearchSubmit}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search people</span>
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
                placeholder={searchPlaceholder}
                value={query}
              />
            </label>
            <Button
              aria-label="Search people"
              className="h-8 w-8 shrink-0 px-0"
              disabled={isPending}
              title="Search people"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <ViewModeToggle
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
            />
            <Button
              aria-controls="people-advanced-search"
              aria-expanded={advancedOpen}
              className={cn(
                "h-8 flex-1 gap-1.5 px-2.5 sm:flex-none",
                hasAdvancedFilters &&
                  "border-border bg-surface-muted text-foreground hover:bg-surface-muted",
              )}
              onClick={() => setAdvancedOpen((open) => !open)}
              type="button"
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {activeFilters > 0 ? (
                <span className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold leading-none text-foreground">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
            <Link
              aria-label="Reset people filters"
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
                hasAnyFilters && "border-border bg-surface-muted text-foreground",
              )}
              href={pathname}
              scroll={false}
              title="Reset filters"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </Link>
          </div>
        </div>

        {hasAnyFilters ? (
          <div
            aria-label="Active people filters"
            className="flex flex-wrap items-center gap-1.5 text-xs"
          >
            {hasSearchQuery ? (
              <FilterChip label="Search" value={viewQuery.query} />
            ) : null}
            {viewQuery.role !== "all" && !hasLockedRole ? (
              <FilterChip label="Role" value={formatFilterValue(viewQuery.role)} />
            ) : null}
            {viewQuery.status !== "all" ? (
              <FilterChip
                label="Status"
                value={formatFilterValue(viewQuery.status)}
              />
            ) : null}
            {viewQuery.archiveState !== DEFAULT_PEOPLE_ARCHIVE_STATE ? (
              <FilterChip
                label="Archive"
                value={formatFilterValue(viewQuery.archiveState)}
              />
            ) : null}
            {viewQuery.sort !== DEFAULT_PEOPLE_SORT ? (
              <FilterChip
                label="Sort"
                value={formatFilterValue(viewQuery.sort)}
              />
            ) : null}
            {viewQuery.pageSize !== DEFAULT_PEOPLE_PAGE_SIZE ? (
              <FilterChip label="Rows" value={String(viewQuery.pageSize)} />
            ) : null}
          </div>
        ) : null}

        {advancedOpen ? (
          <div
            className={cn(
              "grid gap-2 rounded-md border border-border bg-surface-muted p-2 text-[13px]",
              hasLockedRole
                ? "lg:grid-cols-[minmax(132px,150px)_minmax(132px,160px)_minmax(132px,170px)_minmax(84px,104px)]"
                : "lg:grid-cols-[minmax(132px,150px)_minmax(132px,150px)_minmax(132px,160px)_minmax(132px,170px)_minmax(84px,104px)]",
            )}
            id="people-advanced-search"
          >
            {hasLockedRole ? null : (
              <SelectControl
                ariaLabel="Filter by role"
                className={compactSelectClassName}
                onValueChange={(value) => replaceParam("role", value, "all")}
                options={[
                  { label: "All roles", value: "all" },
                  { label: "Tenants", value: "tenant" },
                  { label: "Owners", value: "owner" },
                  { label: "Vendors", value: "vendor" },
                  { label: "Staff", value: "staff" },
                ]}
                value={viewQuery.role}
              />
            )}

            <SelectControl
              ariaLabel="Filter by status"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("status", value, "all")}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
                { label: "Missing contact", value: "missing_contact" },
                { label: "No role", value: "no_role" },
              ]}
              value={viewQuery.status}
            />

            <SelectControl
              ariaLabel="Filter by archive state"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("archiveState", value, DEFAULT_PEOPLE_ARCHIVE_STATE)
              }
              options={[
                { label: "Active records", value: "active" },
                { label: "Archived", value: "archived" },
                { label: "All records", value: "all" },
              ]}
              value={viewQuery.archiveState}
            />

            <SelectControl
              ariaLabel="Sort people"
              className={compactSelectClassName}
              onValueChange={(value) => replaceParam("sort", value, DEFAULT_PEOPLE_SORT)}
              options={[
                { label: "Name", value: "name_asc" },
                { label: "Recently updated", value: "updated_desc" },
              ]}
              value={viewQuery.sort}
            />

            <SelectControl
              ariaLabel="Rows per page"
              className={compactSelectClassName}
              onValueChange={(value) =>
                replaceParam("pageSize", value, String(DEFAULT_PEOPLE_PAGE_SIZE))
              }
              options={PEOPLE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
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

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-1 text-foreground-muted">
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </span>
  );
}

function formatFilterValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ViewModeToggle({
  displayMode,
  onDisplayModeChange,
}: {
  displayMode: PeopleDisplayMode;
  onDisplayModeChange: (mode: PeopleDisplayMode) => void;
}) {
  return (
    <div
      aria-label="People view"
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
