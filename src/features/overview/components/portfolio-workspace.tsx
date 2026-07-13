import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PropertyPerformanceDetail } from "@/features/overview/components/property-performance-detail";
import { PropertyScorecard } from "@/features/overview/components/property-scorecard";
import type {
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { formatMoneyDisplay } from "@/lib/money/format";

export function PortfolioWorkspace({
  data,
  query,
}: {
  data: OverviewScreenData;
  query: OverviewViewQuery;
}) {
  const selected =
    data.propertyPerformance.rows.find(
      (row) => row.propertyId === query.propertyId,
    ) ?? data.propertyPerformance.rows[0];
  const summary = data.propertyPerformance.summary;
  const metrics = [
    [
      "Net cash",
      formatMoneyDisplay(summary.netCashAmount, data.ledgerCurrency).primary,
    ],
    ["Rent collected", `${summary.collectionRate}%`],
    [
      "Cash income",
      formatMoneyDisplay(summary.cashIncomeAmount, data.ledgerCurrency).primary,
    ],
    [
      "Expenses paid",
      formatMoneyDisplay(summary.cashExpensesAmount, data.ledgerCurrency)
        .primary,
    ],
    [
      "Arrears",
      formatMoneyDisplay(summary.arrearsAmount, data.ledgerCurrency).primary,
    ],
  ];
  return (
    <div className="space-y-3">
      <section
        aria-label="Portfolio cash metrics"
        className="grid overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map(([label, value]) => (
          <div
            className="border-b border-border px-3 py-2.5 last:border-b-0 sm:border-r xl:border-b-0"
            key={label}
          >
            <p className="text-xs text-foreground-muted">{label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {value}
            </p>
          </div>
        ))}
      </section>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <PropertyScorecard query={query} rows={data.propertyPerformance.rows} />
        <aside className="rounded-lg border border-border bg-surface p-3">
          <h2 className="text-sm font-semibold text-foreground">
            Statement readiness
          </h2>
          <div className="mt-3 flex items-center gap-2">
            <Badge
              tone={
                summary.statementReadiness.blockedCount > 0
                  ? "warning"
                  : "success"
              }
            >
              {summary.statementReadiness.readyCount} ready
            </Badge>
            <span className="text-xs text-foreground-muted">
              of {summary.statementReadiness.totalCount}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-foreground-muted">
            {summary.statementReadiness.blockedCount > 0
              ? `${summary.statementReadiness.blockedCount} properties need review before statements are ready.`
              : "All visible properties pass the current readiness checks."}
          </p>
          <Link
            className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline"
            href={`/overview?month=${query.month}&review=statement-blocked`}
          >
            Review blockers
          </Link>
        </aside>
      </div>
      {selected ? (
        <PropertyPerformanceDetail
          currency={data.ledgerCurrency}
          query={query}
          row={selected}
        />
      ) : null}
    </div>
  );
}
