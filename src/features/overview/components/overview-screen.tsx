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

const supportingMetricLabels = ["Lease gaps", "Active leases", "Attention"];

export function OverviewScreen({ data }: OverviewScreenProps) {
  const occupancyMetric = getMetric(data.metrics, "Occupancy");
  const ledgerMetric = getMetric(data.metrics, "Ledger net");
  const attentionMetric = getMetric(data.metrics, "Attention");
  const primaryMetrics: PrimaryMetric[] = [
    {
      href: "/units?status=vacant",
      icon: Building2,
      metric: occupancyMetric,
    },
    {
      href: "/ledger?period=current_month",
      icon: CircleDollarSign,
      metric: { ...ledgerMetric, label: "MTD ledger net" },
    },
    {
      href: "/leases?endsWithin=60d&sort=end_asc",
      icon: CalendarClock,
      metric: {
        helper: "Leases ending in 60 days",
        label: "Lease risk, 60d",
        tone: data.leaseRiskCount > 0 ? "warning" : "success",
        value: String(data.leaseRiskCount),
      },
    },
    {
      href: "#focus-now",
      icon: AlertTriangle,
      metric: { ...attentionMetric, label: "Open checks" },
    },
  ];
  const supportingMetrics = supportingMetricLabels.map((label) =>
    getMetric(data.metrics, label),
  );

  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5 lg:px-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <DashboardSummaryPanel
            summary={data.dashboardSummary}
            supportingMetrics={supportingMetrics}
          />

          <section
            aria-label="Portfolio signals"
            className="grid grid-cols-1 overflow-hidden rounded-md border border-border bg-surface shadow-sm sm:grid-cols-2 xl:grid-cols-4"
          >
            {primaryMetrics.map((item) => (
              <PrimaryMetricTile
                href={item.href}
                icon={item.icon}
                key={item.metric.label}
                metric={item.metric}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <ChartPanel
              actionHref="/units?status=vacant"
              actionLabel="Open units"
              priority="primary"
              title="Lowest occupancy by property"
            >
              <OccupancyChart points={data.occupancyByProperty} />
            </ChartPanel>

            <div className="grid min-w-0 grid-cols-1 gap-3">
              <ChartPanel
                actionHref="/ledger"
                actionLabel="Open ledger"
                title="Cash movement, 6 months"
              >
                <LedgerFlowChart
                  currency={data.ledgerCurrency}
                  points={data.ledgerFlow}
                />
              </ChartPanel>

              <ChartPanel
                actionHref="/leases?sort=end_asc"
                actionLabel="Open leases"
                title="Lease endings by month"
              >
                <LeaseEndingChart points={data.leaseEndings} />
              </ChartPanel>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-3 xl:self-start">
          <FocusPanel
            items={data.attentionItems}
            summary={data.dashboardSummary}
            total={data.attentionTotal}
          />
          <RecentActivityList changes={data.recentChanges} />
          <QuickActions actions={data.quickActions} />
        </aside>
      </div>
    </main>
  );
}

function DashboardSummaryPanel({
  summary,
  supportingMetrics,
}: {
  summary: OverviewDashboardSummary;
  supportingMetrics: OverviewMetric[];
}) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-surface p-3 shadow-sm">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_170px] lg:items-start">
        <div className="min-w-0">
          <Badge tone={summary.tone}>{summaryStateLabel(summary.tone)}</Badge>
          <h1 className="mt-2 max-w-3xl text-[15px] font-semibold leading-5 text-foreground">
            {summary.headline}
          </h1>
          <p className="mt-1 line-clamp-1 max-w-3xl text-[13px] leading-5 text-foreground-muted">
            {summary.detail}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          <Link
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted lg:w-auto"
            href={summary.actionHref}
          >
            <span className="truncate">{summary.actionLabel}</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      <div className="mt-3 grid min-w-0 divide-y divide-border overflow-hidden rounded-md border border-border bg-background/35 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
      className={cn(
        "group flex min-h-[64px] min-w-0 flex-col justify-between border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-muted sm:border-r sm:last:border-r-0 xl:border-b-0",
        metricAccentClass(metric.tone),
      )}
      href={href}
      title={metric.helper}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0] text-foreground-subtle">
          {metric.label}
        </p>
        <Icon className={cn("shrink-0", toneIconClass(metric.tone))} size={15} />
      </div>
      <div className="mt-1 min-w-0 text-[15px] font-semibold leading-5">
        {isMoneyDisplayValue(metric.value) ? (
          <MoneyDisplay showSecondary={false} value={metric.value} />
        ) : (
          <span className="break-words tabular-nums">{metric.value}</span>
        )}
      </div>
      <div className="flex min-w-0 justify-end">
        <span className="sr-only">{metric.helper}</span>
        <ArrowRight
          className="shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          size={13}
        />
      </div>
    </Link>
  );
}

function SupportingMetric({ metric }: { metric: OverviewMetric }) {
  return (
    <div
      className="flex min-h-9 min-w-0 items-center justify-between gap-3 px-3 py-2"
      title={metric.helper}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground-subtle">
          {summaryMetricLabel(metric.label)}
        </span>
        <span className="sr-only">{metric.helper}</span>
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
    <aside
      className="min-w-0 scroll-mt-4 rounded-md border border-border bg-surface shadow-sm"
      id="focus-now"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Focus now</h2>
        </div>
        <Badge tone={total > 0 ? summary.tone : "success"}>{total}</Badge>
      </div>

      {items.length === 0 ? (
        <div className="m-4 flex items-start gap-3 rounded-md bg-success-soft px-3 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
          <span>No open operating checks from the current data.</span>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 5).map((item, index) => (
            <li key={item.label}>
              <Link
                className="grid min-w-0 grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-muted"
                href={item.href}
                title={item.helper}
              >
                <span className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-[11px] font-semibold text-foreground-subtle">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="sr-only">{item.helper}</span>
                </span>
                <Badge className="shrink-0" tone={item.tone}>
                  {item.count}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
  description?: string;
  priority?: "primary" | "secondary";
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-md border border-border bg-surface p-3 shadow-sm",
        priority === "primary" ? "xl:min-h-[260px]" : null,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "font-semibold tracking-tight",
              priority === "primary" ? "text-base" : "text-sm",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
          ) : null}
        </div>
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground"
          href={actionHref}
        >
          <span>{actionLabel}</span>
          <ArrowRight size={12} />
        </Link>
      </div>
      <div className="pt-3">
        {children}
      </div>
    </section>
  );
}

function OccupancyChart({ points }: { points: OverviewOccupancyPoint[] }) {
  if (points.length === 0) {
    return <EmptyPanelText>No property/unit data yet.</EmptyPanelText>;
  }

  const visiblePoints = points.slice(0, 4);
  const hiddenCount = points.length - visiblePoints.length;

  return (
    <div className="space-y-2.5">
      {visiblePoints.map((point) => {
        return (
        <Link
          className="group block min-w-0 rounded-md px-2 py-1 transition-colors hover:bg-surface-muted"
          href={point.href}
          key={point.label}
          prefetch={false}
          title={`${point.label}: ${point.occupiedUnits}/${point.totalUnits} occupied`}
        >
          <div className="mb-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
            <span className="min-w-0 truncate font-medium">{point.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {point.percent}%
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3">
            <div className="h-2 overflow-hidden rounded-full bg-chart-track">
              <div
                className={cn(
                  "h-full rounded-full transition-opacity group-hover:opacity-90",
                  occupancyBarClass(point.percent),
                )}
                style={{ width: `${Math.max(point.percent, point.totalUnits > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="text-right text-[11px] text-foreground-subtle tabular-nums">
              {point.vacantUnits} vacant
            </span>
          </div>
        </Link>
        );
      })}
      {hiddenCount > 0 ? (
        <Link
          className="inline-flex rounded-md px-2 py-1 text-xs font-medium text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground"
          href="/units?status=vacant"
        >
          {hiddenCount} more properties
        </Link>
      ) : null}
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
      <div className="mb-2 flex items-center gap-3 text-[11px] text-foreground-subtle">
        <LegendSwatch className="bg-chart-accent" label="Income" />
        <LegendSwatch className="bg-chart-neutral" label="Expense" />
      </div>
      <div className="flex h-32 items-end gap-2 border-b border-border pb-2">
        {points.map((point) => (
          <div className="flex min-w-0 flex-1 flex-col items-center" key={point.label}>
            <div className="flex h-24 w-full items-end justify-center gap-1">
              <Bar
                className="bg-chart-accent"
                title={`${point.label} income ${formatCompactMoney(
                  point.income,
                  currency,
                )}`}
                value={point.income}
                maxValue={maxValue}
              />
              <Bar
                className="bg-chart-neutral"
                title={`${point.label} expense ${formatCompactMoney(
                  point.expense,
                  currency,
                )}`}
                value={point.expense}
                maxValue={maxValue}
              />
            </div>
            <span className="mt-2 text-[11px] text-foreground-subtle">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <p className="text-foreground-subtle">Latest net</p>
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
      <div className="flex h-32 items-end gap-2 border-b border-border pb-2">
        {points.map((point) => (
          <Link
            className="flex min-w-0 flex-1 flex-col items-center"
            href={point.href}
            key={point.label}
            prefetch={false}
            title={`${point.count} ending in ${point.label}`}
          >
            <div className="flex h-24 w-full items-end justify-center">
              <Bar
                className={cn(
                  point.count > 0 ? "bg-chart-accent/80" : "bg-chart-track",
                )}
                value={point.count}
                maxValue={maxValue}
              />
            </div>
            <span className="mt-2 text-[11px] text-foreground-subtle">{point.label}</span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-foreground-muted">
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
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-foreground-subtle" />
          <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
        </div>
        <Badge>{changes.length}</Badge>
      </div>
      {changes.length === 0 ? (
        <EmptyPanelText className="px-4 py-4">No activity logged yet.</EmptyPanelText>
      ) : (
        <ul className="divide-y divide-border">
          {changes.slice(0, 4).map((change) => (
            <li className="min-w-0 px-3 py-2" key={change.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {change.recordLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-foreground-subtle">
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
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Plus size={15} className="text-foreground-subtle" />
        <h2 className="text-sm font-semibold tracking-tight">Quick actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {actions.map((action) => (
          <Link
            className="inline-flex h-8 min-w-0 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-center text-[13px] font-medium transition-colors hover:bg-surface-muted"
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
      className={cn("block w-full max-w-9 rounded-t-sm", className)}
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
  return <p className={cn("text-sm text-foreground-muted", className)}>{children}</p>;
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

function metricAccentClass(tone: OverviewMetricTone) {
  if (tone === "warning") {
    return "bg-warning-soft/30 hover:bg-warning-soft/45";
  }

  if (tone === "danger") {
    return "bg-danger-soft/30 hover:bg-danger-soft/45";
  }

  return null;
}

function summaryStateLabel(tone: OverviewMetricTone) {
  if (tone === "success") {
    return "Clear";
  }

  if (tone === "warning") {
    return "Needs review";
  }

  if (tone === "danger") {
    return "Needs action";
  }

  return "Current read";
}

function summaryMetricLabel(label: string) {
  if (label === "Attention") {
    return "Open checks";
  }

  return label;
}

function toneIconClass(tone: OverviewMetricTone) {
  if (tone === "success") {
    return "text-accent";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "danger") {
    return "text-danger";
  }

  return "text-foreground-subtle";
}

function occupancyBarClass(percent: number) {
  if (percent < 50) {
    return "bg-danger/80";
  }

  if (percent < 85) {
    return "bg-warning/80";
  }

  return "bg-accent";
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
