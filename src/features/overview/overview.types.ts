import type { RecentChange } from "@/features/activity/activity.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type OverviewMetricTone = "neutral" | "success" | "warning" | "danger";

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

export type OverviewLeaseEndingPoint = {
  count: number;
  href: string;
  label: string;
};

export type OverviewQuickAction = {
  href: string;
  label: string;
};

export type OverviewScreenData = {
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
};
