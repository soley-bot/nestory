"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type {
  OverviewFinanceView,
  OverviewPropertyPerformanceRow,
} from "@/features/overview/overview.types";
import { formatMoneyDisplay, type CurrencyCode } from "@/lib/money/format";

type PreviewItem = {
  actionHref: string;
  row: OverviewPropertyPerformanceRow;
};

const viewCopy: Record<
  Exclude<OverviewFinanceView, "collections">,
  { actionLabel: string; metricLabel: string; title: string }
> = {
  expenses: {
    actionLabel: "Open property expenses",
    metricLabel: "Paid this month",
    title: "Expenses",
  },
  "management-fees": {
    actionLabel: "Open management fees",
    metricLabel: "Fees earned",
    title: "Management fees",
  },
  "owner-statements": {
    actionLabel: "Open owner statement",
    metricLabel: "Readiness",
    title: "Owner statements",
  },
  transactions: {
    actionLabel: "Open property transactions",
    metricLabel: "Net movement",
    title: "Property transactions",
  },
};

export function FinancePropertyPreviewList({
  currency,
  description,
  items,
  month,
  view,
}: {
  currency: CurrencyCode;
  description: string;
  items: PreviewItem[];
  month: string;
  view: Exclude<OverviewFinanceView, "collections">;
}) {
  const [selectedItem, setSelectedItem] = useState<PreviewItem | null>(null);
  const copy = viewCopy[view];

  return (
    <>
      <section className="overflow-hidden border-y border-border">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">{copy.title} by property</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_140px_200px_20px] gap-3 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-foreground-muted max-md:hidden">
          <span>Property</span>
          <span>{copy.metricLabel}</span>
          <span>Operating context</span>
          <span aria-hidden="true" />
        </div>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <button
              className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring md:grid-cols-[minmax(0,1fr)_140px_200px_20px]"
              key={item.row.propertyId}
              onClick={() => setSelectedItem(item)}
              type="button"
            >
              <span className="min-w-0 truncate text-sm font-semibold">
                {item.row.label}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {primaryValue(item.row, view)}
              </span>
              <span className="hidden truncate text-xs text-foreground-muted md:block">
                {contextValue(item.row, view, currency)}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="hidden text-foreground-muted transition-transform group-hover:translate-x-0.5 md:block"
                size={14}
              />
            </button>
          ))}
        </div>
      </section>

      <Modal
        description={`${copy.title} for ${formatMonthLabel(month)}.`}
        onClose={() => setSelectedItem(null)}
        open={selectedItem !== null}
        title={selectedItem?.row.label ?? `${copy.title} preview`}
      >
        {selectedItem ? (
          <>
            <div className="grid gap-px bg-border sm:grid-cols-2">
              {modalFacts(selectedItem.row, view, currency).map(([label, value]) => (
                <div className="bg-surface px-4 py-3" key={label}>
                  <p className="text-xs text-foreground-muted">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-border px-4 py-3">
              <Link
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                href={selectedItem.actionHref}
              >
                {copy.actionLabel}
                <ArrowRight size={13} />
              </Link>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function primaryValue(
  row: OverviewPropertyPerformanceRow,
  view: Exclude<OverviewFinanceView, "collections">,
) {
  if (view === "expenses") return row.cashExpenses.primary;
  if (view === "management-fees") return row.managementFeeEarned.primary;
  if (view === "owner-statements") {
    return row.statementBlockers === 0
      ? "Ready"
      : `${row.statementBlockers} blocker${row.statementBlockers === 1 ? "" : "s"}`;
  }
  return row.netCash.primary;
}

function contextValue(
  row: OverviewPropertyPerformanceRow,
  view: Exclude<OverviewFinanceView, "collections">,
  currency: CurrencyCode,
) {
  if (view === "expenses") return `Net cash ${row.netCash.primary}`;
  if (view === "management-fees") {
    return `Outstanding ${formatMoneyDisplay(row.managementFeeOutstandingAmount, currency).primary}`;
  }
  if (view === "owner-statements") {
    return row.statementBlockers === 0 ? "Ready to prepare" : "Needs record review";
  }
  return `Income ${row.cashIncome.primary} · Expenses ${row.cashExpenses.primary}`;
}

function modalFacts(
  row: OverviewPropertyPerformanceRow,
  view: Exclude<OverviewFinanceView, "collections">,
  currency: CurrencyCode,
): Array<[string, string]> {
  if (view === "expenses") {
    return [
      ["Expenses paid", row.cashExpenses.primary],
      ["Cash income", row.cashIncome.primary],
      ["Net cash", row.netCash.primary],
      ["Arrears", row.arrears.primary],
    ];
  }
  if (view === "management-fees") {
    return [
      ["Fees earned", row.managementFeeEarned.primary],
      ["Fees received", row.managementFeeReceived.primary],
      [
        "Outstanding",
        formatMoneyDisplay(row.managementFeeOutstandingAmount, currency).primary,
      ],
      ["Units", String(row.unitCount)],
    ];
  }
  if (view === "owner-statements") {
    return [
      ["Statement blockers", String(row.statementBlockers)],
      ["Cash income", row.cashIncome.primary],
      ["Expenses paid", row.cashExpenses.primary],
      ["Net cash", row.netCash.primary],
    ];
  }
  return [
    ["Cash income", row.cashIncome.primary],
    ["Expenses paid", row.cashExpenses.primary],
    ["Net movement", row.netCash.primary],
    ["Arrears", row.arrears.primary],
  ];
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
