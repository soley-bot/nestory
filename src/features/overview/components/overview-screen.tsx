import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuilding,
  IconCalendarClock,
  IconCircleCheck,
  IconCurrencyDollar,
  IconPlus,
  type TablerIcon,
} from "@tabler/icons-react";
import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import {
  OverviewLedgerAreaChart,
  OverviewLeaseEndingDonut,
  OverviewOccupancyBars,
} from "@/features/overview/components/overview-charts";
import type {
  OverviewAttentionItem,
  OverviewDashboardSummary,
  OverviewMetric,
  OverviewMetricTone,
  OverviewQuickAction,
  OverviewScreenData,
} from "@/features/overview/overview.types";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type OverviewScreenProps = {
  data: OverviewScreenData;
};

type PrimaryMetric = {
  href: string;
  icon: TablerIcon;
  metric: OverviewMetric;
  visualTone?: OverviewVisualTone;
};

type OverviewVisualTone = OverviewMetricTone | "accent";

const supportingMetricLabels = ["Lease gaps", "Active leases", "Attention"];

export function OverviewScreen({ data }: OverviewScreenProps) {
  const occupancyMetric = getMetric(data.metrics, "Occupancy");
  const ledgerMetric = getMetric(data.metrics, "Ledger net");
  const attentionMetric = getMetric(data.metrics, "Attention");
  const primaryMetrics: PrimaryMetric[] = [
    {
      href: "/units?occupancy=unoccupied",
      icon: IconBuilding,
      metric: occupancyMetric,
    },
    {
      href: "/ledger?period=current_month",
      icon: IconCurrencyDollar,
      metric: { ...ledgerMetric, label: "Current month net" },
      visualTone: "accent",
    },
    {
      href: "/leases?status=current&endsWithin=60d&sort=end_asc",
      icon: IconCalendarClock,
      metric: {
        helper: "Leases ending in 60 days",
        label: "Lease risk, 60d",
        tone: data.leaseRiskCount > 0 ? "warning" : "success",
        value: String(data.leaseRiskCount),
      },
    },
    {
      href: data.dashboardSummary.actionHref,
      icon: IconAlertTriangle,
      metric: { ...attentionMetric, label: "Open checks" },
    },
  ];
  const supportingMetrics = supportingMetricLabels.map((label) =>
    getMetric(data.metrics, label),
  );

  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5 lg:px-5">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <DashboardSummaryPanel
            summary={data.dashboardSummary}
            supportingMetrics={supportingMetrics}
          />

          <section
            aria-label="Portfolio signals"
            className="grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:grid-cols-2 xl:grid-cols-4"
          >
            {primaryMetrics.map((item) => (
              <PrimaryMetricTile
                href={item.href}
                icon={item.icon}
                key={item.metric.label}
                metric={item.metric}
                visualTone={item.visualTone}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <ChartPanel
              actionHref="/units?occupancy=unoccupied"
              actionLabel="Review open units"
              className="xl:h-full"
              priority="primary"
              title="Lowest occupancy by property"
            >
              <OccupancyChart points={data.occupancyByProperty} />
            </ChartPanel>

            <div className="grid min-w-0 grid-cols-1 gap-3 xl:h-full xl:grid-rows-[minmax(0,1fr)_auto]">
              <ChartPanel
                actionHref="/ledger?period=current_month"
                actionLabel="Open ledger"
                title="Cash movement, 6 months"
              >
                <LedgerFlowChart
                  className="h-52 xl:h-56"
                  currency={data.ledgerCurrency}
                  points={data.ledgerFlow}
                />
              </ChartPanel>

              <ChartPanel
                actionHref="/leases?status=current&sort=end_asc"
                actionLabel="Open leases"
                title="Lease endings by month"
              >
                <LeaseEndingChart points={data.leaseEndings} />
              </ChartPanel>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-3 xl:flex xl:h-full xl:flex-col xl:self-stretch xl:space-y-0 xl:gap-3">
          <FocusPanel
            className="xl:flex-1"
            items={data.attentionItems}
            summary={data.dashboardSummary}
            total={data.attentionTotal}
          />
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
    <section className="min-w-0 rounded-lg border border-border bg-surface p-3 shadow-sm">
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
            <IconArrowRight size={15} />
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
  visualTone,
}: {
  href: string;
  icon: TablerIcon;
  metric: OverviewMetric;
  visualTone?: OverviewVisualTone;
}) {
  const tone = visualTone ?? metric.tone;

  return (
    <Link
      className={cn(
        "group flex min-h-[64px] min-w-0 flex-col justify-between border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-muted sm:border-r sm:last:border-r-0 xl:border-b-0",
        metricAccentClass(tone),
      )}
      href={href}
      title={metric.helper}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-[0] text-foreground-subtle">
          {metric.label}
        </p>
        <Icon className={cn("shrink-0", toneIconClass(tone))} size={15} />
      </div>
      <div className="mt-1 min-w-0 text-[15px] font-semibold leading-5">
        {isMoneyDisplayValue(metric.value) ? (
          <MoneyDisplay value={metric.value} />
        ) : (
          <span className="break-words tabular-nums">{metric.value}</span>
        )}
      </div>
      <div className="flex min-w-0 justify-end">
        <span className="sr-only">{metric.helper}</span>
        <IconArrowRight
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
  className,
  items,
  summary,
  total,
}: {
  className?: string;
  items: OverviewAttentionItem[];
  summary: OverviewDashboardSummary;
  total: number;
}) {
  return (
    <aside
      className={cn(
        "min-w-0 scroll-mt-4 rounded-lg border border-border bg-surface shadow-sm",
        className,
      )}
      id="focus-now"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-5">Focus now</h2>
        </div>
        <Badge tone={total > 0 ? summary.tone : "success"}>{total}</Badge>
      </div>

      {items.length === 0 ? (
        <div className="m-4 flex items-start gap-3 rounded-md bg-success-soft px-3 py-3 text-sm text-success">
          <IconCircleCheck className="mt-0.5 shrink-0" size={16} />
          <span>No open operating checks from the current data.</span>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 7).map((item, index) => (
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
                  <span className="block truncate text-[13px] font-medium leading-5">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs leading-4 text-foreground-subtle">
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
    </aside>
  );
}

function ChartPanel({
  actionHref,
  actionLabel,
  children,
  className,
  description,
  priority = "secondary",
  title,
}: {
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
  className?: string;
  description?: string;
  priority?: "primary" | "secondary";
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-border bg-surface p-3 shadow-sm",
        priority === "primary" ? "xl:min-h-[260px]" : null,
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className={cn(
              "text-sm font-semibold leading-5 tracking-normal",
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
          <IconArrowRight size={12} />
        </Link>
      </div>
      <div className="pt-3">
        {children}
      </div>
    </section>
  );
}

function OccupancyChart({
  points,
}: {
  points: OverviewScreenData["occupancyByProperty"];
}) {
  if (points.length === 0) {
    return <EmptyPanelText>No property/unit data yet.</EmptyPanelText>;
  }

  return <OverviewOccupancyBars points={points} />;
}

function LedgerFlowChart({
  className,
  currency,
  points,
}: {
  className?: string;
  currency: OverviewScreenData["ledgerCurrency"];
  points: OverviewScreenData["ledgerFlow"];
}) {
  return (
    <OverviewLedgerAreaChart
      className={className}
      currency={currency}
      points={points}
    />
  );
}

function LeaseEndingChart({
  points,
}: {
  points: OverviewScreenData["leaseEndings"];
}) {
  return <OverviewLeaseEndingDonut points={points} />;
}

function QuickActions({ actions }: { actions: OverviewQuickAction[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <IconPlus size={15} className="text-foreground-subtle" />
        <h2 className="text-sm font-semibold leading-5">Quick actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {actions.map((action) => (
          <Link
            className="inline-flex min-h-9 min-w-0 items-center justify-center rounded-md border border-border bg-surface px-2.5 py-1.5 text-center text-[13px] font-medium leading-5 transition-colors hover:bg-surface-muted"
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

function metricAccentClass(tone: OverviewVisualTone) {
  if (tone === "accent") {
    return "bg-accent-soft/45 hover:bg-accent-soft/60";
  }

  if (tone === "success") {
    return "bg-success-soft/35 hover:bg-success-soft/50";
  }

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

function toneIconClass(tone: OverviewVisualTone) {
  if (tone === "accent") {
    return "text-accent";
  }

  if (tone === "success") {
    return "text-success";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "danger") {
    return "text-danger";
  }

  return "text-foreground-subtle";
}
