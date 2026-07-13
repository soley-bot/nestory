import Link from "next/link";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { buildOverviewHref } from "@/features/overview/components/overview-header";
import type {
  OverviewPropertyPerformanceRow,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

export function PropertyScorecard({
  query,
  rows,
}: {
  query: OverviewViewQuery;
  rows: OverviewPropertyPerformanceRow[];
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          Property performance
        </h2>
        <p className="mt-0.5 text-xs text-foreground-muted">
          Cash received and paid in the selected month.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-sm text-foreground-muted">
          No properties match this review.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-border text-foreground-muted">
                <tr>
                  {[
                    "Property",
                    "Collected",
                    "Income",
                    "Expenses",
                    "Net cash",
                    "Management fee",
                    "Budget",
                    "Status",
                  ].map((label) => (
                    <th className="px-3 py-2 font-medium" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <DesktopRow key={row.propertyId} query={query} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <div
            aria-label="Property performance cards"
            className="divide-y divide-border md:hidden"
            role="region"
          >
            {rows.map((row) => (
              <MobileCard key={row.propertyId} query={query} row={row} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DesktopRow({
  query,
  row,
}: {
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow;
}) {
  const selected = query.propertyId === row.propertyId;
  return (
    <tr className={cn(selected ? "bg-background" : undefined)}>
      <td className="max-w-64 px-3 py-2.5">
        <PropertyLinks query={query} row={row} />
      </td>
      <td className="px-3 py-2.5 tabular-nums">{row.collectionRate}%</td>
      <td className="px-3 py-2.5">
        <MoneyDisplay value={row.cashIncome} />
      </td>
      <td className="px-3 py-2.5">
        <MoneyDisplay value={row.cashExpenses} />
      </td>
      <td className="px-3 py-2.5">
        <MoneyDisplay value={row.netCash} />
      </td>
      <td className="px-3 py-2.5">
        <MoneyDisplay value={row.managementFeeEarned} />
      </td>
      <td className="px-3 py-2.5 text-foreground-muted">Not set</td>
      <td className="px-3 py-2.5">
        <StatusBadge row={row} />
      </td>
    </tr>
  );
}

function MobileCard({
  query,
  row,
}: {
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
        <PropertyLinks query={query} row={row} />
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

function PropertyLinks({
  query,
  row,
}: {
  query: OverviewViewQuery;
  row: OverviewPropertyPerformanceRow;
}) {
  return (
    <div className="min-w-0">
      <Link
        className="block truncate font-semibold text-foreground underline-offset-2 hover:underline"
        href={buildOverviewHref(query, { propertyId: row.propertyId })}
      >
        {row.label}
      </Link>
      <Link
        className="mt-0.5 inline-block text-[11px] text-foreground-muted underline-offset-2 hover:underline"
        href={row.href}
      >
        Open property record
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-foreground">
        {value}
      </dd>
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
