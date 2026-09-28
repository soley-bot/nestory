"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchCombo } from "@/components/ui/search-combo";
import { useRegisterSearch } from "@/components/ui/use-register-search";
import { matchesSearchText } from "@/lib/search/text";
import { SelectControl } from "@/components/ui/select-control";
import type { PropertyFinancePosition, TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";

type RentSearchParams = Pick<URLSearchParams, "get" | "toString">;

type VisibleTenantInvoiceStatus = Exclude<
  TenantInvoiceSummary["paymentStatus"],
  "voided"
>;

type RentInvoiceFilters = {
  duePeriod: "all" | "next_7_days" | "overdue" | "this_month" | "today";
  overdueDays: "all" | "7" | "30" | "60";
  propertyId: string;
  query: string;
  sort: "balance_desc" | "default" | "due_asc" | "due_desc" | "tenant_asc";
  status: "all" | "open" | VisibleTenantInvoiceStatus;
};

const RENT_STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Open", value: "open" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Partly paid", value: "partly_paid" },
  { label: "Paid", value: "paid" },
];
const RENT_DUE_OPTIONS = [
  { label: "Any due date", value: "all" },
  { label: "Overdue", value: "overdue" },
  { label: "Due today", value: "today" },
  { label: "Due in next 7 days", value: "next_7_days" },
  { label: "Due this month", value: "this_month" },
];
const RENT_AGING_OPTIONS = [
  { label: "Any overdue age", value: "all" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "60 days", value: "60" },
];
const RENT_SORT_OPTIONS = [
  { label: "Current order", value: "default" },
  { label: "Due date · oldest", value: "due_asc" },
  { label: "Due date · newest", value: "due_desc" },
  { label: "Balance · highest", value: "balance_desc" },
  { label: "Tenant · A to Z", value: "tenant_asc" },
];

export function isVisibleTenantInvoice(invoice: TenantInvoiceSummary) {
  return invoice.paymentStatus !== "voided";
}

export function RentInvoiceFilterBar({
  invoices,
  resultCount,
}: {
  invoices: TenantInvoiceSummary[];
  resultCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = getRentInvoiceFilters(searchParams);
  const visibleInvoices = invoices.filter(isVisibleTenantInvoice);
  const propertyOptions = uniqueRentPropertyOptions(visibleInvoices);
  const activeAdvancedFilterCount = countAdvancedFilters(filters);
  const filtersActive = filters.query.length > 0 || activeAdvancedFilterCount > 0;
  const replaceFilters = (updates: Record<string, string>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || value === "default") {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    }
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const search = useRegisterSearch(filters.query, (value) => replaceFilters({ q: value }));

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
          <SearchCombo
            ariaLabel="Search rent invoices"
            onQueryChange={search.onQueryChange}
            onCompositionChange={search.onCompositionChange}
            onSubmit={search.onSubmit}
            placeholder="Search property, unit, owner, tenant or invoice"
            query={search.query}
            submitLabel="Search rent invoices"
          />
          {filtersActive ? (
            <Button
              onClick={() =>
                replaceFilters({
                  due: "all",
                  overdueDays: "all",
                  property: "all",
                  q: "",
                  sort: "default",
                  status: "all",
                })
              }
              size="sm"
              variant="ghost"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        <details
          className="border-t border-border"
          open={activeAdvancedFilterCount > 0}
        >
          <summary className="flex min-h-8 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <span>Filters</span>
            {activeAdvancedFilterCount > 0 ? (
              <Badge tone="neutral">{activeAdvancedFilterCount}</Badge>
            ) : null}
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="Property">
              <SelectControl
                ariaLabel="Property"
                onValueChange={(value) => replaceFilters({ property: value })}
                options={[
                  { label: "All properties", value: "all" },
                  ...propertyOptions.map((property) => ({
                    label: property.label,
                    value: property.id,
                  })),
                ]}
                value={filters.propertyId}
              />
            </FilterField>
            <FilterField label="Invoice status">
              <SelectControl
                ariaLabel="Invoice status"
                onValueChange={(value) => replaceFilters({ status: value })}
                options={RENT_STATUS_OPTIONS}
                value={filters.status}
              />
            </FilterField>
            <FilterField label="Due period">
              <SelectControl
                ariaLabel="Due period"
                onValueChange={(value) => replaceFilters({ due: value })}
                options={RENT_DUE_OPTIONS}
                value={filters.duePeriod}
              />
            </FilterField>
            <FilterField label="Overdue at least">
              <SelectControl
                ariaLabel="Overdue at least"
                onValueChange={(value) => replaceFilters({ overdueDays: value })}
                options={RENT_AGING_OPTIONS}
                value={filters.overdueDays}
              />
            </FilterField>
            <FilterField label="Sort invoices">
              <SelectControl
                ariaLabel="Sort invoices"
                onValueChange={(value) => replaceFilters({ sort: value })}
                options={RENT_SORT_OPTIONS}
                value={filters.sort}
              />
            </FilterField>
          </div>
        </details>
      </div>
      {filtersActive ? (
        <p className="text-xs text-muted-foreground" role="status">
          Showing {resultCount} of {visibleInvoices.length}{" "}
          {visibleInvoices.length === 1 ? "invoice" : "invoices"}
        </p>
      ) : null}
    </>
  );
}

export function getRentInvoiceView(
  invoices: TenantInvoiceSummary[],
  searchParams: RentSearchParams,
  businessDate: string,
  positions: PropertyFinancePosition[] = [],
) {
  const filters = getRentInvoiceFilters(searchParams);
  return {
    filteredInvoices: filterAndSortRentInvoices(
      invoices.filter(isVisibleTenantInvoice),
      filters,
      businessDate,
      positions,
    ),
  };
}

function getRentInvoiceFilters(searchParams: RentSearchParams): RentInvoiceFilters {
  return {
    duePeriod: oneOf(
      searchParams.get("due"),
      ["all", "next_7_days", "overdue", "this_month", "today"] as const,
      "all",
    ),
    overdueDays: oneOf(
      searchParams.get("overdueDays"),
      ["all", "7", "30", "60"] as const,
      "all",
    ),
    propertyId: searchParams.get("property")?.trim() || "all",
    query: searchParams.get("q")?.trim() ?? "",
    sort: oneOf(
      searchParams.get("sort"),
      ["balance_desc", "default", "due_asc", "due_desc", "tenant_asc"] as const,
      "default",
    ),
    status: oneOf(
      searchParams.get("status"),
      ["all", "open", "paid", "partly_paid", "unpaid"] as const,
      "all",
    ),
  };
}

function filterAndSortRentInvoices(
  invoices: TenantInvoiceSummary[],
  filters: RentInvoiceFilters,
  businessDate: string,
  positions: PropertyFinancePosition[] = [],
) {
  const query = filters.query.toLocaleLowerCase();
  const positionsById = new Map(positions.map(position => [position.propertyId, position]));
  const businessDay = Date.parse(`${businessDate}T00:00:00Z`);
  const filtered = invoices.filter((invoice) => {
    if (
      query &&
      !matchesSearchText(query, [
        positionsById.get(invoice.propertyId)?.ownerLabel,
        positionsById.get(invoice.propertyId)?.propertyLabel,
        ...(positionsById.get(invoice.propertyId)?.ownerSearchLabels ?? []),
        invoice.invoiceNumber,
        invoice.recipientLabel,
        invoice.propertyLabel,
        invoice.unitLabel,
        ...invoice.occupantLabels,
      ])
    ) {
      return false;
    }
    if (filters.propertyId !== "all" && invoice.propertyId !== filters.propertyId) {
      return false;
    }
    if (
      filters.status === "open" &&
      invoice.paymentStatus !== "unpaid" &&
      invoice.paymentStatus !== "partly_paid"
    ) {
      return false;
    }
    if (
      filters.status !== "all" &&
      filters.status !== "open" &&
      invoice.paymentStatus !== filters.status
    ) {
      return false;
    }
    const isOpen =
      invoice.balanceDue > 0 &&
      (invoice.paymentStatus === "unpaid" ||
        invoice.paymentStatus === "partly_paid");
    if (
      (filters.duePeriod === "overdue" || filters.overdueDays !== "all") &&
      !isOpen
    ) {
      return false;
    }
    const dueDay = Date.parse(`${invoice.dueDate}T00:00:00Z`);
    const daysUntilDue = Math.round((dueDay - businessDay) / 86_400_000);
    if (filters.duePeriod === "overdue" && daysUntilDue >= 0) return false;
    if (filters.duePeriod === "today" && daysUntilDue !== 0) return false;
    if (
      filters.duePeriod === "next_7_days" &&
      (daysUntilDue < 0 || daysUntilDue > 7)
    ) {
      return false;
    }
    if (
      filters.duePeriod === "this_month" &&
      !invoice.dueDate.startsWith(businessDate.slice(0, 7))
    ) {
      return false;
    }
    if (
      filters.overdueDays !== "all" &&
      -daysUntilDue < Number(filters.overdueDays)
    ) {
      return false;
    }
    return true;
  });
  if (filters.sort === "default") return filtered;
  return [...filtered].sort((left, right) => {
    if (filters.sort === "due_asc") return left.dueDate.localeCompare(right.dueDate);
    if (filters.sort === "due_desc") return right.dueDate.localeCompare(left.dueDate);
    if (filters.sort === "balance_desc") return right.balanceDue - left.balanceDue;
    return left.recipientLabel.localeCompare(right.recipientLabel);
  });
}

function countAdvancedFilters(filters: RentInvoiceFilters) {
  return [
    filters.propertyId,
    filters.status,
    filters.duePeriod,
    filters.overdueDays,
    filters.sort,
  ].filter((value) => value !== "all" && value !== "default").length;
}

function uniqueRentPropertyOptions(invoices: TenantInvoiceSummary[]) {
  return [
    ...new Map(
      invoices.map((invoice) => [
        invoice.propertyId,
        { id: invoice.propertyId, label: invoice.propertyLabel },
      ]),
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label));
}

function oneOf<const T extends readonly string[]>(
  value: string | null,
  options: T,
  fallback: T[number],
): T[number] {
  return options.includes(value as T[number]) ? (value as T[number]) : fallback;
}

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
