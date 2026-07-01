import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

type PlaceholderPageProps = {
  params: Promise<{ placeholder: string }>;
};

type DashboardPage = {
  actionHref: string;
  actionLabel: string;
  bars: Array<{ href: string; label: string; helper: string; value: number }>;
  driverTitle: string;
  drivers: Array<{ href: string; label: string; helper: string; value: string; width: number; tone?: Tone }>;
  kpis: Array<{ label: string; value: string; helper: string; tone?: Tone }>;
  trend: {
    label: string;
    note: string;
    suffix?: string;
    values: Array<{ label: string; value: number }>;
  };
};

type Tone = "danger" | "success" | "warning";

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
        { href: "/properties?netStatus=negative&sort=net_asc", label: "J Tower cluster", helper: "Negative net", value: 58 },
      ],
      driverTitle: "Vacancy by property",
      drivers: [
        { href: "/units?property=central&occupancy=unoccupied", label: "Central Residence", helper: "Nearly full; keep renewals current", value: "2 units", width: 12, tone: "success" },
        { href: "/units?property=j-tower&occupancy=unoccupied", label: "J Tower cluster", helper: "Leasing follow-up needed", value: "18 units", width: 48, tone: "warning" },
        { href: "/units?property=stress&occupancy=unoccupied", label: "Stress Residence 04", helper: "Owner and lease gaps overlap", value: "27 units", width: 64, tone: "warning" },
        { href: "/units?property=northline&occupancy=unoccupied", label: "Northline Mixed Use", helper: "Critical occupancy drop", value: "46 units", width: 92, tone: "danger" },
      ],
      kpis: [
        { label: "Occupancy", value: "78.6%", helper: "Down 3.1%", tone: "warning" },
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
  "people-dashboard": {
    title: "People Dashboard",
    description: "Tenant, owner, vendor, and team coverage.",
    room: "Dashboard",
    dashboard: {
      actionHref: "/people",
      actionLabel: "Action center",
      bars: [
        { href: "/tenants", label: "Tenants", helper: "Active lease links", value: 86 },
        { href: "/owners", label: "Owners", helper: "Property links", value: 64 },
        { href: "/vendors", label: "Vendors", helper: "Service contacts", value: 52 },
        { href: "/team", label: "PM team", helper: "Assignments", value: 38 },
      ],
      driverTitle: "Relationship gaps",
      drivers: [
        { href: "/people?contact=missing", label: "Missing contacts", helper: "No phone or email", value: "11 people", width: 78, tone: "danger" },
        { href: "/properties?ownerStatus=missing", label: "Owner links", helper: "Properties without owner contact", value: "4 properties", width: 58, tone: "warning" },
        { href: "/vendors", label: "Vendor coverage", helper: "Trades without backup vendor", value: "3 trades", width: 44, tone: "warning" },
        { href: "/team", label: "PM assignments", helper: "Properties without a named PM", value: "2 gaps", width: 32 },
      ],
      kpis: [
        { label: "Contact coverage", value: "91%", helper: "11 gaps", tone: "warning" },
        { label: "Owner links", value: "67%", helper: "8 / 12 complete", tone: "warning" },
        { label: "Vendor backup", value: "73%", helper: "3 trades exposed", tone: "warning" },
        { label: "Contact gaps", value: "11", helper: "Missing contact", tone: "danger" },
      ],
      trend: {
        label: "Active people",
        note: "Coverage goal 95% / Contact gap 9%",
        values: [
          { label: "Feb", value: 90 },
          { label: "Mar", value: 97 },
          { label: "Apr", value: 103 },
          { label: "May", value: 112 },
          { label: "Jun", value: 121 },
          { label: "Jul", value: 126 },
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
  "timeline-dashboard": {
    title: "Timeline Dashboard",
    description: "Recent changes and evidence coverage.",
    room: "Dashboard",
    dashboard: {
      actionHref: "/timeline",
      actionLabel: "Action center",
      bars: [
        { href: "/timeline", label: "Global changes", helper: "All activity", value: 92 },
        { href: "/property-timeline", label: "Property evidence", helper: "Property docs + notes", value: 68 },
        { href: "/maintenance-timeline", label: "Maintenance history", helper: "Service events", value: 57 },
        { href: "/financial-timeline", label: "Financial events", helper: "Ledger-linked", value: 49 },
      ],
      driverTitle: "Evidence coverage",
      drivers: [
        { href: "/timeline?type=lease", label: "Lease events", helper: "Renewals and notices", value: "7 recent", width: 72, tone: "warning" },
        { href: "/maintenance-timeline", label: "Maintenance evidence", helper: "Work photos and closeouts", value: "6 events", width: 62, tone: "warning" },
        { href: "/financial-timeline", label: "Ledger evidence", helper: "Linked financial events", value: "4 events", width: 48 },
        { href: "/property-timeline", label: "Property documents", helper: "Missing proof on key changes", value: "5 gaps", width: 42, tone: "danger" },
      ],
      kpis: [
        { label: "Changed today", value: "19", helper: "Recent events" },
        { label: "Evidence gaps", value: "5", helper: "Missing proof", tone: "danger" },
        { label: "Maintenance", value: "6", helper: "Needs closeout", tone: "warning" },
        { label: "Lease follow-up", value: "3", helper: "Renewal or notice", tone: "warning" },
      ],
      trend: {
        label: "Logged events",
        note: "Target: every key event has evidence",
        values: [
          { label: "Feb", value: 7 },
          { label: "Mar", value: 11 },
          { label: "Apr", value: 9 },
          { label: "May", value: 15 },
          { label: "Jun", value: 18 },
          { label: "Jul", value: 19 },
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

function DomainDashboard({ page }: { page: PlaceholderPage }) {
  const dashboard = page.dashboard;

  if (!dashboard) {
    return null;
  }

  return (
    <div>
      <PageHeader description={page.description} title={page.title} />
      <main className="min-h-screen bg-background px-4 py-3 sm:px-5 lg:px-5">
        <div className="mx-auto grid w-full max-w-[1500px] gap-3">
          <section className="min-w-0 rounded-md border border-border bg-surface p-3 shadow-sm">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-md bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent">
                  {page.room}
                </span>
              </div>
              <Link
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                href={dashboard.actionHref}
              >
                {dashboard.actionLabel}
              </Link>
            </div>

            <div className="mt-3 grid overflow-hidden rounded-md border border-border bg-background/35 sm:grid-cols-2 xl:grid-cols-4">
              {dashboard.kpis.map((kpi) => (
                <MetricTile
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  helper={kpi.helper}
                  tone={kpi.tone}
                />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <ChartPanel
              actionHref={dashboard.actionHref}
              actionLabel="Open"
              priority="primary"
              title={dashboard.driverTitle}
            >
              <DriverList points={dashboard.drivers} priority="primary" />
            </ChartPanel>

            <div className="grid min-w-0 grid-cols-1 gap-3">
              <ChartPanel
                actionHref={dashboard.actionHref}
                actionLabel="Open"
                title="Trend"
              >
                <TrendGraph points={dashboard.trend} />
              </ChartPanel>

              <ChartPanel
                actionHref={dashboard.actionHref}
                actionLabel={dashboard.actionLabel}
                title="Health"
              >
                <BarChartList points={dashboard.bars} />
              </ChartPanel>
            </div>
          </section>
        </div>
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

function MetricTile({
  helper,
  label,
  tone,
  value,
}: {
  helper: string;
  label: string;
  tone?: Tone;
  value: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[64px] border-b border-border px-3 py-2 transition-colors last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0",
        tileToneClass(tone),
      )}
      title={helper}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0] text-foreground-subtle">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-semibold leading-5 tabular-nums text-foreground">
        {value}
      </p>
      <p className={cn("mt-0.5 truncate text-[11px] font-medium", rowToneClass(tone))}>
        {helper}
      </p>
    </div>
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
        "min-w-0 rounded-md border border-border bg-surface p-3 shadow-sm",
        priority === "primary" ? "xl:min-h-[260px]" : null,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold leading-5 tracking-tight">
          {title}
        </h2>
        <Link
          className="inline-flex shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground-subtle transition-colors hover:bg-surface-muted hover:text-foreground"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </div>
      <div className="pt-3">
        {children}
      </div>
    </section>
  );
}

function BarChartList({
  points,
}: {
  points: DashboardPage["bars"];
}) {
  return (
    <div className="grid gap-1.5">
      {points.map((point) => (
        <Link
          className="group block rounded-md border border-border bg-background/35 px-2 py-1.5 transition-colors hover:bg-surface-muted"
          href={point.href}
          key={point.label}
          title={point.helper}
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium">{point.label}</span>
            <span className={cn("shrink-0 font-semibold tabular-nums", valueToneClass(point.value))}>
              {point.value}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chart-track">
            <div
              className={cn("h-full rounded-full transition-opacity group-hover:opacity-90", barToneClass(point.value))}
              style={{ width: `${point.value}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function TrendGraph({ points }: { points: DashboardPage["trend"] }) {
  const values = points.values.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = points.values[0];
  const last = points.values.at(-1);
  const delta = first && last ? last.value - first.value : 0;
  const range = Math.max(1, max - min);
  const scaleMin = points.suffix === "%" ? 0 : Math.max(0, min - range * 0.75);
  const scaleMax = points.suffix === "%" ? 100 : max + range * 0.75;
  const scaleRange = Math.max(1, scaleMax - scaleMin);
  const lowPoint = points.values.reduce((lowest, point) =>
    point.value < lowest.value ? point : lowest,
  );
  const highPoint = points.values.reduce((highest, point) =>
    point.value > highest.value ? point : highest,
  );
  const coordinates = points.values
    .map((point, index) => {
      const x = 16 + index * (208 / Math.max(1, points.values.length - 1));
      const y = 116 - ((point.value - scaleMin) / scaleRange) * 88;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-foreground-subtle">
            {points.label}
          </p>
          <p className="text-xl font-semibold leading-6 tabular-nums text-foreground">
            {last ? formatTrendValue(last.value, points.suffix) : "0"}
          </p>
        </div>
        <p className={cn("text-xs font-medium tabular-nums", rowToneClass(delta < 0 ? "warning" : "success"))}>
          {delta >= 0 ? "+" : ""}
          {formatTrendValue(delta, points.suffix)} since {first?.label}
        </p>
      </div>
      <svg
        aria-label={`${points.label} trend`}
        className="h-32 w-full"
        preserveAspectRatio="none"
        viewBox="0 0 240 140"
      >
        <line stroke="var(--border)" vectorEffect="non-scaling-stroke" x1="12" x2="232" y1="112" y2="112" />
        <line stroke="var(--border)" vectorEffect="non-scaling-stroke" x1="12" x2="232" y1="72" y2="72" />
        <line stroke="var(--border)" vectorEffect="non-scaling-stroke" x1="12" x2="232" y1="32" y2="32" />
        <polyline
          fill="none"
          points={coordinates}
          stroke="var(--accent)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-foreground-subtle">
        {points.values.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
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
  points,
  priority = "secondary",
}: {
  points: DashboardPage["drivers"];
  priority?: "primary" | "secondary";
}) {
  return (
    <div className={cn("grid", priority === "primary" ? "gap-4" : "gap-3")}>
      {points.map((point) => (
        <Link
          className={cn(
            "grid rounded-md border border-transparent transition-colors hover:border-border hover:bg-surface-muted",
            priority === "primary" ? "gap-2 px-2.5 py-2" : "gap-2 px-2.5 py-1.5",
          )}
          href={point.href}
          key={point.label}
          title={point.helper}
        >
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-foreground-muted">
              {point.label}
            </span>
            <span className={cn("font-semibold tabular-nums", rowToneClass(point.tone))}>
              {point.value}
            </span>
          </div>
          <div className={cn("overflow-hidden rounded-full bg-chart-track", priority === "primary" ? "h-3" : "h-2")}>
            <div
              className={cn("h-full rounded-full", toneBgClass(point.tone))}
              style={{ width: `${point.width}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function tileToneClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "bg-danger-soft/30";
  }

  if (tone === "warning") {
    return "bg-warning-soft/30";
  }

  if (tone === "success") {
    return "bg-success-soft/30";
  }

  return null;
}

function valueToneClass(value: number) {
  if (value < 50) {
    return "text-danger";
  }

  if (value < 80) {
    return "text-warning";
  }

  return "text-success";
}

function barToneClass(value: number) {
  if (value < 50) {
    return "bg-danger/80";
  }

  if (value < 80) {
    return "bg-warning/80";
  }

  return "bg-success/80";
}

function toneBgClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "bg-danger/80";
  }

  if (tone === "warning") {
    return "bg-warning/80";
  }

  if (tone === "success") {
    return "bg-success/80";
  }

  return "bg-accent";
}

function rowToneClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "text-danger";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "success") {
    return "text-success";
  }

  return "text-muted";
}
