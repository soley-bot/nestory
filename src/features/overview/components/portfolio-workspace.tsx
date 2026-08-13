import Link from "next/link";
import { ArrowRight, CircleAlert, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import { OverviewLedgerAreaChart } from "@/features/overview/components/overview-charts";
import type {
  OverviewAttentionItem,
  OverviewMetric,
  OverviewScreenData,
  OverviewViewQuery,
} from "@/features/overview/overview.types";
import { AdminWorkspaceQueue } from "@/features/workspace-operations/components/admin-workspace-queue";

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
      className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6"
      data-slot="overview-operating-scroll"
      role="region"
    >
      <div className="px-4 lg:px-6">
        <AdminWorkspaceQueue items={attentionQueue} />
      </div>

      <section
        aria-label="Portfolio metrics"
        className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6 dark:*:data-[slot=card]:bg-card"
      >
        {cards.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle><h2>Portfolio cash flow</h2></CardTitle>
            <CardDescription>Income and expenses across the recent operating period.</CardDescription>
            <CardAction>
              <Badge variant="outline">USD</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.ledgerFlow.length > 0 ? (
              <OverviewLedgerAreaChart
                className="h-[260px] md:h-[320px]"
                currency={data.ledgerCurrency}
                points={data.ledgerFlow}
              />
            ) : (
              <div className="flex h-[260px] items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground md:h-[320px]">
                Add ledger entries to populate the cash-flow chart.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle><h2>Properties</h2></CardTitle>
            <CardDescription>Occupancy and current operating records.</CardDescription>
            <CardAction>
              <Link
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                href="/properties"
              >
                View all <ArrowRight className="size-4" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {data.occupancyByProperty.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Property</TableHead>
                    <TableHead>Occupancy</TableHead>
                    <TableHead>Occupied</TableHead>
                    <TableHead className="pr-4 text-right">Open units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.occupancyByProperty.map((property) => (
                    <TableRow key={property.href}>
                      <TableCell className="pl-4 font-medium">
                        <Link className="hover:underline" href={property.href}>
                          {property.label}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge tone={property.percent >= 85 ? "success" : property.percent >= 50 ? "warning" : "danger"}>
                          {property.percent}%
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {property.occupiedUnits} of {property.totalUnits}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {property.unoccupiedUnits}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No properties are available.
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              {data.attentionTotal > 0 ? (
                <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
              ) : null}
              {data.attentionTotal > 0
                ? `${data.attentionTotal} open checks need attention`
                : "No open checks need attention"}
            </span>
            <Link
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
              href={`/overview/attention?month=${query.month}`}
            >
              Review <ArrowRight className="size-4" />
            </Link>
          </CardFooter>
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
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{metric.label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>
          <Badge tone={needsReview ? "warning" : metric.tone === "neutral" ? "neutral" : metric.tone}>
            <StatusIcon className="size-3" />
            {needsReview ? "Review" : "Current"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="font-medium">{metric.helper}</div>
        <div className="text-muted-foreground">Based on current workspace records</div>
      </CardFooter>
    </Card>
  );
}

function dashboardMetrics(metrics: OverviewMetric[]) {
  const preferredLabels = ["Occupancy", "Active leases", "Lease gaps", "Attention"];
  return preferredLabels
    .map((label) => metrics.find((metric) => metric.label === label))
    .filter((metric): metric is OverviewMetric => Boolean(metric));
}
