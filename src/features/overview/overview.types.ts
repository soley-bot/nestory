import type { RecentChange } from "@/features/activity/activity.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type OverviewMetricTone = "neutral" | "success" | "warning" | "danger";
export type OverviewLens = "all" | "finance" | "leasing" | "maintenance" | "records";
export type OverviewFinanceView =
  | "company-pnl"
  | "ledger"
  | "owner-receivables"
  | "property-ranking";

const overviewLenses: OverviewLens[] = [
  "all",
  "finance",
  "leasing",
  "maintenance",
  "records",
];
const overviewFinanceViews: OverviewFinanceView[] = [
  "company-pnl",
  "property-ranking",
  "owner-receivables",
  "ledger",
];

export function normalizeOverviewLens(
  lens: string | string[] | undefined,
): OverviewLens {
  const value = Array.isArray(lens) ? lens[0] : lens;

  return overviewLenses.includes(value as OverviewLens)
    ? (value as OverviewLens)
    : "all";
}

export function normalizeOverviewFinanceView(
  financeView: string | string[] | undefined,
): OverviewFinanceView {
  const value = Array.isArray(financeView) ? financeView[0] : financeView;

  return overviewFinanceViews.includes(value as OverviewFinanceView)
    ? (value as OverviewFinanceView)
    : "company-pnl";
}

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

export type OverviewScreenData = {
  attentionItems: OverviewAttentionItem[];
  attentionTotal: number;
  dashboardSummary: OverviewDashboardSummary;
  companyFinance: OverviewCompanyFinanceSummary;
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
