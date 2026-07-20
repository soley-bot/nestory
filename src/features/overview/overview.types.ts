import type { RecentChange } from "@/features/activity/activity.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type OverviewMetricTone = "neutral" | "success" | "warning" | "danger";
export type OverviewLens = "all" | "finance" | "leasing" | "maintenance" | "records";
export type OverviewFinanceView =
  | "collections"
  | "expenses"
  | "management-fees"
  | "owner-statements"
  | "transactions";
export type OverviewReview =
  | "all"
  | "negative"
  | "arrears"
  | "bills"
  | "statement-blocked";
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

export type OverviewPropertyPerformanceRow = {
  arrears: MoneyDisplayValue;
  arrearsAmount: number;
  cashExpenses: MoneyDisplayValue;
  cashExpensesAmount: number;
  cashIncome: MoneyDisplayValue;
  cashIncomeAmount: number;
  collectionRate: number;
  href: string;
  label: string;
  managementFeeEarned: MoneyDisplayValue;
  managementFeeEarnedAmount: number;
  managementFeeOutstandingAmount: number;
  managementFeeReceived: MoneyDisplayValue;
  managementFeeReceivedAmount: number;
  netCash: MoneyDisplayValue;
  netCashAmount: number;
  propertyId: string;
  readyStatementCount: number;
  securityDepositHeldAmount: number;
  statementBlockers: number;
  status: "healthy" | "attention" | "arrears" | "loss";
  unitCount: number;
};

export type OverviewStatementReadiness = {
  blockedPropertyCount: number;
  readyPropertyCount: number;
  readyStatementCount: number;
  totalPropertyCount: number;
};

export type OverviewPortfolioSummary = {
  arrearsAmount: number;
  cashExpensesAmount: number;
  cashIncomeAmount: number;
  collectionRate: number;
  managementFeeEarnedAmount: number;
  managementFeeOutstandingAmount: number;
  managementFeeReceivedAmount: number;
  netCashAmount: number;
  statementReadiness: OverviewStatementReadiness;
};

export type OverviewPropertyPerformance = {
  rows: OverviewPropertyPerformanceRow[];
  summary: OverviewPortfolioSummary;
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
  priority: string;
  status: string;
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
  readyStatementCount: number;
  statementBlockers: number;
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
  leaseEndings: OverviewLeaseEndingPoint[];
  leaseRiskCount: number;
  ledgerCurrency: CurrencyCode;
  ledgerFlow: OverviewLedgerPoint[];
  maintenanceByProperty: OverviewMaintenancePoint[];
  metrics: OverviewMetric[];
  occupancyByProperty: OverviewOccupancyPoint[];
  propertyPerformance: OverviewPropertyPerformance;
  recordsByProperty: OverviewRecordPoint[];
  quickActions: OverviewQuickAction[];
  recentChanges: RecentChange[];
  workspaceSetup: OverviewWorkspaceSetup;
};
