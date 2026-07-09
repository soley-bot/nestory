import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  DoorOpen as DoorOpenIcon,
  DollarSign,
  FileText,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  TrendingUp,
  Upload,
  UsersRound,
  Plus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
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
  OverviewFinanceView,
  OverviewLens,
  OverviewMetric,
  OverviewMetricTone,
  OverviewQuickAction,
  OverviewScreenData,
} from "@/features/overview/overview.types";
import { formatDate } from "@/lib/dates/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type OverviewScreenProps = {
  data: OverviewScreenData;
  financeView?: OverviewFinanceView;
  lens?: OverviewLens;
};

type PrimaryMetric = {
  href: string;
  icon: LucideIcon;
  metric: OverviewMetric;
  visualTone?: OverviewVisualTone;
};

type OverviewVisualTone = OverviewMetricTone | "accent";
type OverviewChartKey = "occupancy" | "ledger" | "leases" | "queue";
type OverviewChartConfig = {
  actionHref: string;
  actionLabel: string;
  key: OverviewChartKey;
  title: string;
};

const financeViewTabs: Array<{
  href: string;
  key: OverviewFinanceView;
  label: string;
}> = [
  {
    href: "/overview?lens=finance&financeView=company-pnl",
    key: "company-pnl",
    label: "Company P&L",
  },
  {
    href: "/overview?lens=finance&financeView=property-ranking",
    key: "property-ranking",
    label: "Property Ranking",
  },
  {
    href: "/overview?lens=finance&financeView=owner-receivables",
    key: "owner-receivables",
    label: "Owner Receivables",
  },
  {
    href: "/overview?lens=finance&financeView=ledger",
    key: "ledger",
    label: "Ledger",
  },
];

const overviewLensTabs: Array<{
  helper: string;
  href: string;
  icon: LucideIcon;
  key: OverviewLens;
  label: string;
}> = [
  {
    helper: "Full operating read",
    href: "/overview",
    icon: LayoutDashboard,
    key: "all",
    label: "All",
  },
  {
    helper: "Cash, arrears, and posting queues",
    href: "/overview?lens=finance",
    icon: Landmark,
    key: "finance",
    label: "Finance",
  },
  {
    helper: "Lease expiries, gaps, and occupancy",
    href: "/overview?lens=leasing",
    icon: ScrollText,
    key: "leasing",
    label: "Leasing",
  },
  {
    helper: "Open cases and repair pressure",
    href: "/overview?lens=maintenance",
    icon: Wrench,
    key: "maintenance",
    label: "Maintenance",
  },
  {
    helper: "Missing data and record readiness",
    href: "/overview?lens=records",
    icon: FileText,
    key: "records",
    label: "Records",
  },
];

export function OverviewScreen({
  data,
  financeView = "company-pnl",
  lens = "all",
}: OverviewScreenProps) {
  if (!data.workspaceSetup.hasAnyOperatingData) {
    return <EmptyWorkspaceOnboarding data={data} />;
  }

  const lensAttentionItems = getLensAttentionItems(data.attentionItems, lens);
  const lensAttentionTotal = countAttention(lensAttentionItems);
  const lensSummary = getLensSummary(
    data.dashboardSummary,
    data,
    lens,
    lensAttentionTotal,
  );
  const lensCharts = getLensChartConfigs(lens);
  const showSetupProgress = !isBaseSetupComplete(data.workspaceSetup);
  const primaryMetrics = getLensMetrics(
    data,
    lens,
    lensAttentionItems,
    lensAttentionTotal,
  );

  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5 lg:px-5">
      <div
        className={cn(
          "grid gap-3",
          lens === "all"
            ? "xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_360px]"
            : null,
        )}
      >
        <div className="min-w-0 space-y-3">
          <OverviewLensHeader
            attentionItems={data.attentionItems}
            lens={lens}
          />

          {showSetupProgress ? (
            <SetupProgressPanel setup={data.workspaceSetup} />
          ) : null}

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

          {lens === "finance" ? (
            <FinanceLensWorkspace
              data={data}
              financeView={financeView}
              lensAttentionItems={lensAttentionItems}
            />
          ) : (
            <section className={getLensGridClass(lens)}>
              {lensCharts.map((chart) => (
                <ChartPanel
                  actionHref={chart.actionHref}
                  actionLabel={chart.actionLabel}
                  className={getChartPanelClass(chart, lens)}
                  key={chart.key}
                  title={chart.title}
                >
                  <OverviewChart
                    config={chart}
                    data={data}
                    lens={lens}
                    lensAttentionItems={lensAttentionItems}
                  />
                </ChartPanel>
              ))}
            </section>
          )}
        </div>

        {lens === "all" ? (
          <aside className="min-w-0 space-y-3 xl:sticky xl:top-3 xl:flex xl:h-full xl:flex-col xl:self-stretch xl:space-y-0 xl:gap-3">
            <FocusPanel
              className="xl:flex-1"
              items={data.attentionItems}
              summary={lensSummary}
              total={data.attentionTotal}
            />
            <QuickActions actions={data.quickActions} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function OverviewLensHeader({
  attentionItems,
  lens,
}: {
  attentionItems: OverviewAttentionItem[];
  lens: OverviewLens;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-surface p-2 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="mr-auto min-w-[120px]">
          <h1 className="text-sm font-semibold leading-5 text-foreground">
            Overview
          </h1>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md border border-border bg-background/50 p-1 md:flex-none">
          {overviewLensTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === lens;
            const count =
              tab.key === "all"
                ? countAttention(attentionItems)
                : countAttention(getLensAttentionItems(attentionItems, tab.key));

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? cn(
                        "border bg-surface text-foreground shadow-sm",
                        activeLensClass(tab.key),
                      )
                    : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                )}
                href={tab.href}
                key={tab.key}
                title={tab.helper}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {count > 0 ? (
                  <Badge className="ml-0.5" tone={isActive ? "accent" : "neutral"}>
                    {count}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EmptyWorkspaceOnboarding({ data }: { data: OverviewScreenData }) {
  const setupSteps = buildSetupSteps(data.workspaceSetup);
  const nextStep = setupSteps.find((step) => !step.complete) ?? setupSteps[0];

  return (
    <main className="min-h-screen bg-background px-4 py-3 sm:px-5 lg:px-5">
      <section className="grid min-h-[calc(100vh-24px)] gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <Badge tone="warning">Setup needed</Badge>
            <h1 className="mt-2 text-xl font-semibold leading-7 text-foreground">
              Start with your operating records.
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground-muted">
              Create the first property, then use guided imports for units,
              people, and leases as your records become available.
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
            <div className="min-w-0 rounded-md border border-border bg-background/40">
              <div className="grid gap-3 border-b border-border px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Setup plan</h2>
                  <p className="mt-1 text-sm leading-5 text-foreground-muted">
                    The reliable path is property shell, unit rent roll, people,
                    leases, then opening ledger rows. Imports can now help with
                    the first four record types.
                  </p>
                </div>
                <Link
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
                  href={nextStep.actionHref}
                >
                  {nextStep.actionLabel}
                  <ArrowRight size={15} />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {setupSteps.map((step, index) => (
                  <SetupStepRow
                    index={index + 1}
                    key={step.label}
                    step={step}
                  />
                ))}
              </div>
            </div>

            <section className="rounded-md border border-border bg-surface p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Import center</h2>
                  <p className="mt-1 text-sm leading-5 text-foreground-muted">
                    Use staged CSV imports for properties, units, people, and
                    leases. Templates prefill existing record anchors where
                    Nestory already has them.
                  </p>
                </div>
                <Link
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                  href="/import"
                >
                  <Upload size={15} />
                  Open imports
                </Link>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <ImportFact label="Files" value="Properties, units, people, leases" />
                <ImportFact label="Limit" value="500 valid rows per commit" />
                <ImportFact label="Needs" value="Matched record anchors" />
                <ImportFact label="Result" value="Staged create or update" />
              </dl>
            </section>
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <section className="rounded-lg border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-semibold leading-5">
                Workspace counts
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              <SetupCount
                label="Properties"
                value={data.workspaceSetup.propertyCount}
              />
              <SetupCount label="Units" value={data.workspaceSetup.unitCount} />
              <SetupCount
                label="People"
                value={data.workspaceSetup.peopleCount}
              />
              <SetupCount
                label="Leases"
                value={data.workspaceSetup.activeLeaseCount}
              />
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

type SetupStep = {
  actionHref: string;
  actionLabel: string;
  complete: boolean;
  helper: string;
  icon: LucideIcon;
  label: string;
};

function SetupProgressPanel({
  setup,
}: {
  setup: OverviewScreenData["workspaceSetup"];
}) {
  const steps = buildSetupSteps(setup);
  const completedCount = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete) ?? steps[0];

  return (
    <section className="rounded-lg border border-warning/30 bg-warning-soft/20 p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">Setup {completedCount}/{steps.length}</Badge>
            <p className="text-sm font-semibold text-foreground">
              Finish the records that make Overview reliable.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {steps.map((step) => (
              <span
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
                  step.complete
                    ? "border-success/20 bg-success-soft text-success"
                    : "border-border bg-surface text-foreground-muted",
                )}
                key={step.label}
              >
                <step.icon size={13} />
                {step.label}
              </span>
            ))}
          </div>
        </div>
        <Link
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
          href={nextStep.actionHref}
        >
          {nextStep.actionLabel}
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

function SetupStepRow({
  index,
  step,
}: {
  index: number;
  step: SetupStep;
}) {
  return (
    <div className="grid min-w-0 gap-3 px-3 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center">
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-md border text-[12px] font-semibold",
          step.complete
            ? "border-success/20 bg-success-soft text-success"
            : "border-border bg-surface text-foreground-subtle",
        )}
      >
        {step.complete ? <CircleCheck size={16} /> : index}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <step.icon className="shrink-0 text-foreground-subtle" size={15} />
          <p className="truncate text-sm font-semibold text-foreground">
            {step.label}
          </p>
        </div>
        <p className="mt-0.5 text-sm leading-5 text-foreground-muted">
          {step.helper}
        </p>
      </div>
      <Link
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
        href={step.actionHref}
      >
        {step.actionLabel}
      </Link>
    </div>
  );
}

function PrimaryMetricTile({
  href,
  icon: Icon,
  metric,
  visualTone,
}: {
  href: string;
  icon: LucideIcon;
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
        <ArrowRight
          className="shrink-0 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          size={13}
        />
      </div>
    </Link>
  );
}

function ImportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/40 px-3 py-2">
      <dt className="text-foreground-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SetupCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-xs font-medium text-foreground-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function buildSetupSteps(
  setup: OverviewScreenData["workspaceSetup"],
): SetupStep[] {
  return [
    {
      actionHref: "/properties?action=create",
      actionLabel: "Add first property",
      complete: setup.propertyCount > 0,
      helper: "Create at least one property shell before importing units.",
      icon: Building2,
      label: "Properties",
    },
    {
      actionHref: "/import",
      actionLabel: setup.propertyCount > 0 ? "Import units" : "Open imports",
      complete: setup.unitCount > 0,
      helper: "Upload the unit rent roll after property codes exist.",
      icon: Upload,
      label: "Units",
    },
    {
      actionHref: "/people?action=create",
      actionLabel: "Add person",
      complete: setup.peopleCount > 0,
      helper: "Add tenants, owners, vendors, or staff records.",
      icon: UsersRound,
      label: "People",
    },
    {
      actionHref: "/leases?action=create",
      actionLabel: "Add lease",
      complete: setup.activeLeaseCount > 0,
      helper: "Link tenants to units so occupancy and lease risk work.",
      icon: ScrollText,
      label: "Leases",
    },
    {
      actionHref: "/ledger?action=create",
      actionLabel: "Add ledger",
      complete: setup.ledgerEntryCount > 0,
      helper: "Add opening rent or expense rows when finance is ready.",
      icon: BookOpen,
      label: "Ledger",
    },
  ];
}

function isBaseSetupComplete(setup: OverviewScreenData["workspaceSetup"]) {
  return (
    setup.propertyCount > 0 &&
    setup.unitCount > 0 &&
    setup.peopleCount > 0 &&
    setup.activeLeaseCount > 0
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
          <CircleCheck className="mt-0.5 shrink-0" size={16} />
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

function FinanceLensWorkspace({
  data,
  financeView,
  lensAttentionItems,
}: {
  data: OverviewScreenData;
  financeView: OverviewFinanceView;
  lensAttentionItems: OverviewAttentionItem[];
}) {
  return (
    <section className="space-y-3">
      <FinanceViewTabs financeView={financeView} />
      {financeView === "property-ranking" ? (
        <ChartPanel
          actionHref="/reports/property-performance"
          actionLabel="Open report"
          title="Property Ranking"
        >
          <PropertyRankingTable properties={data.companyFinance.properties} />
        </ChartPanel>
      ) : null}
      {financeView === "owner-receivables" ? (
        <ChartPanel
          actionHref="/bills-expenses"
          actionLabel="Open bills"
          title="Owner Receivables"
        >
          <OwnerReceivablesTable receivables={data.companyFinance.ownerReceivables} />
        </ChartPanel>
      ) : null}
      {financeView === "ledger" ? (
        <section className={getLensGridClass("finance")}>
          {getLensChartConfigs("finance").map((chart) => (
            <ChartPanel
              actionHref={chart.actionHref}
              actionLabel={chart.actionLabel}
              className={getChartPanelClass(chart, "finance")}
              key={chart.key}
              title={chart.title}
            >
              <OverviewChart
                config={chart}
                data={data}
                lens="finance"
                lensAttentionItems={lensAttentionItems}
              />
            </ChartPanel>
          ))}
        </section>
      ) : null}
      {financeView === "company-pnl" ? (
        <section className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <ChartPanel
            actionHref="/rent-income"
            actionLabel="Add income"
            className="xl:row-span-2"
            title="Company P&L trend"
          >
            <LedgerFlowChart
              className="h-60 xl:h-64"
              currency={data.ledgerCurrency}
              points={data.companyFinance.monthlyPnl}
            />
          </ChartPanel>
          <ChartPanel
            actionHref="/bills-expenses"
            actionLabel="Open bills"
            title="Revenue and cost"
          >
            <CompanyPnlBreakdown data={data} />
          </ChartPanel>
          <ChartPanel
            actionHref="/overview?lens=finance&financeView=owner-receivables"
            actionLabel="Review"
            title="Urgent finance actions"
          >
            <LensQueue items={lensAttentionItems} />
          </ChartPanel>
        </section>
      ) : null}
    </section>
  );
}

function FinanceViewTabs({ financeView }: { financeView: OverviewFinanceView }) {
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 shadow-sm">
      {financeViewTabs.map((tab) => {
        const isActive = tab.key === financeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-accent text-white shadow-sm"
                : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
            )}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function CompanyPnlBreakdown({ data }: { data: OverviewScreenData }) {
  const rows = [
    {
      href: "/rent-income?query=management",
      icon: TrendingUp,
      label: "Company revenue",
      value: data.companyFinance.companyRevenue,
    },
    {
      href: "/bills-expenses?query=company",
      icon: ReceiptText,
      label: "Company costs",
      value: data.companyFinance.companyCost,
    },
    {
      href: "/overview?lens=finance&financeView=owner-receivables",
      icon: Landmark,
      label: "Owner receivable",
      value: data.companyFinance.ownerReceivable,
    },
    {
      href: "/overview?lens=finance&financeView=company-pnl",
      icon: DollarSign,
      label: "Net P&L",
      value: data.companyFinance.companyNet,
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const Icon = row.icon;

        return (
          <Link
            className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-surface-muted"
            href={row.href}
            key={row.label}
          >
            <Icon className="text-foreground-subtle" size={14} />
            <span className="truncate text-[13px] font-medium">{row.label}</span>
            <span className="text-right text-[13px] font-semibold tabular-nums">
              <MoneyDisplay value={row.value} />
            </span>
          </Link>
        );
      })}
      <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-foreground-muted">
        Margin:{" "}
        <span className="font-semibold text-foreground">
          {data.companyFinance.marginLabel}
        </span>
      </div>
    </div>
  );
}

function PropertyRankingTable({
  properties,
}: {
  properties: OverviewScreenData["companyFinance"]["properties"];
}) {
  if (properties.length === 0) {
    return <EmptyPanelText>No company P&L rows exist for this period.</EmptyPanelText>;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.4fr)_120px_120px_130px_120px_80px] gap-3 border-b border-border bg-background/45 px-3 py-2 text-xs font-medium text-foreground-subtle">
        <span>Property</span>
        <span className="text-right">Revenue</span>
        <span className="text-right">Costs</span>
        <span className="text-right">Receivable</span>
        <span className="text-right">Net</span>
        <span className="text-right">Margin</span>
      </div>
      <div className="max-h-[520px] min-w-0 overflow-auto">
        {properties.map((property) => (
          <Link
            className="grid min-w-[760px] grid-cols-[minmax(220px,1.4fr)_120px_120px_130px_120px_80px] gap-3 border-b border-border px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-surface-muted"
            href={property.href}
            key={property.href}
          >
            <span className="truncate font-medium">{property.label}</span>
            <span className="text-right tabular-nums">
              <MoneyDisplay value={property.companyRevenue} />
            </span>
            <span className="text-right tabular-nums">
              <MoneyDisplay value={property.companyCost} />
            </span>
            <span className="text-right tabular-nums">
              <MoneyDisplay value={property.ownerReceivable} />
            </span>
            <span
              className={cn(
                "text-right font-semibold tabular-nums",
                property.netContributionAmount < 0 ? "text-danger" : "text-success",
              )}
            >
              <MoneyDisplay value={property.netContribution} />
            </span>
            <span className="text-right text-foreground-muted">
              {property.marginLabel}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function OwnerReceivablesTable({
  receivables,
}: {
  receivables: OverviewScreenData["companyFinance"]["ownerReceivables"];
}) {
  if (receivables.length === 0) {
    return <EmptyPanelText>No open owner receivables for company advances.</EmptyPanelText>;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <div className="grid min-w-[760px] grid-cols-[110px_minmax(190px,1fr)_minmax(180px,1fr)_110px_120px_130px] gap-3 border-b border-border bg-background/45 px-3 py-2 text-xs font-medium text-foreground-subtle">
        <span>Invoice</span>
        <span>Property</span>
        <span>Vendor / bill</span>
        <span>Status</span>
        <span className="text-right">Reimbursed</span>
        <span className="text-right">Receivable</span>
      </div>
      <div className="max-h-[520px] min-w-0 overflow-auto">
        {receivables.map((row) => (
          <Link
            className="grid min-w-[760px] grid-cols-[110px_minmax(190px,1fr)_minmax(180px,1fr)_110px_120px_130px] gap-3 border-b border-border px-3 py-2.5 text-[13px] last:border-b-0 hover:bg-surface-muted"
            href={row.href}
            key={`${row.href}-${row.invoiceDate}-${row.vendorLabel}`}
          >
            <span className="text-foreground-muted">{formatDate(row.invoiceDate)}</span>
            <span className="truncate font-medium">{row.propertyLabel}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.vendorLabel}</span>
              <span className="block truncate text-xs text-foreground-subtle">
                {row.label}
              </span>
            </span>
            <span className="truncate text-foreground-muted">{row.billStatus}</span>
            <span className="text-right tabular-nums">
              <MoneyDisplay value={row.reimbursed} />
            </span>
            <span className="text-right font-semibold tabular-nums text-warning">
              <MoneyDisplay value={row.ownerReceivable} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({
  actionHref,
  actionLabel,
  children,
  className,
  description,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-border bg-surface p-3 shadow-sm",
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
          <ArrowRight size={12} />
        </Link>
      </div>
      <div className="pt-3">
        {children}
      </div>
    </section>
  );
}

function OverviewChart({
  config,
  data,
  lens,
  lensAttentionItems,
}: {
  config: OverviewChartConfig;
  data: OverviewScreenData;
  lens: OverviewLens;
  lensAttentionItems: OverviewAttentionItem[];
}) {
  if (config.key === "ledger") {
    return (
      <LedgerFlowChart
        className={lens === "finance" ? "h-60 xl:h-64" : "h-52 xl:h-56"}
        currency={data.ledgerCurrency}
        points={data.ledgerFlow}
      />
    );
  }

  if (config.key === "leases") {
    return <LeaseEndingChart points={data.leaseEndings} />;
  }

  if (config.key === "queue") {
    return <LensQueue items={lensAttentionItems} />;
  }

  return (
    <OccupancyChart
      limit={lens === "all" ? 5 : 4}
      points={data.occupancyByProperty}
    />
  );
}

function LensQueue({ items }: { items: OverviewAttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-40 items-center gap-2 rounded-md border border-success/20 bg-success-soft/30 px-3 py-3 text-sm text-success">
        <CircleCheck size={16} />
        <span>No open checks for this lens.</span>
      </div>
    );
  }

  return (
    <div className="min-w-0 divide-y divide-border overflow-hidden rounded-md border border-border">
      {items.slice(0, 5).map((item) => (
        <Link
          className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-muted"
          href={item.href}
          key={item.label}
          title={item.helper}
        >
          <ClipboardList className="text-foreground-subtle" size={14} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">
              {item.label}
            </span>
            <span className="block truncate text-xs text-foreground-subtle">
              {item.helper}
            </span>
          </span>
          <Badge tone={item.tone}>{item.count}</Badge>
        </Link>
      ))}
    </div>
  );
}

function OccupancyChart({
  limit,
  points,
}: {
  limit?: number;
  points: OverviewScreenData["occupancyByProperty"];
}) {
  if (points.length === 0) {
    return <EmptyPanelText>No property/unit data yet.</EmptyPanelText>;
  }

  return <OverviewOccupancyBars limit={limit} points={points} />;
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
        <Plus size={15} className="text-foreground-subtle" />
        <h2 className="text-sm font-semibold leading-5">Next actions</h2>
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

function getLensMetrics(
  data: OverviewScreenData,
  lens: OverviewLens,
  lensAttentionItems: OverviewAttentionItem[],
  lensAttentionTotal: number,
): PrimaryMetric[] {
  const occupancyMetric = getMetric(data.metrics, "Occupancy");
  const ledgerMetric = getMetric(data.metrics, "Ledger net");
  const activeLeasesMetric = getMetric(data.metrics, "Active leases");
  const leaseGapsMetric = getMetric(data.metrics, "Lease gaps");
  const attentionMetric = getMetric(data.metrics, "Attention");
  const openMaintenance = getAttentionCount(data.attentionItems, "Open maintenance");
  const vacantUnits = getAttentionCount(data.attentionItems, "Vacant units");
  const ownerGaps = getAttentionCount(data.attentionItems, "Properties without owner link");
  const missingContacts = getAttentionCount(data.attentionItems, "People missing contact");
  const missingRoles = getAttentionCount(data.attentionItems, "People without role");

  if (lens === "finance") {
    return [
      {
        href: "/overview?lens=finance&financeView=company-pnl",
        icon: DollarSign,
        metric: {
          helper: "Company revenue minus company costs",
          label: "Company net P&L",
          tone: data.companyFinance.companyNetAmount < 0 ? "danger" : "success",
          value: data.companyFinance.companyNet,
        },
        visualTone: data.companyFinance.companyNetAmount < 0 ? "danger" : "success",
      },
      {
        href: "/rent-income?query=management",
        icon: TrendingUp,
        metric: {
          helper: "Management fees, commissions, service fees, and markup",
          label: "Company revenue",
          tone: "neutral",
          value: data.companyFinance.companyRevenue,
        },
      },
      {
        href: "/bills-expenses?query=company",
        icon: ReceiptText,
        metric: {
          helper: "Company-only costs and unrecovered advances",
          label: "Company costs",
          tone: data.companyFinance.companyCostAmount > 0 ? "warning" : "success",
          value: data.companyFinance.companyCost,
        },
      },
      {
        href: "/overview?lens=finance&financeView=owner-receivables",
        icon: Landmark,
        metric: {
          helper: "Company advances still owed by owners",
          label: "Owner receivables",
          tone:
            data.companyFinance.ownerReceivableAmount > 0 ? "warning" : "success",
          value: data.companyFinance.ownerReceivable,
        },
      },
    ];
  }

  if (lens === "leasing") {
    return [
      {
        href: "/leases?status=current&endsWithin=60d&sort=end_asc",
        icon: CalendarClock,
        metric: {
          helper: "Leases ending in 60 days",
          label: "Renewals, 60d",
          tone: data.leaseRiskCount > 0 ? "warning" : "success",
          value: String(data.leaseRiskCount),
        },
      },
      {
        href: "/units?leaseStatus=missing",
        icon: ScrollText,
        metric: leaseGapsMetric,
      },
      {
        href: "/units?status=vacant",
        icon: DoorOpenIcon,
        metric: {
          helper: "Marked vacant",
          label: "Vacant units",
          tone: vacantUnits > 0 ? "warning" : "success",
          value: String(vacantUnits),
        },
      },
      {
        href: "/leases?status=current",
        icon: BookOpen,
        metric: activeLeasesMetric,
      },
    ];
  }

  if (lens === "maintenance") {
    return [
      {
        href: "/maintenance?review=open",
        icon: Wrench,
        metric: {
          helper: "Open cases",
          label: "Open cases",
          tone: openMaintenance > 0 ? "warning" : "success",
          value: String(openMaintenance),
        },
      },
      {
        href: "/overview?lens=maintenance",
        icon: AlertTriangle,
        metric: {
          helper: "Maintenance lens attention",
          label: "Maintenance checks",
          tone: lensAttentionTotal > 0 ? "warning" : "success",
          value: String(lensAttentionTotal),
        },
      },
      {
        href: "/ledger?period=current_month",
        icon: DollarSign,
        metric: { ...ledgerMetric, label: "Cost signal" },
        visualTone: "accent",
      },
      {
        href: "/units?occupancy=unoccupied",
        icon: Building2,
        metric: { ...occupancyMetric, label: "Unit exposure" },
      },
    ];
  }

  if (lens === "records") {
    return [
      {
        href: "/overview?lens=records",
        icon: FileText,
        metric: {
          helper: "Records lens attention",
          label: "Record checks",
          tone: lensAttentionTotal > 0 ? "warning" : "success",
          value: String(lensAttentionTotal),
        },
      },
      {
        href: "/units?leaseStatus=missing",
        icon: ScrollText,
        metric: leaseGapsMetric,
      },
      {
        href: "/properties?ownerStatus=missing",
        icon: UsersRound,
        metric: {
          helper: "Needs ownership relationship",
          label: "Owner links",
          tone: ownerGaps > 0 ? "warning" : "success",
          value: String(ownerGaps),
        },
      },
      {
        href: "/people?status=missing_contact",
        icon: UsersRound,
        metric: {
          helper: "Missing contacts or roles",
          label: "People cleanup",
          tone: missingContacts + missingRoles > 0 ? "warning" : "success",
          value: String(missingContacts + missingRoles),
        },
      },
    ];
  }

  return [
    {
      href: "/units?occupancy=unoccupied",
      icon: Building2,
      metric: occupancyMetric,
    },
    {
      href: "/ledger?period=current_month",
      icon: DollarSign,
      metric: { ...ledgerMetric, label: "Current month net" },
      visualTone: "accent",
    },
    {
      href: "/leases?status=current&endsWithin=60d&sort=end_asc",
      icon: CalendarClock,
      metric: {
        helper: "Leases ending in 60 days",
        label: "Lease risk, 60d",
        tone: data.leaseRiskCount > 0 ? "warning" : "success",
        value: String(data.leaseRiskCount),
      },
    },
    {
      href: "/overview",
      icon: AlertTriangle,
      metric: {
        ...attentionMetric,
        label: "Open checks",
        value: String(countAttention(lensAttentionItems)),
      },
    },
  ];
}

function getLensSummary(
  summary: OverviewDashboardSummary,
  data: OverviewScreenData,
  lens: OverviewLens,
  attentionTotal: number,
): OverviewDashboardSummary {
  if (lens === "all") {
    return summary;
  }

  const needsReview = attentionTotal > 0;
  const tone: OverviewMetricTone = needsReview ? "warning" : "success";

  if (lens === "finance") {
    return {
      actionHref: "/overview?lens=finance&financeView=company-pnl",
      actionLabel: "Open Company P&L",
      detail: needsReview
        ? `${attentionTotal} finance checks need review alongside ${data.companyFinance.ownerReceivable.primary} in owner receivables.`
        : `Company net P&L is ${data.companyFinance.companyNet.primary} from current company-classified rows.`,
      headline: "Finance lens is focused on company-wide P&L.",
      tone: data.companyFinance.companyNetAmount < 0 ? "danger" : tone,
    };
  }

  if (lens === "leasing") {
    return {
      actionHref: "/leases?status=current&sort=end_asc",
      actionLabel: "Open leases",
      detail: needsReview
        ? `${attentionTotal} leasing checks need lease, tenant, or vacancy review.`
        : "Lease and occupancy checks are clear from the current data.",
      headline: "Leasing lens tracks renewals, gaps, and occupancy risk.",
      tone,
    };
  }

  if (lens === "maintenance") {
    return {
      actionHref: "/maintenance?review=open",
      actionLabel: "Open cases",
      detail: needsReview
        ? `${attentionTotal} maintenance checks are open for operator follow-up.`
        : "No open maintenance checks are visible from the current data.",
      headline: "Maintenance lens keeps open work and repair pressure visible.",
      tone,
    };
  }

  return {
    actionHref: "/people?status=missing_contact",
    actionLabel: "Review records",
    detail: needsReview
      ? `${attentionTotal} record readiness checks need cleanup.`
      : "Core property, people, and lease records are clear from current checks.",
    headline: "Records lens surfaces missing links and incomplete operating data.",
    tone,
  };
}

function getLensChartConfigs(lens: OverviewLens): OverviewChartConfig[] {
  if (lens === "finance") {
    return [
      {
        actionHref: "/ledger?period=current_month",
        actionLabel: "Open ledger",
        key: "ledger",
        title: "Cash flow",
      },
      {
        actionHref: "/ledger?expenseBand=large",
        actionLabel: "Review expenses",
        key: "queue",
        title: "Finance checks",
      },
      {
        actionHref: "/leases?status=current&sort=end_asc",
        actionLabel: "Open leases",
        key: "leases",
        title: "Lease-driven cash risk",
      },
    ];
  }

  if (lens === "leasing") {
    return [
      {
        actionHref: "/leases?status=current&sort=end_asc",
        actionLabel: "Open leases",
        key: "leases",
        title: "Lease endings",
      },
      {
        actionHref: "/units?occupancy=unoccupied",
        actionLabel: "Review units",
        key: "occupancy",
        title: "Occupancy pressure",
      },
      {
        actionHref: "/leases?status=current&tenantStatus=missing",
        actionLabel: "Repair links",
        key: "queue",
        title: "Leasing checks",
      },
    ];
  }

  if (lens === "maintenance") {
    return [
      {
        actionHref: "/maintenance?review=open",
        actionLabel: "Open cases",
        key: "queue",
        title: "Maintenance queue",
      },
      {
        actionHref: "/units?occupancy=unoccupied",
        actionLabel: "Review units",
        key: "occupancy",
        title: "Unit exposure",
      },
      {
        actionHref: "/ledger?period=current_month",
        actionLabel: "Open ledger",
        key: "ledger",
        title: "Cost movement",
      },
    ];
  }

  if (lens === "records") {
    return [
      {
        actionHref: "/people?status=missing_contact",
        actionLabel: "Review records",
        key: "queue",
        title: "Record readiness",
      },
      {
        actionHref: "/units?occupancy=unoccupied",
        actionLabel: "Open units",
        key: "occupancy",
        title: "Property and unit coverage",
      },
      {
        actionHref: "/leases?status=current&sort=end_asc",
        actionLabel: "Open leases",
        key: "leases",
        title: "Lease records",
      },
    ];
  }

  return [
    {
      actionHref: "/units?occupancy=unoccupied",
      actionLabel: "Review open units",
      key: "occupancy",
      title: "Lowest occupancy by property",
    },
    {
      actionHref: "/ledger?period=current_month",
      actionLabel: "Open ledger",
      key: "ledger",
      title: "Cash movement, 6 months",
    },
    {
      actionHref: "/leases?status=current&sort=end_asc",
      actionLabel: "Open leases",
      key: "leases",
      title: "Lease endings by month",
    },
  ];
}

function getLensAttentionItems(
  items: OverviewAttentionItem[],
  lens: OverviewLens,
) {
  if (lens === "all") {
    return items;
  }

  return items.filter((item) => {
    if (lens === "finance") {
      return (
        item.href.startsWith("/ledger") ||
        item.href.includes("netStatus=negative") ||
        item.label.toLowerCase().includes("expense")
      );
    }

    if (lens === "leasing") {
      return (
        item.href.startsWith("/leases") ||
        item.href.includes("leaseStatus=missing") ||
        item.href.includes("status=vacant")
      );
    }

    if (lens === "maintenance") {
      return item.href.startsWith("/maintenance");
    }

    return (
      item.href.startsWith("/people") ||
      item.href.includes("ownerStatus=missing") ||
      item.href.includes("tenantStatus=missing") ||
      item.href.includes("leaseStatus=missing")
    );
  });
}

function countAttention(items: OverviewAttentionItem[]) {
  return items.reduce((total, item) => total + item.count, 0);
}

function getAttentionCount(items: OverviewAttentionItem[], label: string) {
  return items.find((item) => item.label === label)?.count ?? 0;
}

function getChartPanelClass(chart: OverviewChartConfig, lens: OverviewLens) {
  if (lens === "finance" && chart.key === "ledger") {
    return "xl:row-span-2 xl:min-h-[310px]";
  }

  if (
    (lens === "leasing" || lens === "maintenance" || lens === "records") &&
    chart.key === "occupancy"
  ) {
    return "xl:row-span-2";
  }

  return undefined;
}

function getLensGridClass(lens: OverviewLens) {
  if (lens === "finance") {
    return "grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]";
  }

  if (lens === "all") {
    return "grid grid-cols-1 items-start gap-3 xl:grid-cols-3";
  }

  return "grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]";
}

function activeLensClass(lens: OverviewLens) {
  if (lens === "finance") {
    return "border-accent/40 bg-accent-soft/35";
  }

  if (lens === "leasing") {
    return "border-warning/35 bg-warning-soft/30";
  }

  if (lens === "maintenance") {
    return "border-danger/30 bg-danger-soft/25";
  }

  if (lens === "records") {
    return "border-success/30 bg-success-soft/25";
  }

  return "border-border bg-surface";
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
