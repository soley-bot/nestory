import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type {
  OverviewLens,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

const lenses: Array<{ label: string; value: OverviewLens }> = [
  { label: "Portfolio", value: "all" },
  { label: "Property finance", value: "finance" },
  { label: "Leasing", value: "leasing" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Records", value: "records" },
];

export function OverviewHeader({
  attentionTotal,
  query,
}: {
  attentionTotal: number;
  query: OverviewViewQuery;
}) {
  return (
    <header className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="mr-auto min-w-0">
          <h1 className="text-sm font-semibold text-foreground">Overview</h1>
          <p className="text-xs text-foreground-muted">
            {formatMonth(query.month)}
          </p>
        </div>
        <Badge tone={attentionTotal > 0 ? "warning" : "success"}>
          {attentionTotal > 0
            ? `${attentionTotal} open ${attentionTotal === 1 ? "check" : "checks"}`
            : "No open checks"}
        </Badge>
        <Badge tone="neutral">Cash basis</Badge>
      </div>
      <nav
        aria-label="Overview lenses"
        className="flex min-w-0 gap-1 overflow-x-auto p-1"
      >
        {lenses.map((lens) => {
          const active = lens.value === query.lens;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1.5 text-[13px] font-medium text-foreground",
                active
                  ? "border-border bg-background"
                  : "border-transparent text-foreground-muted hover:border-border hover:bg-background",
              )}
              href={buildLensHref(query, lens.value)}
              key={lens.value}
            >
              {lens.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function buildOverviewHref(
  query: OverviewViewQuery,
  updates: Partial<OverviewViewQuery>,
) {
  const next = { ...query, ...updates };
  const params = new URLSearchParams();
  if (next.lens === "finance") {
    params.set("lens", next.lens);
    params.set("financeView", next.financeView);
  } else if (next.lens !== "all") {
    params.set("lens", next.lens);
  }
  params.set("month", next.month);
  if (next.propertyId !== "all") params.set("propertyId", next.propertyId);
  if (next.review !== "all") params.set("review", next.review);
  return `/overview?${params.toString()}`;
}

function buildLensHref(query: OverviewViewQuery, lens: OverviewLens) {
  return buildOverviewHref(query, { lens });
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
