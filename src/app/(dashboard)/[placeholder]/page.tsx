import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Home,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricAreaChart } from "@/features/overview/components/overview-charts";
import { getPropertySummaries } from "@/features/properties/data/properties";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

type PlaceholderPageProps = {
  params: Promise<{ placeholder: string }>;
};

type DashboardPage = {
  actionHref: string;
  actionLabel: string;
  bars: DashboardBarPoint[];
  driverTitle: string;
  drivers: DashboardDriverPoint[];
  kpis: Array<{ label: string; value: string; helper: string; tone?: Tone }>;
  trend: {
    label: string;
    note: string;
    suffix?: string;
    values: Array<{ label: string; value: number }>;
  };
};

type DashboardBarPoint = {
  helper: string;
  href: string;
  imageUrl?: string;
  label: string;
  value: number;
};

type DashboardDriverPoint = {
  helper: string;
  href: string;
  imageUrl?: string;
  label: string;
  tone?: Tone;
  value: string;
  width: number;
};

type Tone = "danger" | "success" | "warning";
type VisualTone = Tone | "accent";

type SparklinePoint = { label: string; value: number };

type PlaceholderPage = {
  dashboard?: DashboardPage;
  description: string;
  room: string;
  title: string;
};

const placeholderPages: Record<string, PlaceholderPage> = {
  "property-dashboard": {
    title: "Property Dashboard",
    description: "Occupancy, ownership, and net position.",
    room: "Dashboard",
    dashboard: {
      actionHref: "/properties",
      actionLabel: "Action center",
      bars: [
        { href: "/properties", label: "Central Residence", helper: "Owner linked", value: 100 },
        { href: "/units?occupancy=unoccupied", label: "Northline Mixed Use", helper: "Vacancy review", value: 42 },
        { href: "/properties?ownerStatus=missing", label: "Stress Residence 04", helper: "Missing owner", value: 64 },
        { href: "/units?property=j-tower&occupancy=unoccupied", label: "J Tower cluster", helper: "Leasing follow-up", value: 65 },
      ],
      driverTitle: "Vacancy by property",
      drivers: [
        { href: "/units?property=central&occupancy=unoccupied", label: "Central Residence", helper: "Nearly full", value: "2 units", width: 12, tone: "success" },
        { href: "/units?property=j-tower&occupancy=unoccupied", label: "J Tower cluster", helper: "Leasing follow-up", value: "18 units", width: 48, tone: "warning" },
        { href: "/units?property=stress&occupancy=unoccupied", label: "Stress Residence 04", helper: "Owner & lease gaps", value: "27 units", width: 64, tone: "warning" },
        { href: "/units?property=northline&occupancy=unoccupied", label: "Northline Mixed Use", helper: "Critical drop", value: "46 units", width: 92, tone: "danger" },
      ],
      kpis: [
        { label: "Occupancy", value: "78.6%", helper: "-3.1% vs Jun", tone: "warning" },
        { label: "Vacant units", value: "93", helper: "+12 this week", tone: "warning" },
        { label: "Maintenance", value: "17", helper: "Overdue", tone: "danger" },
        { label: "Lease expiring", value: "26", helper: "Next 30 days", tone: "warning" },
      ],
      trend: {
        label: "Occupancy rate",
        note: "Target 90% / Gap 11%",
        suffix: "%",
        values: [
          { label: "Feb", value: 68 },
          { label: "Mar", value: 72 },
          { label: "Apr", value: 69 },
          { label: "May", value: 76 },
          { label: "Jun", value: 78 },
          { label: "Jul", value: 79 },
        ],
      },
    },
  },
  "maintenance-dashboard": {
    title: "Maintenance Dashboard",
    description: "Open work, overdue cases, and service load.",
    room: "Dashboard",
    dashboard: {
      actionHref: "/maintenance",
      actionLabel: "Action center",
      bars: [
        { href: "/maintenance?view=overdue", label: "Plumbing", helper: "Oldest category", value: 76 },
        { href: "/maintenance?view=open", label: "Electrical", helper: "Open by trade", value: 58 },
        { href: "/schedule", label: "Inspection", helper: "Visit load", value: 46 },
        { href: "/recurring-tasks", label: "Cleaning", helper: "Recurring load", value: 34 },
      ],
      driverTitle: "Maintenance load",
      drivers: [
        { href: "/maintenance?category=plumbing&view=overdue", label: "Plumbing", helper: "Leaks and blocked drains", value: "11 open", width: 76, tone: "danger" },
        { href: "/maintenance?category=electrical&view=open", label: "Electrical", helper: "Breaker and fixture work", value: "8 open", width: 58, tone: "warning" },
        { href: "/schedule?type=inspection", label: "Inspection", helper: "Visits needing confirmation", value: "6 visits", width: 46, tone: "warning" },
        { href: "/recurring-tasks", label: "Cleaning", helper: "Routine service load", value: "4 tasks", width: 34 },
      ],
      kpis: [
        { label: "Open", value: "31", helper: "Pending + active", tone: "warning" },
        { label: "Overdue", value: "9", helper: "Past target", tone: "danger" },
        { label: "Blocked", value: "3", helper: "Needs decision", tone: "warning" },
        { label: "Due this week", value: "14", helper: "Scheduled visits" },
      ],
      trend: {
        label: "Open cases",
        note: "Target under 20 / Gap 9",
        values: [
          { label: "Feb", value: 24 },
          { label: "Mar", value: 27 },
          { label: "Apr", value: 22 },
          { label: "May", value: 35 },
          { label: "Jun", value: 31 },
          { label: "Jul", value: 29 },
        ],
      },
    },
  },
  "finance-dashboard": {
    title: "Finance Dashboard",
    description: "Cash movement, lease risk, and reports.",
    room: "Dashboard",
    dashboard: {
      actionHref: "/ledger?period=current_month",
      actionLabel: "Action center",
      bars: [
        { href: "/ledger?direction=income&period=current_month", label: "Rent income", helper: "Received / expected", value: 88 },
        { href: "/ledger?direction=expense&sort=amount_desc&period=last_30_days", label: "Maintenance expense", helper: "Largest outflow", value: 64 },
        { href: "/leases?status=current&endsWithin=60d&sort=end_asc", label: "Expiring leases", helper: "Renewal risk", value: 46 },
        { href: "/reports", label: "Owner reports", helper: "Ready periods", value: 58 },
      ],
      driverTitle: "Revenue by property",
      drivers: [
        { href: "/ledger?property=central&period=current_month", label: "Central Residence", helper: "Strong collection", value: "$52k", width: 88, tone: "success" },
        { href: "/ledger?property=j-tower&period=current_month", label: "J Tower cluster", helper: "Stable but watch expenses", value: "$31k", width: 64 },
        { href: "/ledger?property=stress&period=current_month", label: "Stress Residence 04", helper: "Owner report not ready", value: "$24k", width: 48, tone: "warning" },
        { href: "/ledger?property=northline&period=current_month", label: "Northline Mixed Use", helper: "Vacancy dragging net", value: "$14k", width: 28, tone: "danger" },
      ],
      kpis: [
        { label: "Net", value: "$128k", helper: "Current month", tone: "success" },
        { label: "Lease risk", value: "18", helper: "Expiring soon", tone: "warning" },
        { label: "Collection", value: "92%", helper: "Rent collected" },
        { label: "Expenses", value: "$24k", helper: "Recent outflow", tone: "warning" },
      ],
      trend: {
        label: "Net cash",
        note: "Target $140k / Gap $12k",
        suffix: "k",
        values: [
          { label: "Feb", value: 84 },
          { label: "Mar", value: 92 },
          { label: "Apr", value: 76 },
          { label: "May", value: 118 },
          { label: "Jun", value: 126 },
          { label: "Jul", value: 128 },
        ],
      },
    },
  },
  vendors: {
    title: "Vendors",
    description: "Service providers, categories, contacts, and assignments.",
    room: "People",
  },
  amenities: {
    title: "Amenities",
    description: "Property amenities, shared facilities, and operating notes.",
    room: "Property",
  },
  "property-inspections": {
    title: "Property Inspections",
    description: "Property-level inspection plans and condition checks.",
    room: "Property",
  },
  owners: {
    title: "Owners",
    description: "Owner records, property ownership, and communication details.",
    room: "People",
  },
  team: {
    title: "Staff",
    description: "Internal team records and property management assignments.",
    room: "People",
  },
  "work-orders": {
    title: "Work Orders",
    description: "Assigned maintenance work orders and closeout status.",
    room: "Operations",
  },
  schedule: {
    title: "Schedule",
    description: "Maintenance visits, inspections, and operational tasks.",
    room: "Operations",
  },
  tasks: {
    title: "Tasks",
    description: "Daily operational tasks, assignments, and follow-up work.",
    room: "Operations",
  },
  inspections: {
    title: "Inspections",
    description: "Operational inspection work across properties and units.",
    room: "Operations",
  },
  "recurring-tasks": {
    title: "Recurring Tasks",
    description: "Repeated maintenance and operational routines.",
    room: "Operations",
  },
  inventory: {
    title: "Inventory",
    description: "Maintenance stock, tools, and supply tracking.",
    room: "Operations",
  },
  invoices: {
    title: "Invoices",
    description: "Invoices, receipts, and billing records.",
    room: "Finance",
  },
  "petty-cash": {
    title: "Petty Cash",
    description: "Small cash expenses, reimbursements, and cash box tracking.",
    room: "Finance",
  },
  "property-timeline": {
    title: "Property Timeline",
    description: "Property-level historical records and evidence.",
    room: "Timeline",
  },
  "maintenance-timeline": {
    title: "Maintenance Timeline",
    description: "Maintenance history across properties and units.",
    room: "Timeline",
  },
  "financial-timeline": {
    title: "Financial Timeline",
    description: "Financial events, locks, and linked ledger changes.",
    room: "Timeline",
  },
  "users-roles": {
    title: "Users & Roles",
    description: "Access, roles, permissions, and account security.",
    room: "Settings",
  },
  branding: {
    title: "Branding",
    description: "Brand colors, report identity, and organization presentation.",
    room: "Settings",
  },
  "property-settings": {
    title: "Property Settings",
    description: "Property defaults and organization-level record settings.",
    room: "Settings",
  },
  "lease-settings": {
    title: "Lease Settings",
    description: "Lease defaults, terms, and operating rules.",
    room: "Settings",
  },
  "maintenance-settings": {
    title: "Maintenance Settings",
    description: "Maintenance categories, priorities, and workflow defaults.",
    room: "Settings",
  },
  "financial-settings": {
    title: "Financial Settings",
    description: "Financial defaults, reporting periods, and ledger behavior.",
    room: "Settings",
  },
  notifications: {
    title: "Notification",
    description: "Notification channels, reminders, and alert defaults.",
    room: "Settings",
  },
  security: {
    title: "Security",
    description: "Authentication posture and account safety settings.",
    room: "Settings",
  },
  "backup-data": {
    title: "Backup and Data",
    description: "Backup schedule, restore points, export, and data safety.",
    room: "Settings",
  },
  integrations: {
    title: "Integration",
    description: "External system connections and import/export endpoints.",
    room: "Settings",
  },
};

export default async function PlaceholderPage({ params }: PlaceholderPageProps) {
  const { placeholder } = await params;
  const page = placeholderPages[placeholder];

  if (!page) {
    notFound();
  }

  return page.dashboard ? (
    <DomainDashboard page={page} />
  ) : (
    <PlaceholderView page={page} />
  );
}

async function DomainDashboard({ page }: { page: PlaceholderPage }) {
  const dashboard = page.dashboard;

  if (!dashboard) {
    return null;
  }

  const imageUrls = await getDashboardPropertyImageUrls(page, dashboard);
  const drivers = dashboard.drivers.map((point) =>
    withDashboardPointImage(point, imageUrls),
  );
  const bars = dashboard.bars.map((point) =>
    withDashboardPointImage(point, imageUrls),
  );
  const leadHealth = bars.toSorted(
    (first, second) => first.value - second.value,
  )[0];
  const leadDriver = drivers[0];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid w-full max-w-[1500px] gap-3 px-4 py-3 sm:px-5 lg:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-base font-semibold leading-6 tracking-normal text-foreground">
            {page.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm"
              type="button"
            >
              <CalendarDays size={15} />
              Jul 2024
            </button>
            <button
              aria-label="Filters"
              className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm"
              title="Filters"
              type="button"
            >
              <SlidersHorizontal size={16} />
            </button>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-background shadow-sm transition-colors hover:bg-accent-strong"
              href={dashboard.actionHref}
            >
              Open
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.kpis.map((kpi, index) => (
            <MetricTile
              helper={kpi.helper}
              index={index}
              key={kpi.label}
              label={kpi.label}
              points={dashboard.trend.values}
              tone={kpi.tone}
              value={kpi.value}
            />
          ))}
        </section>

        {leadHealth && leadDriver ? (
          <section className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:grid-cols-2">
            <SignalStrip
              detail={leadHealth.label}
              href={leadHealth.href}
              label="Lowest health"
              tone={healthTone(leadHealth.value)}
              value={`${leadHealth.value}%`}
            />
            <SignalStrip
              detail={leadDriver.label}
              href={leadDriver.href}
              label="Top availability"
              tone="success"
              value={leadDriver.value}
            />
          </section>
        ) : null}

        <section className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.06fr)_minmax(420px,0.86fr)]">
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <ChartPanel
              actionHref={dashboard.actionHref}
              actionLabel="View all"
              priority="primary"
              title={dashboard.driverTitle}
            >
              <DriverList
                actionHref={dashboard.actionHref}
                footerLabel={viewAllLabel(page.title)}
                points={drivers}
              />
            </ChartPanel>

            <ChartPanel
              actionHref={dashboard.actionHref}
              actionLabel="View all"
              title="Health"
            >
              <HealthPanel points={bars} />
            </ChartPanel>
          </div>

          <ChartPanel
            actionHref={dashboard.actionHref}
            actionLabel="View all"
            title="Trend"
          >
            <TrendGraph points={dashboard.trend} />
          </ChartPanel>
        </section>
      </main>
    </div>
  );
}

function PlaceholderView({ page }: { page: PlaceholderPage }) {
  return (
    <div>
      <PageHeader description={page.description} title={page.title} />
      <main className="px-4 py-4 sm:px-6 lg:px-6">
        <section className="rounded-md border border-border bg-surface px-4 py-5">
          <p className="text-xs font-medium text-muted">{page.room}</p>
          <h2 className="mt-2 text-[15px] font-semibold text-foreground">
            Placeholder
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-foreground-muted">
            This sidebar destination is wired. The full workflow can replace
            this placeholder when this room becomes the next active build slice.
          </p>
        </section>
      </main>
    </div>
  );
}

async function getDashboardPropertyImageUrls(
  page: PlaceholderPage,
  dashboard: DashboardPage,
) {
  if (page.title !== "Property Dashboard") {
    return new Map<string, string>();
  }

  try {
    const context = await requireWorkspaceContext();
    const properties = await getPropertySummaries(context.organizationId);
    const labels = [...dashboard.drivers, ...dashboard.bars].map(
      (point) => point.label,
    );

    return new Map(
      labels.flatMap((label) => {
        const thumbnailUrl = findPropertyThumbnailUrl(label, properties);
        return thumbnailUrl ? [[label, thumbnailUrl] as const] : [];
      }),
    );
  } catch {
    return new Map<string, string>();
  }
}

function withDashboardPointImage<TPoint extends { imageUrl?: string; label: string }>(
  point: TPoint,
  imageUrls: ReadonlyMap<string, string>,
) {
  return {
    ...point,
    imageUrl: imageUrls.get(point.label),
  };
}

function findPropertyThumbnailUrl(
  label: string,
  properties: Awaited<ReturnType<typeof getPropertySummaries>>,
) {
  const normalizedLabel = normalizePropertyMatchText(label);
  const exact = properties.find(
    (property) => normalizePropertyMatchText(property.name) === normalizedLabel,
  );

  if (exact?.thumbnailUrl) {
    return exact.thumbnailUrl;
  }

  const contained = properties.find((property) => {
    const propertyName = normalizePropertyMatchText(property.name);
    return (
      property.thumbnailUrl &&
      (normalizedLabel.includes(propertyName) ||
        propertyName.includes(normalizedLabel))
    );
  });

  if (contained?.thumbnailUrl) {
    return contained.thumbnailUrl;
  }

  const labelTokens = normalizePropertyTokens(normalizedLabel);
  const tokenMatch = properties.find((property) => {
    if (!property.thumbnailUrl) {
      return false;
    }

    const propertyName = normalizePropertyMatchText(property.name);
    return labelTokens.length > 0 && labelTokens.every((token) => propertyName.includes(token));
  });

  return tokenMatch?.thumbnailUrl;
}

function normalizePropertyMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePropertyTokens(value: string) {
  const ignored = new Set(["and", "cluster", "property", "residence"]);

  return value
    .split(" ")
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function MetricTile({
  helper,
  index,
  label,
  points,
  tone,
  value,
}: {
  helper: string;
  index: number;
  label: string;
  points: SparklinePoint[];
  tone?: Tone;
  value: string;
}) {
  const visualTone = index === 0 ? "accent" : tone;
  const helperTone = helper.trim().startsWith("+") ? "success" : tone;

  return (
    <div
      className={cn(
        "relative min-h-[76px] overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-sm",
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px]",
        toneRuleClass(visualTone),
      )}
      title={helper}
    >
      <div className="grid grid-cols-[38px_minmax(0,1fr)_58px] items-center gap-2">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            iconShellClass(visualTone),
          )}
        >
          {metricIcon(label, toneTextClass(visualTone), 18)}
        </span>
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-[9px] font-semibold uppercase tracking-normal text-foreground-subtle sm:text-[10px]">
            {label}
          </span>
          <span className="block text-[22px] font-semibold leading-6 tracking-normal text-foreground">
            {value}
          </span>
          <span className={cn("mt-0.5 block truncate text-[10px] font-medium", toneTextClass(helperTone))}>
            {helper}
          </span>
        </span>
        <MiniSparkline index={index} points={points} tone={visualTone} />
      </div>
    </div>
  );
}

function SignalStrip({
  detail,
  href,
  label,
  tone,
  value,
}: {
  detail: string;
  href: string;
  label: string;
  tone?: Tone;
  value: string;
}) {
  return (
    <Link
      className="flex min-w-0 items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] transition-colors last:border-b-0 hover:bg-surface-muted sm:border-b-0 sm:border-r sm:last:border-r-0"
      href={href}
      prefetch={false}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          iconShellClass(tone),
        )}
      >
        {tone === "success" ? (
          <ShieldCheck className={toneTextClass(tone)} size={14} />
        ) : (
          <MapPin className={toneTextClass(tone)} size={14} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="shrink-0 font-semibold text-foreground">{label}</span>
        <span className="min-w-0 truncate text-foreground-muted">{detail}</span>
      </span>
      <span className={cn("shrink-0 font-semibold tabular-nums", toneTextClass(tone))}>
        {value}
      </span>
    </Link>
  );
}

function ChartPanel({
  actionHref,
  actionLabel,
  children,
  priority = "secondary",
  title,
}: {
  actionHref: string;
  actionLabel: string;
  children: React.ReactNode;
  priority?: "primary" | "secondary";
  title: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-border bg-surface p-3 shadow-sm",
        priority === "primary" ? "xl:min-h-0" : null,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
        <h2 className="text-sm font-semibold leading-5 tracking-normal text-foreground">
          {title}
        </h2>
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors hover:bg-surface-muted hover:text-accent-strong"
          href={actionHref}
        >
          {actionLabel}
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="pt-3">
        {children}
      </div>
    </section>
  );
}

function HealthPanel({
  points,
}: {
  points: DashboardPage["bars"];
}) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-2">
      {points.map((point) => {
        const tone = healthTone(point.value);

        return (
          <Link
            className="group grid min-w-0 gap-1 rounded-md px-2 py-1 transition-colors hover:bg-surface-muted"
            href={point.href}
            key={point.label}
            title={point.helper}
          >
            <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full",
                  iconShellClass(tone),
                )}
              >
                {tone === "success" ? (
                  <ShieldCheck className={toneTextClass(tone)} size={12} />
                ) : (
                  <TriangleAlert className={toneTextClass(tone)} size={12} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-foreground">
                  {point.label}
                </span>
                <span className="block truncate text-[10px] text-foreground-subtle">
                  {point.helper}
                </span>
              </span>
              <span className={cn("font-semibold tabular-nums", toneTextClass(tone))}>
                {point.value}%
              </span>
            </div>
            <span className="ml-7 block h-1 overflow-hidden rounded-full bg-chart-track">
              <span
                className={cn("block h-full rounded-full", toneBgClass(tone))}
                style={{ width: `${point.value}%` }}
              />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function TrendGraph({ points }: { points: DashboardPage["trend"] }) {
  const first = points.values[0];
  const last = points.values.at(-1);
  const delta = first && last ? last.value - first.value : 0;
  const lowPoint = points.values.reduce((lowest, point) =>
    point.value < lowest.value ? point : lowest,
  );
  const highPoint = points.values.reduce((highest, point) =>
    point.value > highest.value ? point : highest,
  );
  const target = points.suffix === "%" ? 90 : undefined;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xs font-medium text-foreground-muted">
          {points.label}
        </span>
        <span className="text-2xl font-semibold leading-7 tabular-nums text-foreground">
          {last ? formatTrendValue(last.value, points.suffix) : "0"}
        </span>
        <span className="inline-flex rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
          {delta >= 0 ? "+" : ""}
          {formatTrendValue(delta, points.suffix)} vs {first?.label}
        </span>
        <span className="inline-flex rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground-muted">
          {points.note}
        </span>
      </div>
      <OverviewMetricAreaChart
        className="h-72 xl:h-[430px]"
        name={points.label}
        points={points.values}
        suffix={points.suffix}
        target={target}
      />
      <div className="sr-only">
        Low {formatTrendValue(lowPoint.value, points.suffix)} in {lowPoint.label};
        high {formatTrendValue(highPoint.value, points.suffix)} in {highPoint.label}.
        {points.note}
      </div>
    </div>
  );
}

function formatTrendValue(value: number, suffix: string | undefined) {
  return `${value}${suffix ?? ""}`;
}

function DriverList({
  actionHref,
  footerLabel,
  points,
}: {
  actionHref: string;
  footerLabel: string;
  points: DashboardPage["drivers"];
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_104px_116px] border-b border-border px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-normal text-foreground-subtle sm:grid">
        <span>Property</span>
        <span className="text-right">Vacant units</span>
        <span className="text-right">Availability</span>
      </div>
      {points.map((point, index) => (
        <Link
          className="grid min-w-0 gap-2.5 rounded-md border-b border-border px-2 py-2.5 transition-colors last:border-b-0 hover:bg-surface-muted sm:grid-cols-[minmax(0,1fr)_104px_116px] sm:items-center"
          href={point.href}
          key={point.label}
          title={point.helper}
        >
          <div className="grid min-w-0 grid-cols-[24px_38px_minmax(0,1fr)] items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-surface-muted text-[12px] font-semibold text-muted ring-1 ring-border">
              {index + 1}
            </span>
            <BuildingThumb
              className="size-9"
              imageUrl={point.imageUrl}
              label={point.label}
              tone={point.tone}
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {point.label}
              </span>
              <span
                className={cn(
                  "mt-1 inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  helperBadgeClass(point.tone),
                )}
              >
                {point.helper}
              </span>
            </span>
          </div>
          <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
              <span className="text-[11px] font-semibold uppercase text-foreground-subtle sm:hidden">
              Vacant units
            </span>
            <span className={cn("block text-[14px] font-semibold tabular-nums", toneTextClass(point.tone))}>
              {point.value}
            </span>
            <span className="mt-0.5 hidden text-[12px] text-foreground-subtle sm:block">
              {point.width.toFixed(1)}%
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-chart-track">
                <span
                  className={cn("block h-full rounded-full", toneBgClass(point.tone))}
                  style={{ width: `${point.width}%` }}
                />
              </span>
            </div>
          </div>
        </Link>
      ))}
      <div className="flex justify-center border-t border-border pt-1.5">
        <Link
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-strong"
          href={actionHref}
          prefetch={false}
        >
          {footerLabel}
          <ArrowUpRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function viewAllLabel(title: string) {
  const noun = title.replace(/\s+Dashboard$/, "").toLowerCase();

  if (noun === "property") {
    return "View all properties";
  }

  return `View all ${noun}`;
}

function BuildingThumb({
  className,
  imageUrl,
  label,
  tone,
}: {
  className?: string;
  imageUrl?: string;
  label?: string;
  tone?: Tone;
}) {
  const thumbClassName = cn(
    "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border shadow-sm",
    imageUrl ? "border-border bg-cover bg-center" : buildingShellClass(tone),
    className,
  );

  if (imageUrl) {
    return (
      <span
        aria-label={label ? `${label} photo` : "Property photo"}
        className={thumbClassName}
        role="img"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
    );
  }

  return (
    <span className={thumbClassName} aria-hidden="true">
      <span className="absolute bottom-1 left-1 h-6 w-3 rounded-[2px] bg-white/65" />
      <span className="absolute bottom-1 right-1 h-8 w-4 rounded-[2px] bg-white/78" />
      <Building2 className="relative text-slate-800/70" size={25} strokeWidth={1.7} />
    </span>
  );
}

function MiniSparkline({
  index,
  points,
  tone,
}: {
  index: number;
  points: SparklinePoint[];
  tone?: VisualTone;
}) {
  const values = points.map((point, pointIndex) =>
    point.value + (index - 1) * 1.8 + (pointIndex % 2 === 0 ? 0 : index),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = values
    .map((value, pointIndex) => {
      const x = 4 + pointIndex * (68 / Math.max(1, values.length - 1));
      const y = 34 - ((value - min) / range) * 24;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="h-7 w-[58px]"
      preserveAspectRatio="none"
      viewBox="0 0 76 40"
    >
      <polyline
        fill="none"
        points={coordinates}
        stroke={toneStroke(tone)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function healthTone(value: number): Tone {
  if (value < 50) {
    return "danger";
  }

  if (value < 80) {
    return "warning";
  }

  return "success";
}

function metricIcon(label: string, className: string, size = 25) {
  const normalized = label.toLowerCase();

  if (normalized.includes("vacant")) {
    return <Home className={className} size={size} strokeWidth={1.8} />;
  }

  if (normalized.includes("maintenance") || normalized.includes("open")) {
    return <Wrench className={className} size={size} strokeWidth={1.8} />;
  }

  if (normalized.includes("lease") || normalized.includes("due")) {
    return <CalendarDays className={className} size={size} strokeWidth={1.8} />;
  }

  return <Building2 className={className} size={size} strokeWidth={1.8} />;
}

function toneBgClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "bg-danger";
  }

  if (tone === "warning") {
    return "bg-warning";
  }

  if (tone === "success") {
    return "bg-success";
  }

  return "bg-accent";
}

function toneTextClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "text-danger";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "success") {
    return "text-success";
  }

  return "text-accent";
}

function toneRuleClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "before:bg-danger";
  }

  if (tone === "warning") {
    return "before:bg-warning";
  }

  if (tone === "success") {
    return "before:bg-success";
  }

  return "before:bg-accent";
}

function iconShellClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "bg-danger-soft";
  }

  if (tone === "warning") {
    return "bg-warning-soft";
  }

  if (tone === "success") {
    return "bg-success-soft";
  }

  return "bg-accent-soft";
}

function buildingShellClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "border-danger/20 bg-danger-soft";
  }

  if (tone === "warning") {
    return "border-warning/25 bg-warning-soft";
  }

  if (tone === "success") {
    return "border-success/20 bg-success-soft";
  }

  return "border-accent/20 bg-accent-soft";
}

function helperBadgeClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "bg-danger-soft text-danger";
  }

  if (tone === "warning") {
    return "bg-warning-soft text-warning";
  }

  if (tone === "success") {
    return "bg-success-soft text-success";
  }

  return "bg-accent-soft text-accent";
}

function toneStroke(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "var(--danger)";
  }

  if (tone === "warning") {
    return "var(--warning)";
  }

  if (tone === "success") {
    return "var(--success)";
  }

  return "var(--accent)";
}
