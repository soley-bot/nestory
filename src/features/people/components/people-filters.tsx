"use client";

import * as Popover from "@radix-ui/react-popover";
import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  RotateCcw,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { SearchCombo } from "@/components/ui/search-combo";
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
          <SearchCombo
            ariaLabel="Search people"
            className="lg:max-w-[560px]"
            disabled={isPending}
            onQueryChange={(value) =>
              setQueryState({
                source: viewQuery.query,
                value,
              })
            }
            onSubmit={handleSearchSubmit}
            placeholder={searchPlaceholder}
            query={query}
            submitLabel="Search people"
          />

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
                  className="z-50 w-[min(calc(100vw-2rem),460px)] rounded-md border border-border bg-surface text-[13px] shadow-lg"
                  id="people-advanced-search"
                  side="bottom"
                  sideOffset={6}
                >
                  <div className="border-b border-border px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">
                          Filter people
                        </h2>
                        <p className="mt-0.5 text-xs text-muted">
                          Narrow the directory without changing the page layout.
                        </p>
                      </div>
                      {hasAnyFilters ? (
                        <Link
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                          href={pathname}
                          scroll={false}
                        >
                          <RotateCcw size={13} />
                          Reset
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    <FilterSection
                      description="Choose which relationship records are visible."
                      title="Record state"
                    >
                      {hasLockedRole ? null : (
                        <FilterField label="Role">
                          <SelectControl
                            ariaLabel="Filter by role"
                            className={compactSelectClassName}
                            onValueChange={(value) =>
                              replaceParam("role", value, "all")
                            }
                            options={[
                              { label: "All roles", value: "all" },
                              { label: "Tenants", value: "tenant" },
                              { label: "Owners", value: "owner" },
                              { label: "Vendors", value: "vendor" },
                              { label: "Staff", value: "staff" },
                            ]}
                            value={viewQuery.role}
                          />
                        </FilterField>
                      )}

                      <FilterField label="Status">
                        <SelectControl
                          ariaLabel="Filter by status"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("status", value, "all")
                          }
                          options={[
                            { label: "All statuses", value: "all" },
                            { label: "Active", value: "active" },
                            { label: "Inactive", value: "inactive" },
                            { label: "Missing contact", value: "missing_contact" },
                            { label: "No role", value: "no_role" },
                          ]}
                          value={viewQuery.status}
                        />
                      </FilterField>

                      <FilterField label="Archive">
                        <SelectControl
                          ariaLabel="Filter by archive state"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam(
                              "archiveState",
                              value,
                              DEFAULT_PEOPLE_ARCHIVE_STATE,
                            )
                          }
                          options={[
                            { label: "Active records", value: "active" },
                            { label: "Archived", value: "archived" },
                            { label: "All records", value: "all" },
                          ]}
                          value={viewQuery.archiveState}
                        />
                      </FilterField>
                    </FilterSection>

                    <FilterSection
                      description="Adjust ordering and row density for this table."
                      title="Table setup"
                    >
                      <FilterField label="Sort">
                        <SelectControl
                          ariaLabel="Sort people"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam("sort", value, DEFAULT_PEOPLE_SORT)
                          }
                          options={[
                            { label: "Name", value: "name_asc" },
                            { label: "Recently updated", value: "updated_desc" },
                          ]}
                          value={viewQuery.sort}
                        />
                      </FilterField>

                      <FilterField label="Rows">
                        <SelectControl
                          ariaLabel="Rows per page"
                          className={compactSelectClassName}
                          onValueChange={(value) =>
                            replaceParam(
                              "pageSize",
                              value,
                              String(DEFAULT_PEOPLE_PAGE_SIZE),
                            )
                          }
                          options={PEOPLE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                            label: String(pageSize),
                            value: String(pageSize),
                          }))}
                          value={String(viewQuery.pageSize)}
                        />
                      </FilterField>
                    </FilterSection>
                  </div>

                  <div className="flex items-center justify-end border-t border-border px-3 py-2">
                    <Popover.Close asChild>
                      <button
                        className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                        type="button"
                      >
                        Done
                      </button>
                    </Popover.Close>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {hasAnyFilters ? (
              <Link
                aria-label="Reset people filters"
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

function FilterSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-1 text-xs font-medium text-foreground-muted">
      <span>{label}</span>
      {children}
    </div>
  );
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
