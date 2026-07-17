import Link from "next/link";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import { FinancePropertyPreviewList } from "@/features/overview/components/finance-property-preview-list";
import { PropertyScorecard } from "@/features/overview/components/property-scorecard";
import type {
  OverviewFinanceView,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";
import { formatMoneyDisplay } from "@/lib/money/format";

const views: Array<{ label: string; value: OverviewFinanceView }> = [
  { label: "Collections", value: "collections" },
  { label: "Expenses", value: "expenses" },
  { label: "Management fees", value: "management-fees" },
  { label: "Owner statements", value: "owner-statements" },
  { label: "Property transactions", value: "transactions" },
];

export function PropertyFinanceWorkspace({
  data,
  query,
}: {
  data: OverviewScreenData;
  query: OverviewViewQuery;
}) {
  return (
    <div className="space-y-3">
      <FinanceMetricStrip data={data} />
      <nav
        aria-label="Property finance views"
        className="flex min-w-0 gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
      >
        {views.map((view) => (
          <Link
            aria-current={query.financeView === view.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium",
              query.financeView === view.value
                ? "border-border bg-background text-foreground"
                : "border-transparent text-foreground-muted hover:border-border hover:bg-background",
            )}
            href={buildOverviewHref(query, {
              financeView: view.value,
              lens: "finance",
            })}
            key={view.value}
          >
            {view.label}
          </Link>
        ))}
      </nav>
      {query.financeView === "collections" ? (
        <PropertyScorecard
          previewContext={{
            actionHref: buildOverviewHref(query, { review: "arrears" }),
            actionLabel: "Review arrears",
            description: `${formatMoneyDisplay(data.propertyPerformance.summary.arrearsAmount, data.ledgerCurrency).primary} remains uncollected across visible properties.`,
            title: "Attention and readiness",
          }}
          query={query}
          rows={rankFinanceRows(data.propertyPerformance.rows, "collections")}
        />
      ) : <FinanceQueue data={data} query={query} />}
    </div>
  );
}

function FinanceMetricStrip({ data }: { data: OverviewScreenData }) {
  const summary = data.propertyPerformance.summary;
  const metrics = [
    ["Cash income", summary.cashIncomeAmount], ["Expenses paid", summary.cashExpensesAmount],
    ["Management fees earned", summary.managementFeeEarnedAmount], ["Arrears", summary.arrearsAmount],
  ] as const;
  return <section aria-label="Property finance metrics" className="grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <div className="border-b border-border px-3 py-2.5 sm:border-r xl:border-b-0" key={label}><p className="text-xs text-foreground-muted">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatMoneyDisplay(value, data.ledgerCurrency).primary}</p></div>)}</section>;
}

function FinanceQueue({ data, query }: { data: OverviewScreenData; query: OverviewViewQuery }) {
  const content: Record<
    Exclude<OverviewFinanceView, "collections">,
    { description: string; href: string }
  > = {
    expenses: {
      description:
        "Review paid property costs and open bills for the selected month.",
      href: "/bills-expenses?dateBasis=paid&status=paid",
    },
    "management-fees": {
      description:
        "Track earned, received, and outstanding management fees as property operating costs.",
      href: "/rent-income?incomeScope=management-fees",
    },
    "owner-statements": {
      description:
        "Review readiness and prepare cash-basis statements for property owners.",
      href: "/reports/owner-statement",
    },
    transactions: {
      description:
        "Inspect source property receipts and payments without company ledger framing.",
      href: "/ledger",
    },
  };
  if (query.financeView === "collections") return null;
  const item = content[query.financeView];
  const rows = rankFinanceRows(data.propertyPerformance.rows, query.financeView);
  return (
    <FinancePropertyPreviewList
      currency={data.ledgerCurrency}
      description={item.description}
      items={rows.map((row) => ({
        actionHref: financeDestinationHref(item.href, query.month, row.propertyId),
        row,
      }))}
      month={query.month}
      view={query.financeView}
    />
  );
}

export function rankFinanceRows(rows: OverviewScreenData["propertyPerformance"]["rows"], view: OverviewFinanceView) {
  const ranked = [...rows];
  const tie = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.label.localeCompare(b.label) || a.propertyId.localeCompare(b.propertyId);
  return ranked.sort((a, b) => {
    if (view === "collections") return b.arrearsAmount - a.arrearsAmount || a.collectionRate - b.collectionRate || tie(a, b);
    if (view === "expenses") return b.cashExpensesAmount - a.cashExpensesAmount || tie(a, b);
    if (view === "management-fees") return b.managementFeeOutstandingAmount - a.managementFeeOutstandingAmount || (b.managementFeeReceivedAmount / Math.max(b.managementFeeEarnedAmount, 1)) - (a.managementFeeReceivedAmount / Math.max(a.managementFeeEarnedAmount, 1)) || tie(a, b);
    if (view === "owner-statements") return b.statementBlockers - a.statementBlockers || tie(a, b);
    return Math.abs(b.cashIncomeAmount) + Math.abs(b.cashExpensesAmount) - Math.abs(a.cashIncomeAmount) - Math.abs(a.cashExpensesAmount) || tie(a, b);
  });
}

function financeDestinationHref(base: string, month: string, propertyId: string) {
  const [path, search = ""] = base.split("?");
  const params = new URLSearchParams(search);
  params.set("month", month);
  params.set("propertyId", propertyId);
  return `${path}?${params.toString()}`;
}
