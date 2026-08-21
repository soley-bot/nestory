import type { RecentChange } from "@/features/activity/activity.types";
import type {
  MaintenancePriority,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type OverviewMetricTone = "neutral" | "success" | "warning" | "danger";
export type OverviewLens = "all" | "leasing" | "maintenance" | "records";
export type OverviewFinanceView = "collections";
export type OverviewReview =
  | "all"
  | "negative"
  | "arrears"
  | "bills";
export type OverviewPropertySort =
  | "property-asc"
  | "property-desc"
  | "collected-desc"
  | "income-desc"
  | "expenses-desc"
  | "net-desc"
  | "fee-desc";

export type OverviewAttentionKind =
  | "overdue-rent"
  | "urgent-maintenance"
  | "expiring-lease"
  | "missing-document"
  | "unreconciled-finance"
  | "data-quality";

export type OverviewViewQuery = {
  financeView: OverviewFinanceView;
  lens: OverviewLens;
  month: string;
  propertyQuery?: string;
  propertyId: string;
  review: OverviewReview;
  sort?: OverviewPropertySort;
};


export type OverviewMetric = {
  helper: string;
  label: string;
  tone: OverviewMetricTone;
  value: MoneyDisplayValue | string;
};

export type OverviewDashboardSummary = {
  actionHref: string;
  actionLabel: string;
  detail: string;
  headline: string;
  tone: OverviewMetricTone;
};

export type OverviewAttentionItem = {
  actionLabel: string;
  count: number;
  helper: string;
  href: string;
  id: string;
  kind: OverviewAttentionKind;
  label: string;
  priority: number;
  tone: OverviewMetricTone;
};

export type OverviewOccupancyPoint = {
  href: string;
  label: string;
  occupiedUnits: number;
  percent: number;
  totalUnits: number;
  unoccupiedUnits: number;
  vacantUnits: number;
};

export type OverviewLedgerPoint = {
  expense: number;
  href: string;
  income: number;
  label: string;
  net: number;
};

export type OverviewExpectedRent = {
  leaseCount: number;
  monthly: MoneyDisplayValue | null;
};

export type OverviewLeaseEndingPoint = {
  count: number;
  href: string;
  label: string;
};

export type OverviewMaintenanceCase = {
  dueDate: string | null;
  href: string;
  id: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  title: string;
};

export type OverviewMaintenancePoint = {
  blockedCount: number;
  cases: OverviewMaintenanceCase[];
  href: string;
  label: string;
  openCount: number;
  overdueCount: number;
  urgentCount: number;
};

export type OverviewRecordPoint = {
  documentCount: number;
  href: string;
  label: string;
  missingTenantLinks: number;
  ownerLinked: boolean;
  unitCount: number;
};

export type OverviewQuickAction = {
  href: string;
  label: string;
};

export type OverviewWorkspaceSetup = {
  activeLeaseCount: number;
  hasAnyOperatingData: boolean;
  ledgerEntryCount: number;
  peopleCount: number;
  propertyCount: number;
  unitCount: number;
};

export type OverviewScreenData = {
  attentionItems: OverviewAttentionItem[];
  attentionTotal: number;
  dashboardSummary: OverviewDashboardSummary;
  expectedRent: OverviewExpectedRent;
  leaseEndings: OverviewLeaseEndingPoint[];
  leaseRiskCount: number;
  ledgerCurrency: CurrencyCode;
  ledgerFlow: OverviewLedgerPoint[];
  maintenanceByProperty: OverviewMaintenancePoint[];
  metrics: OverviewMetric[];
  occupancyByProperty: OverviewOccupancyPoint[];
  propertyOptions: OverviewPropertyOption[];
  recordsByProperty: OverviewRecordPoint[];
  quickActions: OverviewQuickAction[];
  recentChanges: RecentChange[];
  workspaceSetup: OverviewWorkspaceSetup;
};

export type OverviewPropertyOption = {
  label: string;
  value: string;
};
