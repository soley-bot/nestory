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

export type OverviewViewQuery = {
  financeView: OverviewFinanceView;
  lens: OverviewLens;
  month: string;
  propertyId: string;
  review: OverviewReview;
};

export type OverviewLegacyFinanceView =
  | "company-pnl"
  | "ledger"
  | "owner-receivables"
  | "property-ranking";

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
  count: number;
  helper: string;
  href: string;
  label: string;
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

export type OverviewCompanyFinancePoint = OverviewLedgerPoint;

export type OverviewCompanyFinanceProperty = {
  companyCost: MoneyDisplayValue;
  companyCostAmount: number;
  companyRevenue: MoneyDisplayValue;
  companyRevenueAmount: number;
  href: string;
  label: string;
  marginLabel: string;
  netContribution: MoneyDisplayValue;
  netContributionAmount: number;
  ownerReceivable: MoneyDisplayValue;
  ownerReceivableAmount: number;
  tone: OverviewMetricTone;
};

export type OverviewOwnerReceivable = {
  amount: MoneyDisplayValue;
  amountValue: number;
  billStatus: string;
  href: string;
  invoiceDate: string;
  label: string;
  ownerReceivable: MoneyDisplayValue;
  ownerReceivableAmount: number;
  propertyLabel: string;
  reimbursed: MoneyDisplayValue;
  vendorLabel: string;
};

export type OverviewCompanyFinanceSummary = {
  companyCost: MoneyDisplayValue;
  companyCostAmount: number;
  companyNet: MoneyDisplayValue;
  companyNetAmount: number;
  companyRevenue: MoneyDisplayValue;
  companyRevenueAmount: number;
  marginLabel: string;
  monthlyPnl: OverviewCompanyFinancePoint[];
  ownerReceivable: MoneyDisplayValue;
  ownerReceivableAmount: number;
  ownerReceivables: OverviewOwnerReceivable[];
  properties: OverviewCompanyFinanceProperty[];
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
  securityDepositHeldAmount: number;
  statementBlockers: number;
  status: "healthy" | "attention" | "arrears" | "loss";
  unitCount: number;
};

export type OverviewStatementReadiness = {
  blockedCount: number;
  readyCount: number;
  totalCount: number;
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

type OverviewScreenDataCommon = {
  attentionItems: OverviewAttentionItem[];
  attentionTotal: number;
  dashboardSummary: OverviewDashboardSummary;
  leaseEndings: OverviewLeaseEndingPoint[];
  leaseRiskCount: number;
  ledgerCurrency: CurrencyCode;
  ledgerFlow: OverviewLedgerPoint[];
  metrics: OverviewMetric[];
  occupancyByProperty: OverviewOccupancyPoint[];
  quickActions: OverviewQuickAction[];
  recentChanges: RecentChange[];
  workspaceSetup: OverviewWorkspaceSetup;
};

export type OverviewPropertyPerformanceScreenData = OverviewScreenDataCommon & {
  propertyPerformance: OverviewPropertyPerformance;
};

export type OverviewLegacyScreenData = OverviewScreenDataCommon & {
  companyFinance: OverviewCompanyFinanceSummary;
};

export type OverviewScreenData =
  | OverviewPropertyPerformanceScreenData
  | OverviewLegacyScreenData;
