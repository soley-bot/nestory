import Link from "next/link";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { buildOverviewHref } from "@/features/overview/components/overview-header";
import type {
  OverviewPropertyPerformanceRow,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { formatMoneyDisplay, type CurrencyCode } from "@/lib/money/format";

export function PropertyPerformanceDetail({
  currency,
  query,
  row,
}: {
  currency: CurrencyCode;
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow;
}) {
  const reportParams = new URLSearchParams({
    month: query.month,
    propertyId: row.propertyId,
  });
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {row.label}
          </h2>
          <p className="text-xs text-foreground-muted">
            Selected property cash detail
          </p>
        </div>
        {row.statementBlockers === 0 ? (
          <Link
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
            href={`/reports/owner-statement?${reportParams.toString()}`}
          >
            Open owner statement
          </Link>
        ) : (
          <Badge tone="warning">
            {row.statementBlockers} statement blockers
          </Badge>
        )}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <dl className="divide-y divide-border rounded-md border border-border">
          <DetailRow
            href={buildOverviewHref(query, {
              financeView: "collections",
              lens: "finance",
              propertyId: row.propertyId,
              review: "all",
            })}
            label="Cash income"
            value={row.cashIncome}
          />
          <DetailRow
            href={buildOverviewHref(query, {
              financeView: "expenses",
              lens: "finance",
              propertyId: row.propertyId,
              review: "all",
            })}
            label="Property expenses paid"
            value={row.cashExpenses}
          />
          <DetailRow
            href={buildOverviewHref(query, {
              financeView: "management-fees",
              lens: "finance",
              propertyId: row.propertyId,
              review: "all",
            })}
            label="Management fee"
            value={row.managementFeeEarned}
          />
          <DetailRow
            href={buildOverviewHref(query, {
              financeView: "collections",
              lens: "finance",
              propertyId: row.propertyId,
              review: "arrears",
            })}
            label="Arrears"
            value={row.arrears}
          />
        </dl>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-foreground-muted">Security deposit held</p>
          <MoneyDisplay
            className="mt-1"
            size="large"
            value={formatMoneyDisplay(row.securityDepositHeldAmount, currency)}
          />
          <p className="mt-2 text-xs leading-5 text-foreground-muted">
            Held tenant funds are separate from income and net cash.
          </p>
        </div>
      </div>
    </section>
  );
}

function DetailRow({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: OverviewPropertyPerformanceRow["cashIncome"];
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt>
        <Link
          className="text-xs text-foreground underline-offset-2 hover:underline"
          href={href}
        >
          {label}
        </Link>
      </dt>
      <dd>
        <MoneyDisplay align="right" value={value} />
      </dd>
    </div>
  );
}
