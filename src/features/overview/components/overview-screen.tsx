import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  type LucideIcon,
  Plus,
} from "lucide-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import type { RecentChangeTone } from "@/features/activity/activity.types";
import type {
  OverviewAttentionItem,
  OverviewDashboardSummary,
  OverviewLedgerPoint,
  OverviewLeaseEndingPoint,
  OverviewMetric,
  OverviewMetricTone,
  OverviewOccupancyPoint,
  OverviewQuickAction,
  OverviewScreenData,
} from "@/features/overview/overview.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  type CurrencyCode,
  type MoneyDisplayValue,
} from "@/lib/money/format";
import { cn } from "@/lib/utils";

type OverviewScreenProps = {
  data: OverviewScreenData;
};

type PrimaryMetric = {
  href: string;
  icon: LucideIcon;
  metric: OverviewMetric;
};

const supportingMetricLabels = ["Active leases", "Vacant units", "People"];

export function OverviewScreen({ data }: OverviewScreenProps) {
  const occupancyMetric = getMetric(data.metrics, "Occupancy");
  const ledgerMetric = getMetric(data.metrics, "Ledger net");
  const attentionMetric = getMetric(data.metrics, "Attention");
  const primaryMetrics: PrimaryMetric[] = [
    {
      href: "/units",
      icon: Building2,
      metric: occupancyMetric,
    },
    {
      href: "/ledger",
      icon: CircleDollarSign,
      metric: ledgerMetric,
    },
    {
      href: "/leases?sort=end_asc",
      icon: CalendarClock,
      metric: {
        helper: "Ending in next 60 days",
        label: "Lease risk",
        tone: data.leaseRiskCount > 0 ? "warning" : "success",
        value: String(data.leaseRiskCount),
      },
    },
    {
      href: data.dashboardSummary.actionHref,
      icon: AlertTriangle,
      metric: attentionMetric,
    },
  ];
  const supportingMetrics = supportingMetricLabels.map((label) =>
    getMetric(data.metrics, label),
  );

  return (
    <main className="min-h-screen bg-surface-muted/60 px-4 py-5 sm:px-6 lg:p-8">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <DashboardSummaryPanel
          metrics={primaryMetrics}
          summary={data.dashboardSummary}
          supportingMetrics={supportingMetrics}
        />
        <FocusPanel
          items={data.attentionItems}
          summary={data.dashboardSummary}
          total={data.attentionTotal}
        />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <ChartPanel
          actionHref="/units"
          actionLabel="Open units"
          description="Lowest occupancy properties first"
          priority="primary"
          title="Portfolio health by property"
        >
          <OccupancyChart points={data.occupancyByProperty} />
        </ChartPanel>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <ChartPanel
            actionHref="/ledger"
            actionLabel="Open ledger"
            description="Income, expense, and latest net"
            title="Cash movement"
          >
            <LedgerFlowChart
              currency={data.ledgerCurrency}
              points={data.ledgerFlow}
            />
          </ChartPanel>

          <ChartPanel
            actionHref="/leases?sort=end_asc"
            actionLabel="Open leases"
            description="Upcoming endings by month"
            title="Lease runway"
          >
            <LeaseEndingChart points={data.leaseEndings} />
          </ChartPanel>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecentActivityList changes={data.recentChanges} />
        <QuickActions actions={data.quickActions} />
      </section>
    </main>
  );
}

function DashboardSummaryPanel({
  metrics,
  summary,
  supportingMetrics,
}: {
  metrics: PrimaryMetric[];
  summary: OverviewDashboardSummary;
  supportingMetrics: OverviewMetric[];
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5",
        summaryAccentClass(summary.tone),
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
            Overview
          </h1>
          <p className="mt-2 max-w-3xl text-lg font-semibold leading-7 text-foreground">
            {summary.headline}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            {summary.detail}
          </p>
        </div>
        <Link
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-foreground"
          href={summary.actionHref}
        >
          <span>{summary.actionLabel}</span>
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 2xl:grid-cols-4">
        {metrics.map((item) => (
          <PrimaryMetricTile
            href={item.href}
            icon={item.icon}
            key={item.metric.label}
            metric={item.metric}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3">
        {supportingMetrics.map((metric) => (
          <SupportingMetric key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function PrimaryMetricTile({
  href,
  icon: Icon,
  metric,
}: {
  href: string;
  icon: LucideIcon;
  metric: OverviewMetric;
}) {
  return (
    <Link
      className="group min-w-0 rounded-md border border-border bg-surface px-3 py-3 transition-colors hover:border-foreground/30 hover:bg-surface-muted"
      href={href}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0] text-muted">
          {metric.label}
        </p>
        <Icon className={cn("shrink-0", toneIconClass(metric.tone))} size={15} />
      </div>
      <div className="mt-2 min-w-0 text-2xl font-semibold leading-7">
        {isMoneyDisplayValue(metric.value) ? (
          <MoneyDisplay showSecondary={false} size="large" value={metric.value} />
        ) : (
          <span className="break-words tabular-nums">{metric.value}</span>
        )}
      </div>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted" title={metric.helper}>
          {metric.helper}
        </p>
        <ArrowRight
          className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          size={13}
        />
      </div>
    </Link>
  );
}

function SupportingMetric({ metric }: { metric: OverviewMetric }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{metric.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">
          {metric.helper}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {isMoneyDisplayValue(metric.value) ? metric.value.primary : metric.value}
      </span>
    </div>
  );
}

function FocusPanel({
  items,
  summary,
  total,
}: {
  items: OverviewAttentionItem[];
  summary: OverviewDashboardSummary;
  total: number;
}) {
  return (
    <aside className="min-w-0 rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Focus now</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Highest-priority checks from the current portfolio data.
          </p>
        </div>
        <Badge tone={total > 0 ? summary.tone : "success"}>{total}</Badge>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-md bg-green-50 px-3 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
          <span>No open operating checks from the current data.</span>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.slice(0, 4).map((item) => (
            <li key={item.label}>
              <Link
                className="flex min-w-0 items-center justify-between gap-3 py-3 transition-colors hover:text-accent"
                href={item.href}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {item.helper}
                  </span>
                </span>
                <Badge className="shrink-0" tone={item.tone}>
                  {item.count}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-muted"
        href={summary.actionHref}
      >
        <span>{summary.actionLabel}</span>
        <ArrowRight size={14} />
      </Link>
    </aside>
  );
}

function ChartPanel({
  actionHref,
  actionLabel,
  children,
  description,
  priority = "secondary",
  title,
}: {
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
  description: string;
  priority?: "primary" | "secondary";
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-md border border-border bg-surface shadow-sm",
        priority === "primary" ? "xl:min-h-[520px]" : null,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "font-semibold tracking-tight",
              priority === "primary" ? "text-base" : "text-sm",
            )}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          href={actionHref}
        >
          <span>{actionLabel}</span>
          <ArrowRight size={12} />
        </Link>
      </div>
      <div className={cn("px-4 py-4", priority === "primary" ? "sm:px-5" : null)}>
        {children}
      </div>
    </section>
  );
}

function OccupancyChart({ points }: { points: OverviewOccupancyPoint[] }) {
  if (points.length === 0) {
    return <EmptyPanelText>No property/unit data yet.</EmptyPanelText>;
  }

  return (
    <div className="space-y-4">
      {points.map((point) => (
        <Link
          className="group block min-w-0 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
          href={point.href}
          key={point.label}
          title={`${point.label}: ${point.occupiedUnits}/${point.totalUnits} occupied`}
        >
          <div className="mb-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
            <span className="min-w-0 truncate font-medium">{point.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {point.percent}%
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-colors group-hover:bg-foreground",
                  occupancyBarClass(point.percent),
                )}
                style={{ width: `${Math.max(point.percent, point.totalUnits > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="text-right text-[11px] text-muted tabular-nums">
              {point.occupiedUnits}/{point.totalUnits} units
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function LedgerFlowChart({
  currency,
  points,
}: {
  currency: CurrencyCode;
  points: OverviewLedgerPoint[];
}) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.income, point.expense]),
  );

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-3 text-[11px] text-muted">
        <LegendSwatch className="bg-success" label="Income" />
        <LegendSwatch className="bg-danger" label="Expense" />
      </div>
      <div className="flex h-40 items-end gap-2 border-b border-border pb-2">
        {points.map((point) => (
          <div className="flex min-w-0 flex-1 flex-col items-center" key={point.label}>
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <Bar
                className="bg-success"
                title={`${point.label} income ${formatCompactMoney(
                  point.income,
                  currency,
                )}`}
                value={point.income}
                maxValue={maxValue}
              />
              <Bar
                className="bg-danger/75"
                title={`${point.label} expense ${formatCompactMoney(
                  point.expense,
                  currency,
                )}`}
                value={point.expense}
                maxValue={maxValue}
              />
            </div>
            <span className="mt-2 text-[11px] text-muted">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <p className="text-muted">Latest net</p>
        <p className="text-right font-medium tabular-nums">
          {formatCompactMoney(points.at(-1)?.net ?? 0, currency)}
        </p>
      </div>
    </div>
  );
}

function LeaseEndingChart({ points }: { points: OverviewLeaseEndingPoint[] }) {
  const maxValue = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="min-w-0">
      <div className="flex h-40 items-end gap-2 border-b border-border pb-2">
        {points.map((point) => (
          <Link
            className="flex min-w-0 flex-1 flex-col items-center"
            href={point.href}
            key={point.label}
            title={`${point.count} ending in ${point.label}`}
          >
            <div className="flex h-32 w-full items-end justify-center">
              <Bar
                className={cn(
                  point.count > 0 ? "bg-warning/80" : "bg-border",
                )}
                value={point.count}
                maxValue={maxValue}
              />
            </div>
            <span className="mt-2 text-[11px] text-muted">{point.label}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {total} {total === 1 ? "ending" : "endings"} in view.
      </p>
    </div>
  );
}

function RecentActivityList({
  changes,
}: {
  changes: OverviewScreenData["recentChanges"];
}) {
  return (
    <section className="rounded-md border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-muted" />
          <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
        </div>
        <Badge>{changes.length}</Badge>
      </div>
      {changes.length === 0 ? (
        <EmptyPanelText className="px-4 py-4">No activity logged yet.</EmptyPanelText>
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
          {changes.slice(0, 4).map((change) => (
            <li className="min-w-0 px-4 py-3" key={change.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {change.recordLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {change.entityLabel} / {formatDate(change.createdAt)}
                  </span>
                </span>
                <Badge className="shrink-0" tone={toBadgeTone(change.tone)}>
                  {change.actionLabel}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuickActions({ actions }: { actions: OverviewQuickAction[] }) {
  return (
    <section className="rounded-md border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Plus size={15} className="text-muted" />
        <h2 className="text-sm font-semibold tracking-tight">Quick actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4">
        {actions.map((action) => (
          <Link
            className="inline-flex h-9 min-w-0 items-center justify-center rounded-md border border-border bg-surface px-3 text-center text-sm font-medium transition-colors hover:bg-surface-muted"
            href={action.href}
            key={action.label}
          >
            <span className="truncate">{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Bar({
  className,
  maxValue,
  title,
  value,
}: {
  className: string;
  maxValue: number;
  title?: string;
  value: number;
}) {
  const height = value > 0 ? Math.max(5, Math.round((value / maxValue) * 100)) : 0;

  return (
    <span
      className={cn("block w-full max-w-8 rounded-t-sm", className)}
      style={{ height: `${height}%` }}
      title={title}
    />
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function EmptyPanelText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-muted", className)}>{children}</p>;
}

function getMetric(metrics: OverviewMetric[], label: string): OverviewMetric {
  return (
    metrics.find((metric) => metric.label === label) ?? {
      helper: "No data yet",
      label,
      tone: "neutral",
      value: "0",
    }
  );
}

function isMoneyDisplayValue(value: OverviewMetric["value"]): value is MoneyDisplayValue {
  return typeof value === "object" && value !== null && "primary" in value;
}

function summaryAccentClass(tone: OverviewMetricTone) {
  if (tone === "success") {
    return "border-l-4 border-l-success";
  }

  if (tone === "warning") {
    return "border-l-4 border-l-warning";
  }

  if (tone === "danger") {
    return "border-l-4 border-l-danger";
  }

  return "border-l-4 border-l-border";
}

function toneIconClass(tone: OverviewMetricTone) {
  if (tone === "success") {
    return "text-success";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "danger") {
    return "text-danger";
  }

  return "text-muted";
}

function occupancyBarClass(percent: number) {
  if (percent < 50) {
    return "bg-danger/80";
  }

  if (percent < 85) {
    return "bg-warning/80";
  }

  return "bg-success";
}

function toBadgeTone(tone: RecentChangeTone) {
  return tone;
}

function formatCompactMoney(amount: number, currency: CurrencyCode) {
  const absolute = Math.abs(amount);

  if (currency === "KHR" && absolute >= 1_000_000) {
    return `${amount < 0 ? "-" : ""}KHR ${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (currency === "USD" && absolute >= 1_000) {
    return `${amount < 0 ? "-" : ""}USD ${(absolute / 1_000).toFixed(1)}k`;
  }

  return formatMoney(amount, currency);
}
