"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import type { OverviewScreenData, OverviewViewQuery } from "@/features/overview/overview.types";
import { formatMoneyDisplay } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type SummaryKind = "attention" | "income" | "expense";

export function OverviewSummaryCards({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const [open, setOpen] = useState<SummaryKind | null>(null);
  const summary = data.propertyPerformance.summary;
  const cards = [
    {
      helper: `${data.attentionItems.length} operating queues`,
      icon: CircleAlert,
      kind: "attention" as const,
      label: "Needs attention",
      tone: "warning",
      value: `${data.attentionTotal} open checks`,
    },
    {
      helper: `${summary.collectionRate}% rent collected`,
      icon: TrendingUp,
      kind: "income" as const,
      label: "Income",
      tone: "success",
      value: formatMoneyDisplay(summary.cashIncomeAmount, data.ledgerCurrency).primary,
    },
    {
      helper: `${formatMoneyDisplay(summary.arrearsAmount, data.ledgerCurrency).primary} arrears`,
      icon: TrendingDown,
      kind: "expense" as const,
      label: "Expense",
      tone: "danger",
      value: formatMoneyDisplay(summary.cashExpensesAmount, data.ledgerCurrency).primary,
    },
  ];

  return (
    <>
      <section aria-label="Overview summary" className="grid gap-2 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              className="group flex min-h-24 items-start gap-3 rounded-md border border-border bg-surface p-3 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              key={card.kind}
              onClick={() => setOpen(card.kind)}
              type="button"
            >
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-muted", card.tone === "warning" ? "text-warning" : card.tone === "danger" ? "text-danger" : "text-success")}>
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground-muted">{card.label}</span>
                <span className="mt-1 block text-base font-semibold tabular-nums text-foreground">{card.value}</span>
                <span className="mt-1 block text-xs text-foreground-muted">{card.helper}</span>
              </span>
              <ArrowRight className="mt-1 shrink-0 text-foreground-subtle transition-transform group-hover:translate-x-0.5" size={14} />
            </button>
          );
        })}
      </section>

      <Modal
        description={getModalDescription(open)}
        onClose={() => setOpen(null)}
        open={open !== null}
        title={open === "attention" ? "Needs attention" : open === "income" ? "Income" : "Expense"}
      >
        {open === "attention" ? (
          <ul className="divide-y divide-border">
            {data.attentionItems.map((item) => (
              <li key={item.id}>
                <Link className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-muted" href={item.href}>
                  <Badge tone={item.tone}>{item.count}</Badge>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-foreground-muted">{item.helper}</span></span>
                  <span className="text-xs font-medium">{item.actionLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <dl className="divide-y divide-border">
            {(open === "income"
              ? [
                  ["Cash income", formatMoneyDisplay(summary.cashIncomeAmount, data.ledgerCurrency).primary],
                  ["Rent collected", `${summary.collectionRate}%`],
                  ["Net cash", formatMoneyDisplay(summary.netCashAmount, data.ledgerCurrency).primary],
                  ["Management fee earned", formatMoneyDisplay(summary.managementFeeEarnedAmount, data.ledgerCurrency).primary],
                ]
              : [
                  ["Expenses paid", formatMoneyDisplay(summary.cashExpensesAmount, data.ledgerCurrency).primary],
                  ["Arrears", formatMoneyDisplay(summary.arrearsAmount, data.ledgerCurrency).primary],
                  ["Net cash", formatMoneyDisplay(summary.netCashAmount, data.ledgerCurrency).primary],
                  ["Statement blockers", String(summary.statementReadiness.blockedCount)],
                ]
            ).map(([label, value]) => (
              <div className="flex items-center justify-between gap-4 px-4 py-3" key={label}>
                <dt className="text-sm text-foreground-muted">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="border-t border-border px-4 py-3">
          <Link className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline" href={open === "attention" ? `/overview/attention?month=${query.month}` : `/overview?lens=finance&financeView=${open === "expense" ? "expenses" : "collections"}&month=${query.month}`}>
            Open full workspace <ArrowRight size={13} />
          </Link>
        </div>
      </Modal>
    </>
  );
}

function getModalDescription(kind: SummaryKind | null) {
  if (kind === "attention") return "Open operating checks across the portfolio.";
  if (kind === "income") return "Cash received and collection performance for the selected month.";
  return "Cash paid, arrears, and reporting blockers for the selected month.";
}
