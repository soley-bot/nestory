import Link from "next/link";
import { buildOverviewHref } from "@/features/overview/components/overview-header";
import { PropertyScorecard } from "@/features/overview/components/property-scorecard";
import type {
  OverviewFinanceView,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

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
        <PropertyScorecard query={query} rows={data.propertyPerformance.rows} />
      ) : (
        <FinanceQueue query={query} />
      )}
    </div>
  );
}

function FinanceQueue({ query }: { query: OverviewViewQuery }) {
  const content: Record<
    Exclude<OverviewFinanceView, "collections">,
    { description: string; href: string; label: string }
  > = {
    expenses: {
      description:
        "Review paid property costs and open bills for the selected month.",
      href: "/bills-expenses",
      label: "Open property expenses",
    },
    "management-fees": {
      description:
        "Track earned, received, and outstanding management fees as property operating costs.",
      href: "/rent-income?query=management",
      label: "Open management fees",
    },
    "owner-statements": {
      description:
        "Review readiness and prepare cash-basis statements for property owners.",
      href: "/reports/owner-statement",
      label: "Open owner statements",
    },
    transactions: {
      description:
        "Inspect source property receipts and payments without company ledger framing.",
      href: "/ledger",
      label: "Open property transactions",
    },
  };
  if (query.financeView === "collections") return null;
  const item = content[query.financeView];
  const params = new URLSearchParams({ month: query.month });
  if (query.propertyId !== "all") params.set("propertyId", query.propertyId);
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {views.find((view) => view.value === query.financeView)?.label}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
        {item.description}
      </p>
      <Link
        className="mt-3 inline-block rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
        href={`${item.href}${item.href.includes("?") ? "&" : "?"}${params.toString()}`}
      >
        {item.label}
      </Link>
    </section>
  );
}
