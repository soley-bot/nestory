import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import {
  DashboardPeriodPicker,
  dashboardPeriodOptions,
  normalizeDashboardPeriod,
  type DashboardPeriodKey,
} from "@/components/dashboard/dashboard-period-picker";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { OverviewMetricAreaChart } from "@/features/overview/components/overview-charts";
import {
  getPropertySummaries,
  type PropertySummary,
} from "@/features/properties/data/properties";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { cn } from "@/lib/utils";

type PlaceholderPageProps = {
  params: Promise<{ placeholder: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type DashboardPage = {
  actionHref: string;
  actionLabel: string;
  bars: DashboardBarPoint[];
  driverMetricLabel?: string;
  driverProgressLabel?: string;
  driverTitle: string;
  drivers: DashboardDriverPoint[];
  finance?: FinanceDashboardData;
  healthTitle?: string;
  kpis: Array<{ label: string; value: string; helper: string; tone?: Tone }>;
  leadDriverLabel?: string;
  leadHealthLabel?: string;
  periodHref?: string;
  periodKey?: DashboardPeriodKey;
  periodLabel?: string;
  trend: {
    label: string;
    note: string;
    suffix?: string;
    values: Array<{ label: string; value: number }>;
  };
};

type PropertyDashboardCounts = {
  expiringLeases: number;
  overdueMaintenance: number;
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

type FinanceDashboardData = {
  actions: FinanceActionItem[];
  cashSteps: FinanceCashStep[];
  note: string;
  transactions: FinanceTransaction[];
};

type DashboardPeriodSnapshot = {
  actionHref?: string;
  bars: DashboardBarPoint[];
  drivers: DashboardDriverPoint[];
  finance?: FinanceDashboardData;
  kpis: DashboardPage["kpis"];
  label: string;
  trend: DashboardPage["trend"];
};

type FinanceActionItem = {
  helper: string;
  href: string;
  label: string;
  tone?: Tone;
  value: string;
};

type FinanceCashStep = {
  helper: string;
  label: string;
  tone?: Tone;
  value: string;
  width: number;
};

type FinanceTransaction = {
  date: string;
  href: string;
  label: string;
  tone?: Tone;
  value: string;
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
        { href: "/maintenance?view=calendar", label: "Inspection", helper: "Visit load", value: 46 },
        { href: "/recurring-tasks", label: "Cleaning", helper: "Recurring load", value: 34 },
      ],
      driverTitle: "Maintenance load",
      drivers: [
        { href: "/maintenance?category=plumbing&view=overdue", label: "Plumbing", helper: "Leaks and blocked drains", value: "11 open", width: 76, tone: "danger" },
        { href: "/maintenance?category=electrical&view=open", label: "Electrical", helper: "Breaker and fixture work", value: "8 open", width: 58, tone: "warning" },
        { href: "/maintenance?view=calendar&review=scheduled", label: "Inspection", helper: "Visits needing confirmation", value: "6 visits", width: 46, tone: "warning" },
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
        { href: "/ledger?direction=expense&sort=amount_desc&period=last_30_days", label: "Expense control", helper: "Largest outflow", value: 64 },
        { href: "/leases?status=current&endsWithin=60d&sort=end_asc", label: "Lease expiry risk", helper: "Renewal queue", value: 46 },
        { href: "/reports", label: "Owner reports", helper: "Ready to send", value: 58 },
      ],
      driverMetricLabel: "Net cash",
      driverProgressLabel: "Collection",
      driverTitle: "Property cash position",
      drivers: [
        { href: "/ledger?property=central&period=current_month", label: "Central Residence", helper: "Collected 96% / ready to close", value: "$52k", width: 96, tone: "success" },
        { href: "/ledger?property=j-tower&period=current_month", label: "J Tower cluster", helper: "Stable cash / watch expenses", value: "$31k", width: 88 },
        { href: "/ledger?property=stress&period=current_month", label: "Stress Residence 04", helper: "Owner report not ready", value: "$24k", width: 72, tone: "warning" },
        { href: "/ledger?property=northline&period=current_month", label: "Northline Mixed Use", helper: "Collection gap / vacancy drag", value: "$14k", width: 61, tone: "danger" },
      ],
      finance: {
        actions: [
          { href: "/leases?status=current&endsWithin=30d&sort=end_asc", label: "Lease risk", helper: "5 leases end within 30 days", value: "High", tone: "danger" },
          { href: "/reports/missing-data", label: "Owner reports", helper: "3 reports not ready to send", value: "Due", tone: "warning" },
          { href: "/ledger?direction=expense&sort=amount_desc&period=last_30_days", label: "Expense review", helper: "$4.8k maintenance spike needs review", value: "$4.8k", tone: "warning" },
          { href: "/ledger?direction=income&status=unpaid&period=current_month", label: "Collection follow-up", helper: "8 units have open rent balance", value: "8", tone: "danger" },
        ],
        cashSteps: [
          { label: "Opening cash", helper: "Start of month", value: "$112k", width: 62 },
          { label: "Rent income", helper: "Collected rent", value: "+$88k", width: 88, tone: "success" },
          { label: "Other income", helper: "Fees and deposits", value: "+$6k", width: 38, tone: "success" },
          { label: "Expenses", helper: "Maintenance + vendor", value: "-$48k", width: 72, tone: "danger" },
          { label: "Closing cash", helper: "Current position", value: "$128k", width: 82, tone: "success" },
        ],
        note: "Closing cash is above April low, but the month is still $12k under target.",
        transactions: [
          { href: "/ledger?type=rent&property=central", label: "Rent received - Central 12A", date: "Jul 1", value: "+$2,450", tone: "success" },
          { href: "/ledger?type=expense&property=j-tower", label: "Maintenance - J Tower", date: "Jun 30", value: "-$1,240", tone: "warning" },
          { href: "/ledger?type=rent&property=northline", label: "Rent received - Northline 3B", date: "Jun 30", value: "+$1,950", tone: "success" },
          { href: "/ledger?type=expense&vendor=acme", label: "Vendor payment - ACME", date: "Jun 30", value: "-$3,600", tone: "danger" },
        ],
      },
      healthTitle: "Cash movement",
      kpis: [
        { label: "Net cash", value: "$128k", helper: "+$44k vs Feb", tone: "success" },
        { label: "Lease risk", value: "18", helper: "Expiring soon", tone: "warning" },
        { label: "Collection", value: "92%", helper: "Rent collected" },
        { label: "Expenses", value: "$24k", helper: "Recent outflow", tone: "warning" },
      ],
      leadDriverLabel: "Top cash",
      leadHealthLabel: "Needs attention",
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
  "people-settings": {
    title: "People Settings",
    description: "People defaults, role labels, vendor categories, and directory controls.",
    room: "Settings",
  },
  "work-orders": {
    title: "Work Orders",
    description: "Assigned maintenance work orders and closeout status.",
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

const financePeriodSnapshots: Record<DashboardPeriodKey, DashboardPeriodSnapshot> = {
  current_month: {
    label: "Jul 2024",
    bars: financeBars("current_month", 88, 64, 46, 58),
    drivers: financeDrivers("current_month", [
      ["Central Residence", "Collected 96% / ready to close", "$52k", 96, "success"],
      ["J Tower cluster", "Stable cash / watch expenses", "$31k", 88, undefined],
      ["Stress Residence 04", "Owner report not ready", "$24k", 72, "warning"],
      ["Northline Mixed Use", "Collection gap / vacancy drag", "$14k", 61, "danger"],
    ]),
    finance: financeData("current_month", {
      actions: [
        ["Lease risk", "5 leases end within 30 days", "High", "danger", "/leases?status=current&endsWithin=30d&sort=end_asc"],
        ["Owner reports", "3 reports not ready to send", "Due", "warning", "/reports/missing-data"],
        ["Expense review", "$4.8k maintenance spike needs review", "$4.8k", "warning", "/ledger?direction=expense&sort=amount_desc"],
        ["Collection follow-up", "8 units have open rent balance", "8", "danger", "/ledger?direction=income&status=unpaid"],
      ],
      cashSteps: [
        ["Opening cash", "Start of month", "$112k", 62, undefined],
        ["Rent income", "Collected rent", "+$88k", 88, "success"],
        ["Other income", "Fees and deposits", "+$6k", 38, "success"],
        ["Expenses", "Maintenance + vendor", "-$48k", 72, "danger"],
        ["Closing cash", "Current position", "$128k", 82, "success"],
      ],
      note: "Closing cash is above April low, but the month is still $12k under target.",
      transactions: [
        ["Rent received - Central 12A", "Jul 1", "+$2,450", "success", "/ledger?type=rent&property=central"],
        ["Maintenance - J Tower", "Jun 30", "-$1,240", "warning", "/ledger?type=expense&property=j-tower"],
        ["Rent received - Northline 3B", "Jun 30", "+$1,950", "success", "/ledger?type=rent&property=northline"],
        ["Vendor payment - ACME", "Jun 30", "-$3,600", "danger", "/ledger?type=expense&vendor=acme"],
      ],
    }),
    kpis: [
      { label: "Net cash", value: "$128k", helper: "+$44k vs Feb", tone: "success" },
      { label: "Lease risk", value: "18", helper: "Expiring soon", tone: "warning" },
      { label: "Collection", value: "92%", helper: "Rent collected" },
      { label: "Expenses", value: "$24k", helper: "Recent outflow", tone: "warning" },
    ],
    trend: financeTrend("Net cash", "Target $140k / Gap $12k", [84, 92, 76, 118, 126, 128]),
  },
  last_month: {
    label: "Jun 2024",
    bars: financeBars("last_month", 84, 71, 52, 67),
    drivers: financeDrivers("last_month", [
      ["Central Residence", "Closed clean / owner sent", "$48k", 93, "success"],
      ["J Tower cluster", "Expense heavy close", "$28k", 81, "warning"],
      ["Stress Residence 04", "Late report resolved", "$21k", 69, "warning"],
      ["Northline Mixed Use", "Collection gap carried", "$11k", 54, "danger"],
    ]),
    finance: financeData("last_month", {
      actions: [
        ["Expense review", "2 June vendor lines need coding", "2", "warning", "/ledger?direction=expense&needsReview=1"],
        ["Owner reports", "12 June reports were sent", "Sent", "success", "/reports/owner-statement"],
        ["Collection follow-up", "6 balances rolled into July", "6", "warning", "/ledger?direction=income&status=unpaid"],
        ["Lease risk", "9 renewals moved to July queue", "9", "warning", "/leases?status=current&endsWithin=60d"],
      ],
      cashSteps: [
        ["Opening cash", "Start of June", "$96k", 58, undefined],
        ["Rent income", "Collected rent", "+$81k", 84, "success"],
        ["Other income", "Fees and deposits", "+$5k", 32, "success"],
        ["Expenses", "Maintenance + vendor", "-$42k", 76, "danger"],
        ["Closing cash", "Month close", "$126k", 80, "success"],
      ],
      note: "June closed positive, but expense coding and rolled balances still need cleanup.",
      transactions: [
        ["Owner payout batch", "Jun 30", "-$18,400", "warning", "/ledger?type=owner_payout"],
        ["Rent received - Central 09A", "Jun 28", "+$2,300", "success", "/ledger?type=rent&property=central"],
        ["Vendor payment - LiftCare", "Jun 26", "-$2,900", "danger", "/ledger?type=expense&vendor=liftcare"],
      ],
    }),
    kpis: [
      { label: "Net cash", value: "$126k", helper: "+$30k in Jun", tone: "success" },
      { label: "Lease risk", value: "22", helper: "Rolled into July", tone: "warning" },
      { label: "Collection", value: "89%", helper: "Rent collected", tone: "warning" },
      { label: "Expenses", value: "$29k", helper: "Month close", tone: "warning" },
    ],
    trend: financeTrend("Net cash", "Target $130k / Gap $4k", [74, 81, 96, 101, 118, 126]),
  },
  last_30_days: {
    label: "Last 30 days",
    bars: financeBars("last_30_days", 82, 68, 49, 55),
    drivers: financeDrivers("last_30_days", [
      ["Central Residence", "Strong rolling receipts", "$49k", 94, "success"],
      ["J Tower cluster", "Large maintenance spend", "$27k", 79, "warning"],
      ["Stress Residence 04", "Report pack incomplete", "$19k", 65, "warning"],
      ["Northline Mixed Use", "Aging balances open", "$9k", 46, "danger"],
    ]),
    finance: financeData("last_30_days", {
      actions: [
        ["Collection follow-up", "11 balances active in rolling window", "11", "danger", "/ledger?direction=income&status=unpaid"],
        ["Expense review", "$6.2k uncategorized outflow", "$6.2k", "warning", "/ledger?direction=expense&needsReview=1"],
        ["Owner reports", "5 rolling packs need refresh", "5", "warning", "/reports/missing-data"],
        ["Lease risk", "7 leases cross the 30-day window", "7", "warning", "/leases?status=current&endsWithin=30d"],
      ],
      cashSteps: [
        ["Opening cash", "30 days ago", "$104k", 60, undefined],
        ["Rent income", "Rolling receipts", "+$79k", 82, "success"],
        ["Other income", "Fees and deposits", "+$4k", 28, "success"],
        ["Expenses", "Rolling outflow", "-$53k", 80, "danger"],
        ["Closing cash", "Today", "$121k", 77, "success"],
      ],
      note: "Rolling cash is positive, but uncategorized expenses and unpaid balances are higher than month view.",
      transactions: [
        ["Maintenance reserve transfer", "Jul 2", "-$4,000", "warning", "/ledger?type=transfer"],
        ["Rent received - Northline 3B", "Jun 30", "+$1,950", "success", "/ledger?type=rent&property=northline"],
        ["Vendor payment - ACME", "Jun 30", "-$3,600", "danger", "/ledger?type=expense&vendor=acme"],
      ],
    }),
    kpis: [
      { label: "Net cash", value: "$121k", helper: "+$17k rolling", tone: "success" },
      { label: "Lease risk", value: "21", helper: "Rolling risk", tone: "warning" },
      { label: "Collection", value: "88%", helper: "Rent collected", tone: "warning" },
      { label: "Expenses", value: "$31k", helper: "Rolling outflow", tone: "warning" },
    ],
    trend: financeTrend("Net cash", "Target $132k / Gap $11k", [79, 86, 91, 83, 112, 121]),
  },
  qtd: {
    label: "QTD",
    bars: financeBars("qtd", 91, 74, 58, 72),
    drivers: financeDrivers("qtd", [
      ["Central Residence", "Best quarter performer", "$151k", 95, "success"],
      ["J Tower cluster", "Expense variance watch", "$89k", 84, "warning"],
      ["Stress Residence 04", "Reports lagged twice", "$64k", 73, "warning"],
      ["Northline Mixed Use", "Vacancy drag continuing", "$44k", 62, "danger"],
    ]),
    finance: financeData("qtd", {
      actions: [
        ["Owner reports", "QTD pack missing 4 source links", "4", "warning", "/reports/missing-data"],
        ["Expense review", "$14.6k above QTD maintenance plan", "$14.6k", "warning", "/ledger?direction=expense&sort=amount_desc"],
        ["Collection follow-up", "18 unit balances touched QTD", "18", "danger", "/ledger?direction=income&status=unpaid"],
        ["Lease risk", "41 leases within quarter watch", "41", "warning", "/leases?status=current&endsWithin=90d"],
      ],
      cashSteps: [
        ["Opening cash", "Quarter start", "$301k", 64, undefined],
        ["Rent income", "QTD receipts", "+$244k", 91, "success"],
        ["Other income", "QTD fees", "+$18k", 44, "success"],
        ["Expenses", "QTD outflow", "-$215k", 78, "danger"],
        ["Closing cash", "Quarter position", "$348k", 85, "success"],
      ],
      note: "Quarter cash is ahead, but maintenance variance and report source links need review.",
      transactions: [
        ["Owner statement batch", "QTD", "43 ready", "success", "/reports/owner-statement"],
        ["Maintenance spend", "QTD", "-$76k", "warning", "/ledger?direction=expense&period=qtd"],
        ["Rent receipts", "QTD", "+$244k", "success", "/ledger?direction=income&period=qtd"],
      ],
    }),
    kpis: [
      { label: "Net cash", value: "$348k", helper: "+$47k QTD", tone: "success" },
      { label: "Lease risk", value: "41", helper: "Quarter watch", tone: "warning" },
      { label: "Collection", value: "91%", helper: "QTD collected" },
      { label: "Expenses", value: "$76k", helper: "QTD outflow", tone: "warning" },
    ],
    trend: financeTrend("Net cash", "QTD target $360k / Gap $12k", [281, 302, 318, 311, 337, 348]),
  },
  ytd: {
    label: "YTD",
    bars: financeBars("ytd", 94, 69, 63, 81),
    drivers: financeDrivers("ytd", [
      ["Central Residence", "Cleanest annual cash history", "$362k", 97, "success"],
      ["J Tower cluster", "High income, high spend", "$218k", 86, "warning"],
      ["Stress Residence 04", "Report discipline improving", "$141k", 76, "warning"],
      ["Northline Mixed Use", "Vacancy drag still material", "$91k", 58, "danger"],
    ]),
    finance: financeData("ytd", {
      actions: [
        ["Collection follow-up", "27 balances appeared YTD", "27", "danger", "/ledger?direction=income&status=unpaid"],
        ["Expense review", "$38k maintenance variance YTD", "$38k", "warning", "/ledger?direction=expense&sort=amount_desc"],
        ["Owner reports", "81% statement periods ready", "81%", "success", "/reports/owner-statement"],
        ["Lease risk", "63 lease endings touched YTD", "63", "warning", "/leases?status=current&endsWithin=180d"],
      ],
      cashSteps: [
        ["Opening cash", "Year start", "$628k", 68, undefined],
        ["Rent income", "YTD receipts", "+$642k", 94, "success"],
        ["Other income", "YTD fees", "+$51k", 50, "success"],
        ["Expenses", "YTD outflow", "-$509k", 72, "danger"],
        ["Closing cash", "Year position", "$812k", 89, "success"],
      ],
      note: "YTD cash is healthy; the main story is maintenance variance and Northline vacancy drag.",
      transactions: [
        ["Rent receipts", "YTD", "+$642k", "success", "/ledger?direction=income&period=ytd"],
        ["Maintenance spend", "YTD", "-$181k", "warning", "/ledger?direction=expense&period=ytd"],
        ["Owner distributions", "YTD", "-$248k", "warning", "/ledger?type=owner_payout&period=ytd"],
      ],
    }),
    kpis: [
      { label: "Net cash", value: "$812k", helper: "+$184k YTD", tone: "success" },
      { label: "Lease risk", value: "63", helper: "YTD touched", tone: "warning" },
      { label: "Collection", value: "94%", helper: "YTD collected", tone: "success" },
      { label: "Expenses", value: "$181k", helper: "YTD maintenance", tone: "warning" },
    ],
    trend: financeTrend("Net cash", "YTD target $860k / Gap $48k", [628, 671, 703, 729, 781, 812]),
  },
};

const propertyPeriodSnapshots: Record<DashboardPeriodKey, DashboardPeriodSnapshot> = {
  current_month: propertySnapshot("current_month", {
    label: "Jul 2024",
    bars: [
      ["Central Residence", "Owner linked", 100, "/properties"],
      ["Northline Mixed Use", "Vacancy review", 42, "/units?occupancy=unoccupied"],
      ["Stress Residence 04", "Missing owner", 64, "/properties?ownerStatus=missing"],
      ["J Tower cluster", "Leasing follow-up", 65, "/units?property=j-tower&occupancy=unoccupied"],
    ],
    drivers: [
      ["Central Residence", "Nearly full", "2 units", 12, "success"],
      ["J Tower cluster", "Leasing follow-up", "18 units", 48, "warning"],
      ["Stress Residence 04", "Owner & lease gaps", "27 units", 64, "warning"],
      ["Northline Mixed Use", "Critical drop", "46 units", 92, "danger"],
    ],
    kpis: [
      { label: "Occupancy", value: "78.6%", helper: "-3.1% vs Jun", tone: "warning" },
      { label: "Vacant units", value: "93", helper: "+12 this week", tone: "warning" },
      { label: "Maintenance", value: "17", helper: "Overdue", tone: "danger" },
      { label: "Lease expiring", value: "26", helper: "Next 30 days", tone: "warning" },
    ],
    trend: percentTrend("Occupancy rate", "Target 90% / Gap 11%", [68, 72, 69, 76, 78, 79]),
  }),
  last_month: propertySnapshot("last_month", {
    label: "Jun 2024",
    bars: [
      ["Central Residence", "Owner linked", 100, "/properties"],
      ["Northline Mixed Use", "Vacancy review", 51, "/units?occupancy=unoccupied"],
      ["Stress Residence 04", "Missing owner", 70, "/properties?ownerStatus=missing"],
      ["J Tower cluster", "Leasing follow-up", 72, "/units?property=j-tower&occupancy=unoccupied"],
    ],
    drivers: [
      ["Central Residence", "Nearly full", "3 units", 15, "success"],
      ["J Tower cluster", "June lease gap", "20 units", 52, "warning"],
      ["Stress Residence 04", "Owner docs lagged", "29 units", 68, "warning"],
      ["Northline Mixed Use", "June low point", "51 units", 96, "danger"],
    ],
    kpis: [
      { label: "Occupancy", value: "76.9%", helper: "+1.8% vs May", tone: "warning" },
      { label: "Vacant units", value: "102", helper: "-7 vs May", tone: "warning" },
      { label: "Maintenance", value: "19", helper: "Overdue", tone: "danger" },
      { label: "Lease expiring", value: "31", helper: "June watch", tone: "warning" },
    ],
    trend: percentTrend("Occupancy rate", "Target 90% / Gap 13%", [66, 69, 71, 75, 77, 77]),
  }),
  last_30_days: propertySnapshot("last_30_days", {
    label: "Last 30 days",
    bars: [
      ["Central Residence", "Stable occupancy", 96, "/properties"],
      ["Northline Mixed Use", "Rolling vacancy", 45, "/units?occupancy=unoccupied"],
      ["Stress Residence 04", "Owner review", 61, "/properties?ownerStatus=missing"],
      ["J Tower cluster", "Leasing follow-up", 68, "/units?property=j-tower&occupancy=unoccupied"],
    ],
    drivers: [
      ["Central Residence", "Stable", "4 units", 18, "success"],
      ["J Tower cluster", "Rolling follow-up", "19 units", 50, "warning"],
      ["Stress Residence 04", "Owner & lease gaps", "26 units", 61, "warning"],
      ["Northline Mixed Use", "Vacancy drag", "44 units", 88, "danger"],
    ],
    kpis: [
      { label: "Occupancy", value: "79.4%", helper: "+0.8 rolling", tone: "warning" },
      { label: "Vacant units", value: "89", helper: "Rolling open", tone: "warning" },
      { label: "Maintenance", value: "15", helper: "Overdue", tone: "danger" },
      { label: "Lease expiring", value: "24", helper: "Rolling risk", tone: "warning" },
    ],
    trend: percentTrend("Occupancy rate", "Target 90% / Gap 10%", [70, 72, 74, 77, 78, 79]),
  }),
  qtd: propertySnapshot("qtd", {
    label: "QTD",
    bars: [
      ["Central Residence", "Quarter stable", 98, "/properties"],
      ["Northline Mixed Use", "Quarter vacancy", 48, "/units?occupancy=unoccupied"],
      ["Stress Residence 04", "Owner cleanup", 67, "/properties?ownerStatus=missing"],
      ["J Tower cluster", "Leasing pressure", 71, "/units?property=j-tower&occupancy=unoccupied"],
    ],
    drivers: [
      ["Central Residence", "Quarter leader", "8 avg", 18, "success"],
      ["J Tower cluster", "Quarter follow-up", "22 avg", 54, "warning"],
      ["Stress Residence 04", "Owner cleanup", "31 avg", 67, "warning"],
      ["Northline Mixed Use", "Quarter drag", "49 avg", 94, "danger"],
    ],
    kpis: [
      { label: "Occupancy", value: "77.8%", helper: "Quarter avg", tone: "warning" },
      { label: "Vacant units", value: "96", helper: "Avg open", tone: "warning" },
      { label: "Maintenance", value: "43", helper: "QTD overdue", tone: "danger" },
      { label: "Lease expiring", value: "61", helper: "Quarter watch", tone: "warning" },
    ],
    trend: percentTrend("Occupancy rate", "Target 90% / Gap 12%", [69, 70, 74, 76, 78, 78]),
  }),
  ytd: propertySnapshot("ytd", {
    label: "YTD",
    bars: [
      ["Central Residence", "Annual leader", 99, "/properties"],
      ["Northline Mixed Use", "Annual vacancy drag", 53, "/units?occupancy=unoccupied"],
      ["Stress Residence 04", "Owner cleanup", 72, "/properties?ownerStatus=missing"],
      ["J Tower cluster", "Leasing load", 74, "/units?property=j-tower&occupancy=unoccupied"],
    ],
    drivers: [
      ["Central Residence", "Best annual health", "9 avg", 20, "success"],
      ["J Tower cluster", "Annual leasing load", "24 avg", 58, "warning"],
      ["Stress Residence 04", "Owner cleanup", "34 avg", 72, "warning"],
      ["Northline Mixed Use", "Persistent vacancy", "52 avg", 98, "danger"],
    ],
    kpis: [
      { label: "Occupancy", value: "76.4%", helper: "YTD avg", tone: "warning" },
      { label: "Vacant units", value: "101", helper: "Avg open", tone: "warning" },
      { label: "Maintenance", value: "118", helper: "YTD overdue", tone: "danger" },
      { label: "Lease expiring", value: "144", helper: "YTD touched", tone: "warning" },
    ],
    trend: percentTrend("Occupancy rate", "Target 90% / Gap 14%", [65, 68, 71, 73, 75, 76]),
  }),
};

const dashboardPeriodSnapshots: Record<string, Record<DashboardPeriodKey, DashboardPeriodSnapshot>> = {
  "finance-dashboard": financePeriodSnapshots,
  "property-dashboard": propertyPeriodSnapshots,
};

function withDashboardPeriod(
  page: PlaceholderPage,
  placeholder: string,
  period: DashboardPeriodKey,
): PlaceholderPage {
  const dashboard = page.dashboard;
  const snapshots = dashboardPeriodSnapshots[placeholder];

  if (!dashboard || !snapshots) {
    return page;
  }

  const snapshot = snapshots[period] ?? snapshots.current_month;

  return {
    ...page,
    dashboard: {
      ...dashboard,
      actionHref: snapshot.actionHref ?? dashboard.actionHref,
      bars: snapshot.bars,
      drivers: snapshot.drivers,
      finance: snapshot.finance,
      kpis: snapshot.kpis,
      periodHref: `/${placeholder}`,
      periodKey: period,
      periodLabel: snapshot.label,
      trend: snapshot.trend,
    },
  };
}

function financeBars(
  period: DashboardPeriodKey,
  rentIncome: number,
  expenseControl: number,
  leaseRisk: number,
  ownerReports: number,
): DashboardBarPoint[] {
  return [
    {
      href: financeLedgerHref(period, "direction=income"),
      label: "Rent income",
      helper: "Received / expected",
      value: rentIncome,
    },
    {
      href: financeLedgerHref(period, "direction=expense&sort=amount_desc"),
      label: "Expense control",
      helper: "Largest outflow",
      value: expenseControl,
    },
    {
      href: `/leases?status=current&endsWithin=${period === "ytd" ? "180d" : period === "qtd" ? "90d" : "60d"}&sort=end_asc`,
      label: "Lease expiry risk",
      helper: "Renewal queue",
      value: leaseRisk,
    },
    {
      href: "/reports/owner-statement",
      label: "Owner reports",
      helper: "Ready to send",
      value: ownerReports,
    },
  ];
}

function financeDrivers(
  period: DashboardPeriodKey,
  rows: Array<[string, string, string, number, Tone | undefined]>,
): DashboardDriverPoint[] {
  return rows.map(([label, helper, value, width, tone]) => ({
    href: financeLedgerHref(period, `property=${propertyQuerySlug(label)}`),
    label,
    helper,
    value,
    width,
    tone,
  }));
}

function financeData(
  period: DashboardPeriodKey,
  data: {
    actions: Array<[string, string, string, Tone | undefined, string]>;
    cashSteps: Array<[string, string, string, number, Tone | undefined]>;
    note: string;
    transactions: Array<[string, string, string, Tone | undefined, string]>;
  },
): FinanceDashboardData {
  return {
    actions: data.actions.map(([label, helper, value, tone, href]) => ({
      href: appendPeriodParam(href, period),
      label,
      helper,
      value,
      tone,
    })),
    cashSteps: data.cashSteps.map(([label, helper, value, width, tone]) => ({
      label,
      helper,
      value,
      width,
      tone,
    })),
    note: data.note,
    transactions: data.transactions.map(([label, date, value, tone, href]) => ({
      href: appendPeriodParam(href, period),
      label,
      date,
      value,
      tone,
    })),
  };
}

function financeTrend(
  label: string,
  note: string,
  values: number[],
): DashboardPage["trend"] {
  const trendLabels = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

  return {
    label,
    note,
    suffix: "k",
    values: trendLabels.map((periodLabel, index) => ({
      label: periodLabel,
      value: values[index] ?? values.at(-1) ?? 0,
    })),
  };
}

function financeLedgerHref(period: DashboardPeriodKey, query = "") {
  return appendPeriodParam(`/ledger${query ? `?${query}` : ""}`, period);
}

function propertySnapshot(
  period: DashboardPeriodKey,
  data: {
    bars: Array<[string, string, number, string]>;
    drivers: Array<[string, string, string, number, Tone | undefined]>;
    kpis: DashboardPage["kpis"];
    label: string;
    trend: DashboardPage["trend"];
  },
): DashboardPeriodSnapshot {
  return {
    actionHref: appendPeriodParam("/properties", period),
    bars: data.bars.map(([label, helper, value, href]) => ({
      href: appendPeriodParam(href, period),
      label,
      helper,
      value,
    })),
    drivers: data.drivers.map(([label, helper, value, width, tone]) => ({
      href: appendPeriodParam(
        `/units?property=${propertyQuerySlug(label)}&occupancy=unoccupied`,
        period,
      ),
      label,
      helper,
      value,
      width,
      tone,
    })),
    kpis: data.kpis,
    label: data.label,
    trend: data.trend,
  };
}

function percentTrend(
  label: string,
  note: string,
  values: number[],
): DashboardPage["trend"] {
  return genericTrend(label, note, values, "%");
}

function genericTrend(
  label: string,
  note: string,
  values: number[],
  suffix?: string,
): DashboardPage["trend"] {
  const trendLabels = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

  return {
    label,
    note,
    suffix,
    values: trendLabels.map((periodLabel, index) => ({
      label: periodLabel,
      value: values[index] ?? values.at(-1) ?? 0,
    })),
  };
}

function appendPeriodParam(href: string, period: DashboardPeriodKey) {
  if (/[?&]period=/.test(href)) {
    return href;
  }

  const separator = href.includes("?") ? "&" : "?";

  return `${href}${separator}period=${period}`;
}

function propertyQuerySlug(label: string) {
  return label
    .toLowerCase()
    .replace(/\s+cluster$/, "")
    .replace(/\s+mixed use$/, "")
    .replace(/\s+residence.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function PlaceholderPage({
  params,
  searchParams,
}: PlaceholderPageProps) {
  const { placeholder } = await params;
  const rawSearchParams = await searchParams;
  const page = placeholderPages[placeholder];

  if (!page) {
    notFound();
  }

  let resolvedPage = dashboardPeriodSnapshots[placeholder]
    ? withDashboardPeriod(
        page,
        placeholder,
        normalizeDashboardPeriod(rawSearchParams.period),
      )
    : page;

  if (placeholder === "property-dashboard") {
    resolvedPage = await withLivePropertyDashboard(resolvedPage);
  }

  return resolvedPage.dashboard ? (
    <DomainDashboard page={resolvedPage} />
  ) : (
    <PlaceholderView activeHref={`/${placeholder}`} page={resolvedPage} />
  );
}

async function withLivePropertyDashboard(
  page: PlaceholderPage,
): Promise<PlaceholderPage> {
  if (!page.dashboard) {
    return page;
  }

  const context = await requireWorkspaceContext();
  const [properties, counts] = await Promise.all([
    getPropertySummaries(context.organizationId),
    getPropertyDashboardCounts(context.organizationId),
  ]);
  const dashboard = buildPropertyDashboard(page.dashboard, properties, counts);

  return {
    ...page,
    description: "Occupancy, ownership, and net position from live property records.",
    dashboard,
  };
}

async function getPropertyDashboardCounts(
  organizationId: string,
): Promise<PropertyDashboardCounts> {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const leaseWindowEnd = addDays(today, 30);
  const [maintenanceResult, leaseResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["pending", "scheduled", "in_progress", "blocked"])
      .lt("due_date", today),
    supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .in("status", ["active", "notice_given"])
      .gte("lease_end_date", today)
      .lte("lease_end_date", leaseWindowEnd),
  ]);

  if (maintenanceResult.error) {
    throw new Error(
      `Could not load property dashboard maintenance: ${maintenanceResult.error.message}`,
    );
  }

  if (leaseResult.error) {
    throw new Error(
      `Could not load property dashboard leases: ${leaseResult.error.message}`,
    );
  }

  return {
    expiringLeases: leaseResult.count ?? 0,
    overdueMaintenance: maintenanceResult.count ?? 0,
  };
}

function buildPropertyDashboard(
  baseDashboard: DashboardPage,
  properties: PropertySummary[],
  counts: PropertyDashboardCounts,
): DashboardPage {
  const totalUnits = sum(properties, (property) => property.units);
  const occupiedUnits = sum(properties, (property) => property.occupiedUnits);
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = totalUnits === 0 ? 0 : (occupiedUnits / totalUnits) * 100;
  const roundedOccupancy = Math.round(occupancyRate);
  const vacancyRows = properties
    .map(toPropertyVacancyPoint)
    .toSorted((first, second) => first.width - second.width || first.label.localeCompare(second.label))
    .slice(0, 6);
  const healthRows = properties
    .map(toPropertyHealthPoint)
    .toSorted((first, second) => first.value - second.value || first.label.localeCompare(second.label))
    .slice(0, 6);

  return {
    ...baseDashboard,
    actionHref: "/properties",
    actionLabel: "Action center",
    bars: healthRows,
    driverMetricLabel: "Vacant units",
    driverProgressLabel: "Vacancy",
    driverTitle: "Vacancy by property",
    drivers: vacancyRows,
    healthTitle: "Health",
    kpis: [
      {
        label: "Occupancy",
        value: formatPercent(occupancyRate),
        helper:
          totalUnits === 0
            ? "No units yet"
            : `${occupiedUnits}/${totalUnits} occupied`,
        tone: occupancyRate < 80 && totalUnits > 0 ? "warning" : undefined,
      },
      {
        label: "Vacant units",
        value: String(vacantUnits),
        helper:
          totalUnits === 0
            ? "Add units to track"
            : `${properties.length} ${pluralize("property", properties.length)}`,
        tone: vacantUnits > 0 ? "warning" : undefined,
      },
      {
        label: "Maintenance",
        value: String(counts.overdueMaintenance),
        helper: counts.overdueMaintenance > 0 ? "Overdue" : "No overdue cases",
        tone: counts.overdueMaintenance > 0 ? "danger" : undefined,
      },
      {
        label: "Lease expiring",
        value: String(counts.expiringLeases),
        helper: "Next 30 days",
        tone: counts.expiringLeases > 0 ? "warning" : undefined,
      },
    ],
    leadDriverLabel: "Lowest vacancy",
    leadHealthLabel: "Lowest health",
    periodKey: undefined,
    periodLabel: "Current records",
    trend: {
      label: "Occupancy rate",
      note:
        totalUnits === 0
          ? "Add units to start tracking"
          : `Target 90% / Gap ${Math.max(0, Math.round(90 - occupancyRate))}%`,
      suffix: "%",
      values: [{ label: "Now", value: roundedOccupancy }],
    },
  };
}

function toPropertyVacancyPoint(property: PropertySummary): DashboardDriverPoint {
  const vacantUnits = Math.max(0, property.units - property.occupiedUnits);
  const vacancyRate = property.units === 0 ? 0 : (vacantUnits / property.units) * 100;

  return {
    helper:
      property.units === 0
        ? "Needs units"
        : vacantUnits === 0
          ? "Fully occupied"
          : `${property.occupiedUnits}/${property.units} occupied`,
    href: buildQueryHref("/units", {
      occupancy: "unoccupied",
      propertyId: property.id,
    }),
    imageUrl: property.thumbnailUrl,
    label: property.name,
    tone: vacancyTone(vacancyRate),
    value: `${vacantUnits} ${pluralize("unit", vacantUnits)}`,
    width: Math.round(vacancyRate),
  };
}

function toPropertyHealthPoint(property: PropertySummary): DashboardBarPoint {
  const occupancyScore =
    property.units === 0 ? 0 : (property.occupiedUnits / property.units) * 70;
  const ownerScore = property.hasActiveOwnerLink ? 20 : 0;
  const netScore = property.netIncomeUsd >= 0 ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round(occupancyScore + ownerScore + netScore)));

  return {
    helper: getPropertyHealthHelper(property),
    href: `/properties/${property.id}`,
    imageUrl: property.thumbnailUrl,
    label: property.name,
    value: score,
  };
}

function getPropertyHealthHelper(property: PropertySummary) {
  if (property.units === 0) {
    return "Needs units";
  }

  if (!property.hasActiveOwnerLink) {
    return "Missing owner";
  }

  if (property.netIncomeUsd < 0) {
    return "Negative net";
  }

  if (property.occupiedUnits < property.units) {
    return "Vacancy review";
  }

  return "Operating clean";
}

function vacancyTone(vacancyRate: number): Tone | undefined {
  if (vacancyRate >= 50) {
    return "danger";
  }

  if (vacancyRate > 0) {
    return "warning";
  }

  return "success";
}

function sum<T>(items: T[], readValue: (item: T) => number) {
  return items.reduce((total, item) => total + readValue(item), 0);
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildQueryHref(pathname: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
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
      <main className="mx-auto grid w-full max-w-[1500px] gap-3 px-4 py-2 sm:px-5 lg:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-base font-semibold leading-6 tracking-normal text-foreground">
            {page.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {dashboard.periodKey ? (
              <DashboardPeriodPicker
                href={dashboard.periodHref ?? "#"}
                options={dashboardPeriodOptions}
                selectedPeriod={dashboard.periodKey}
              />
            ) : (
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground shadow-sm">
                <CalendarDays size={15} />
                {dashboard.periodLabel ?? "Current"}
              </span>
            )}
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-background shadow-sm transition-colors hover:bg-accent-strong"
              href={dashboard.actionHref}
            >
              {dashboard.actionLabel}
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

        {dashboard.finance ? (
          <FinanceDashboardBody
            bars={bars}
            dashboard={dashboard}
            drivers={drivers}
            pageTitle={page.title}
          />
        ) : (
          <>
            {leadHealth && leadDriver ? (
              <section className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:grid-cols-2">
                <SignalStrip
                  detail={leadHealth.label}
                  href={leadHealth.href}
                  label={dashboard.leadHealthLabel ?? "Lowest health"}
                  tone={healthTone(leadHealth.value)}
                  value={`${leadHealth.value}%`}
                />
                <SignalStrip
                  detail={leadDriver.label}
                  href={leadDriver.href}
                  label={dashboard.leadDriverLabel ?? "Top availability"}
                  tone={leadDriver.tone ?? "success"}
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
                    metricLabel={dashboard.driverMetricLabel ?? "Vacant units"}
                    points={drivers}
                    progressLabel={dashboard.driverProgressLabel ?? "Availability"}
                  />
                </ChartPanel>

                <ChartPanel
                  actionHref={dashboard.actionHref}
                  actionLabel="View all"
                  title={dashboard.healthTitle ?? "Health"}
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
          </>
        )}
      </main>
    </div>
  );
}

function FinanceDashboardBody({
  bars,
  dashboard,
  drivers,
  pageTitle,
}: {
  bars: DashboardPage["bars"];
  dashboard: DashboardPage;
  drivers: DashboardPage["drivers"];
  pageTitle: string;
}) {
  const finance = dashboard.finance;

  if (!finance) {
    return null;
  }

  const period = dashboard.periodKey ?? "current_month";

  return (
    <section className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.58fr)]">
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <ChartPanel
          actionHref={financeLedgerHref(period)}
          actionLabel="Open ledger"
          priority="primary"
          title="Cash movement"
        >
          <div className="grid min-w-0 gap-3">
            <CashMovementPanel note={finance.note} steps={finance.cashSteps} />
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-foreground">
                  Operating signals
                </p>
                <p className="text-[11px] text-foreground-subtle">
                  {dashboard.periodLabel ?? "Current period"}
                </p>
              </div>
              <HealthPanel points={bars} />
            </div>
          </div>
        </ChartPanel>

        <ChartPanel
          actionHref={dashboard.actionHref}
          actionLabel="View all"
          title={dashboard.driverTitle}
        >
          <DriverList
            actionHref={dashboard.actionHref}
            footerLabel={viewAllLabel(pageTitle)}
            metricLabel={dashboard.driverMetricLabel ?? "Net cash"}
            points={drivers}
            progressLabel={dashboard.driverProgressLabel ?? "Collection"}
          />
        </ChartPanel>
      </div>

      <ChartPanel
        actionHref={financeLedgerHref(period, "attention=1")}
        actionLabel="Review"
        title="Finance attention"
      >
        <FinanceAttentionPanel
          actions={finance.actions}
          period={period}
          transactions={finance.transactions}
          trend={dashboard.trend}
        />
      </ChartPanel>
    </section>
  );
}

function CashMovementPanel({
  note,
  steps,
}: {
  note: string;
  steps: FinanceCashStep[];
}) {
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 gap-2 sm:grid-cols-5">
        {steps.map((step) => (
          <div
            className="grid min-h-[112px] min-w-0 content-between rounded-md border border-border bg-background/35 p-2.5"
            key={step.label}
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase text-foreground-subtle">
                {step.label}
              </p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneTextClass(step.tone))}>
                {step.value}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-foreground-muted">
                {step.helper}
              </p>
            </div>
            <div className="mt-2 flex h-8 items-end">
              <span className="block h-2 w-full overflow-hidden rounded-full bg-chart-track">
                <span
                  className={cn("block h-full rounded-full", toneBgClass(step.tone))}
                  style={{ width: `${step.width}%` }}
                />
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-foreground-subtle">
        {note}
      </p>
    </div>
  );
}

function FinanceAttentionPanel({
  actions,
  period,
  transactions,
  trend,
}: {
  actions: FinanceActionItem[];
  period: DashboardPeriodKey;
  transactions: FinanceTransaction[];
  trend: DashboardPage["trend"];
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <FinanceActionQueue items={actions} period={period} />
      <FinanceTrendStrip period={period} points={trend} />
      <FinanceRecentLedger period={period} transactions={transactions} />
    </div>
  );
}

function FinanceActionQueue({
  items,
  period,
}: {
  items: FinanceActionItem[];
  period: DashboardPeriodKey;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-foreground">
          Needs action
        </p>
        <Link
          className="text-[12px] font-semibold text-accent hover:text-accent-strong"
          href={financeLedgerHref(period, "attention=1")}
        >
          Review all
        </Link>
      </div>
      {items.map((item) => (
        <Link
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-1 py-2 transition-colors last:border-b-0 hover:bg-surface-muted"
          href={item.href}
          key={item.label}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {item.label}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
              {item.helper}
            </span>
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums",
              helperBadgeClass(item.tone),
            )}
          >
            {item.value}
          </span>
        </Link>
      ))}
    </div>
  );
}

function FinanceTrendStrip({
  period,
  points,
}: {
  period: DashboardPeriodKey;
  points: DashboardPage["trend"];
}) {
  const first = points.values[0];
  const last = points.values.at(-1);
  const delta = first && last ? last.value - first.value : 0;

  return (
    <Link
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_116px] items-center gap-3 rounded-md border border-border bg-background/35 p-2.5 transition-colors hover:bg-surface-muted"
      href={financeLedgerHref(period)}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-foreground">
          Net cash trend
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {last ? formatTrendValue(last.value, points.suffix) : "0"}
          </span>
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
            {delta >= 0 ? "+" : ""}
            {formatTrendValue(delta, points.suffix)}
          </span>
        </span>
        <span className="mt-1 block truncate text-[11px] text-foreground-subtle">
          {points.note}
        </span>
      </span>
      <TrendLineSvg points={points.values} tone="accent" />
    </Link>
  );
}

function TrendLineSvg({
  points,
  tone,
}: {
  points: SparklinePoint[];
  tone?: VisualTone;
}) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = values
    .map((value, index) => {
      const x = 4 + index * (104 / Math.max(1, values.length - 1));
      const y = 42 - ((value - min) / range) * 32;

      return `${x},${y}`;
    })
    .join(" ");
  const fillCoordinates = `4,48 ${coordinates} 108,48`;

  return (
    <svg
      aria-hidden="true"
      className="h-14 w-[116px]"
      preserveAspectRatio="none"
      viewBox="0 0 112 52"
    >
      <polygon
        fill={toneStroke(tone)}
        opacity="0.12"
        points={fillCoordinates}
      />
      <polyline
        fill="none"
        points={coordinates}
        stroke={toneStroke(tone)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function FinanceRecentLedger({
  period,
  transactions,
}: {
  period: DashboardPeriodKey;
  transactions: FinanceTransaction[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-foreground">
          Recent ledger
        </p>
        <Link
          className="text-[12px] font-semibold text-accent hover:text-accent-strong"
          href={financeLedgerHref(period, "sort=date_desc")}
        >
          Ledger
        </Link>
      </div>
      {transactions.slice(0, 3).map((transaction) => (
        <Link
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-1 py-2 transition-colors last:border-b-0 hover:bg-surface-muted"
          href={transaction.href}
          key={`${transaction.date}-${transaction.label}`}
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {transaction.label}
            </span>
            <span className="mt-0.5 block text-[11px] text-foreground-subtle">
              {transaction.date}
            </span>
          </span>
          <span className={cn("text-[13px] font-semibold tabular-nums", toneTextClass(transaction.tone))}>
            {transaction.value}
          </span>
        </Link>
      ))}
    </div>
  );
}

function PlaceholderView({
  activeHref,
  page,
}: {
  activeHref: string;
  page: PlaceholderPage;
}) {
  return (
    <div>
      <PageHeader description={page.description} title={page.title} />
      {page.room === "Settings" ? <SettingsTabs activeHref={activeHref} /> : null}
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
      <div className="grid grid-cols-[minmax(0,1fr)_58px] items-center gap-3">
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
          "size-2.5 shrink-0 rounded-full",
          toneBgClass(tone),
        )}
      />
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
            <div className="grid min-w-0 grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-2">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  toneBgClass(tone),
                )}
              />
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
            <span className="ml-5 block h-1 overflow-hidden rounded-full bg-chart-track">
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

function TrendGraph({
  compact = false,
  points,
}: {
  compact?: boolean;
  points: DashboardPage["trend"];
}) {
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
        className={cn("h-72", compact ? "xl:h-[250px]" : "xl:h-[430px]")}
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
  metricLabel,
  points,
  progressLabel,
}: {
  actionHref: string;
  footerLabel: string;
  metricLabel: string;
  points: DashboardPage["drivers"];
  progressLabel: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_104px_116px] border-b border-border px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-normal text-foreground-subtle sm:grid">
        <span>Property</span>
        <span className="text-right">{metricLabel}</span>
        <span className="text-right">{progressLabel}</span>
      </div>
      {points.map((point, index) => (
        <Link
          className="grid min-w-0 gap-2.5 rounded-md border-b border-border px-2 py-2.5 transition-colors last:border-b-0 hover:bg-surface-muted sm:grid-cols-[minmax(0,1fr)_104px_116px] sm:items-center"
          href={point.href}
          key={point.label}
          title={point.helper}
        >
          <div className="grid min-w-0 grid-cols-[22px_38px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-right text-[12px] font-semibold tabular-nums text-foreground-subtle">
              {String(index + 1).padStart(2, "0")}
            </span>
            <BuildingThumb
              className="size-9"
              imageUrl={point.imageUrl}
              label={point.label}
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
              {metricLabel}
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

  if (noun === "finance") {
    return "View ledger";
  }

  return `View all ${noun}`;
}

function BuildingThumb({
  className,
  imageUrl,
  label,
}: {
  className?: string;
  imageUrl?: string;
  label?: string;
}) {
  const thumbClassName = cn(
    "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border shadow-sm",
    imageUrl ? "bg-cover bg-center" : "bg-background/50",
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
    <span className={thumbClassName} aria-hidden="true" />
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
