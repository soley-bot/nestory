import Link from "next/link";
import { ArrowRight, CircleAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OverviewAttentionCard } from "@/features/overview/components/overview-attention-card";
import { OverviewLedgerAreaChart } from "@/features/overview/components/overview-charts";
import { OverviewMonthPicker } from "@/features/overview/components/overview-month-picker";
import { OverviewPropertyPicker } from "@/features/overview/components/overview-property-picker";
import type {
  OverviewAttentionItem,
  OverviewMetric,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";

export function PortfolioWorkspace({
  attentionQueue,
  data,
  query,
}: {
  attentionQueue: readonly OverviewAttentionItem[];
  data: OverviewScreenData;
  query: OverviewViewQuery;
}) {
  const cards = dashboardMetrics(data.metrics);

  return (
    <div
      aria-label="Portfolio operating work"
      className="@container/main flex flex-1 flex-col gap-3 py-3"
      data-slot="overview-operating-scroll"
      role="region"
    >
      <section
        aria-label="Portfolio metrics"
        className="grid grid-cols-1 gap-3 px-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6"
      >
        {cards.map((metric) =>
          metric.label === "Attention" ? (
            <OverviewAttentionCard
              items={attentionQueue}
              key={metric.label}
              metric={metric}
            />
          ) : (
            <MetricCard key={metric.label} metric={metric} />
          ),
        )}
      </section>

      <div
        className="flex justify-end px-4 lg:px-6"
        data-slot="dashboard-chart-toolbar"
        role="toolbar"
        aria-label="Dashboard filters"
      >
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          <OverviewPropertyPicker options={data.propertyOptions} query={query} />
          <OverviewMonthPicker className="border-0 bg-background px-2.5 shadow-xs" query={query} />
        </div>
      </div>

      <div
        className="flex flex-col gap-3 px-4 lg:px-6"
        data-slot="dashboard-primary-stack"
      >
        <Card data-slot="dashboard-cash-flow" size="sm">
          <CardHeader className="border-b">
            <CardTitle><h2>Portfolio cash flow</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]" data-slot="dashboard-cash-flow-chart">
              {data.ledgerFlow.length > 0 ? (
                <OverviewLedgerAreaChart
                  className="h-full"
                  currency={data.ledgerCurrency}
                  points={data.ledgerFlow}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">
                  Add ledger entries to populate the cash-flow chart.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-slot="dashboard-properties" size="sm">
          <CardHeader className="border-b">
            <CardTitle><h2>Properties</h2></CardTitle>
            <CardAction className="self-center">
              <Link
                aria-label="View all properties"
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                href="/properties"
              >
                View all <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {data.occupancyByProperty.length > 0 ? (
              <Table aria-label="Property occupancy">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 pl-3 text-xs">Property</TableHead>
                    <TableHead className="h-8 text-xs">Occupancy</TableHead>
                    <TableHead className="h-8 text-xs">Occupied</TableHead>
                    <TableHead className="h-8 pr-3 text-right text-xs">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.occupancyByProperty.map((property) => (
                    <TableRow key={property.href}>
                      <TableCell className="max-w-56 truncate py-1.5 pl-3 font-medium">
                        <Link className="hover:underline" href={property.href}>
                          {property.label}
                        </Link>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge tone={property.percent >= 85 ? "success" : property.percent >= 50 ? "warning" : "danger"}>
                          {property.percent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 tabular-nums">
                        {property.occupiedUnits} of {property.totalUnits}
                      </TableCell>
                      <TableCell className="py-1.5 pr-3 text-right tabular-nums">
                        {property.unoccupiedUnits}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No properties are available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: OverviewMetric }) {
  const value = typeof metric.value === "string" ? metric.value : metric.value.primary;
  const needsReview =
    metric.tone === "warning" ||
    metric.tone === "danger" ||
    (metric.label === "Occupancy" && Number.parseInt(value, 10) < 85);
  const StatusIcon = needsReview ? CircleAlert : TrendingUp;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle><h2>{metricLabel(metric.label)}</h2></CardTitle>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <CardAction>
          <Badge tone={needsReview ? "warning" : metric.tone === "neutral" ? "neutral" : metric.tone}>
            <StatusIcon aria-hidden="true" className="size-3" />
            {needsReview ? "Review" : "Current"}
          </Badge>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

function metricLabel(label: string) {
  if (label === "Occupancy") return "Portfolio occupancy";
  if (label === "Lease gaps") return "Units without leases";
  return label;
}

function dashboardMetrics(metrics: OverviewMetric[]) {
  const preferredLabels = ["Occupancy", "Active leases", "Lease gaps", "Attention"];
  return preferredLabels
    .map((label) => metrics.find((metric) => metric.label === label))
    .filter((metric): metric is OverviewMetric => Boolean(metric));
}
