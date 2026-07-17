"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowRight, Search } from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import type {
  OverviewPropertyPerformanceRow,
  OverviewPropertySort,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

export type PropertyPreviewContext = {
  actionHref: string;
  actionLabel: string;
  description: string;
  title: string;
};

export function PropertyScorecard({
  previewContext,
  query,
  rows,
}: {
  previewContext?: PropertyPreviewContext;
  query: OverviewViewQuery;
  rows: OverviewPropertyPerformanceRow[];
}) {
  const [selectedRow, setSelectedRow] =
    useState<OverviewPropertyPerformanceRow | null>(null);
  const [propertySearch, setPropertySearch] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const visibleRows = sortPropertyRows(rows, query);

  function openSearchResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needle = propertySearch.trim().toLocaleLowerCase();
    const match =
      rows.find((row) => row.label.toLocaleLowerCase() === needle) ??
      rows.find((row) => row.label.toLocaleLowerCase().includes(needle));

    if (!needle || !match) {
      setSearchMessage(
        needle ? "No matching property." : "Choose or enter a property.",
      );
      return;
    }

    setSearchMessage("");
    setSelectedRow(match);
  }

  return (
    <>
      <section className="min-w-0 overflow-hidden border-y border-border">
        <div className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2">
          <div className="mr-auto min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Property performance
            </h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Cash received and paid in the selected month.
            </p>
          </div>
          <form
            className="flex w-full gap-1.5 sm:w-auto"
            onSubmit={openSearchResult}
            role="search"
          >
            <Input
              className="min-w-0 sm:w-64"
              list="overview-property-options"
              onChange={(event) => {
                setPropertySearch(event.target.value);
                setSearchMessage("");
              }}
              placeholder="Find a property…"
              type="search"
              value={propertySearch}
            />
            <datalist id="overview-property-options">
              {rows.map((row) => (
                <option key={row.propertyId} value={row.label} />
              ))}
            </datalist>
            <Button
              aria-label="Search properties"
              className="w-8 shrink-0 px-0"
              type="submit"
            >
              <Search size={14} />
            </Button>
          </form>
          {searchMessage ? (
            <p className="w-full text-right text-xs text-danger" role="status">
              {searchMessage}
            </p>
          ) : null}
        </div>
        {visibleRows.length === 0 ? (
          <p className="px-3 py-6 text-sm text-foreground-muted">
            No properties match this review.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="border-b border-border text-foreground-muted">
                  <tr>
                    <SortableHeader
                      label="Property"
                      query={query}
                      reverseSort="property-desc"
                      sort="property-asc"
                    />
                    <SortableHeader
                      label="Collected"
                      query={query}
                      sort="collected-desc"
                    />
                    <SortableHeader label="Income" query={query} sort="income-desc" />
                    <SortableHeader
                      label="Expenses"
                      query={query}
                      sort="expenses-desc"
                    />
                    <SortableHeader label="Net cash" query={query} sort="net-desc" />
                    <SortableHeader
                      label="Management fee"
                      query={query}
                      sort="fee-desc"
                    />
                    <th className="h-10 px-3 py-2 font-medium">Budget</th>
                    <th className="h-10 px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleRows.map((row) => (
                    <DesktopRow
                      key={row.propertyId}
                      onOpen={setSelectedRow}
                      query={query}
                      row={row}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div
              aria-label="Property performance cards"
              className="divide-y divide-border md:hidden"
              role="region"
            >
              {visibleRows.map((row) => (
                <MobileCard
                  key={row.propertyId}
                  onOpen={setSelectedRow}
                  query={query}
                  row={row}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <PropertyPreviewModal
        onClose={() => setSelectedRow(null)}
        previewContext={previewContext}
        query={query}
        row={selectedRow}
      />
    </>
  );
}

function SortableHeader({
  label,
  query,
  reverseSort,
  sort,
}: {
  label: string;
  query: OverviewViewQuery;
  reverseSort?: OverviewPropertySort;
  sort: OverviewPropertySort;
}) {
  const currentSort = query.sort ?? "property-asc";
  const active = currentSort === sort || currentSort === reverseSort;
  const nextSort = currentSort === sort && reverseSort ? reverseSort : sort;
  const direction = currentSort === "property-asc" ? "ascending" : "descending";

  return (
    <th
      aria-sort={active ? direction : "none"}
      className="h-10 px-3 py-2 font-medium"
    >
      <Link
        className="inline-flex items-center gap-1 hover:text-foreground"
        href={buildOverviewHref(query, { sort: nextSort })}
      >
        {label}
        <ArrowDownUp aria-hidden="true" size={12} />
      </Link>
    </th>
  );
}

export function sortPropertyRows(
  rows: OverviewPropertyPerformanceRow[],
  query: OverviewViewQuery,
) {
  const sorted = [...rows];
  const sort = query.sort ?? "property-asc";

  return sorted.sort((left, right) => {
    switch (sort) {
      case "property-desc":
        return right.label.localeCompare(left.label);
      case "collected-desc":
        return right.collectionRate - left.collectionRate;
      case "income-desc":
        return right.cashIncomeAmount - left.cashIncomeAmount;
      case "expenses-desc":
        return right.cashExpensesAmount - left.cashExpensesAmount;
      case "net-desc":
        return right.netCashAmount - left.netCashAmount;
      case "fee-desc":
        return right.managementFeeEarnedAmount - left.managementFeeEarnedAmount;
      default:
        return left.label.localeCompare(right.label);
    }
  });
}

function DesktopRow({
  onOpen,
  query,
  row,
}: {
  onOpen: (row: OverviewPropertyPerformanceRow) => void;
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow;
}) {
  const selected = query.propertyId === row.propertyId;

  return (
    <tr className={cn("h-16", selected ? "bg-background" : undefined)}>
      <td className="max-w-64 px-3 py-2">
        <PropertyPreviewButton onOpen={onOpen} row={row} />
      </td>
      <td className="px-3 py-2 tabular-nums">{row.collectionRate}%</td>
      <td className="px-3 py-2"><MoneyDisplay value={row.cashIncome} /></td>
      <td className="px-3 py-2"><MoneyDisplay value={row.cashExpenses} /></td>
      <td className="px-3 py-2"><MoneyDisplay value={row.netCash} /></td>
      <td className="px-3 py-2"><MoneyDisplay value={row.managementFeeEarned} /></td>
      <td className="px-3 py-2 text-foreground-muted">Not set</td>
      <td className="px-3 py-2"><StatusBadge row={row} /></td>
    </tr>
  );
}

function MobileCard({
  onOpen,
  query,
  row,
}: {
  onOpen: (row: OverviewPropertyPerformanceRow) => void;
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow;
}) {
  return (
    <article
      className={cn(
        "p-3",
        query.propertyId === row.propertyId ? "bg-background" : undefined,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PropertyPreviewButton onOpen={onOpen} row={row} />
        <StatusBadge row={row} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Fact label="Collected" value={`${row.collectionRate}%`} />
        <Fact label="Income" value={row.cashIncome.primary} />
        <Fact label="Expenses" value={row.cashExpenses.primary} />
        <Fact label="Net cash" value={row.netCash.primary} />
        <Fact label="Management fee" value={row.managementFeeEarned.primary} />
        <Fact label="Budget" value="Not set" />
      </dl>
    </article>
  );
}

function PropertyPreviewButton({
  onOpen,
  row,
}: {
  onOpen: (row: OverviewPropertyPerformanceRow) => void;
  row: OverviewPropertyPerformanceRow;
}) {
  return (
    <div className="min-w-0">
      <button
        className="block max-w-full truncate text-left font-semibold text-foreground underline-offset-2 hover:underline"
        onClick={() => onOpen(row)}
        title={`Preview ${row.label}`}
        type="button"
      >
        {row.label}
      </button>
      <span className="mt-0.5 block text-xs text-foreground-muted">
        Preview property
      </span>
    </div>
  );
}

function PropertyPreviewModal({
  onClose,
  previewContext,
  query,
  row,
}: {
  onClose: () => void;
  previewContext?: PropertyPreviewContext;
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow | null;
}) {
  return (
    <Modal
      description={`Cash performance for ${formatMonthLabel(query.month)}.`}
      onClose={onClose}
      open={row !== null}
      title={row?.label ?? "Property preview"}
    >
      {row ? (
        <>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            <PreviewFact label="Collected" value={`${row.collectionRate}%`} />
            <PreviewFact label="Cash income" value={row.cashIncome.primary} />
            <PreviewFact label="Expenses" value={row.cashExpenses.primary} />
            <PreviewFact label="Net cash" value={row.netCash.primary} />
            <PreviewFact label="Management fee" value={row.managementFeeEarned.primary} />
            <PreviewFact label="Arrears" value={row.arrears.primary} />
          </div>
          {previewContext ? (
            <section className="border-t border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{previewContext.title}</h3>
              <p className="mt-1 text-xs leading-5 text-foreground-muted">
                {previewContext.description}
              </p>
              <Link
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                href={previewContext.actionHref}
              >
                {previewContext.actionLabel}
                <ArrowRight size={13} />
              </Link>
            </section>
          ) : null}
          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <StatusBadge row={row} />
            <Link
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
              href={row.href}
            >
              Open full property record
              <ArrowRight size={13} />
            </Link>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function StatusBadge({ row }: { row: OverviewPropertyPerformanceRow }) {
  const values = {
    healthy: ["success", "Healthy"],
    attention: ["warning", "Attention"],
    arrears: ["warning", "Arrears"],
    loss: ["danger", "Negative cash"],
  } as const;
  const [tone, label] = values[row.status];
  return <Badge tone={tone}>{label}</Badge>;
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
