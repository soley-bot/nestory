import type { CurrencyCode } from "@/lib/money/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { FinanceCloseSummary } from "@/features/finance/finance.types";

export type LedgerDirection = "income" | "expense";
export type LedgerSourceType =
  | "finance_expense"
  | "finance_income"
  | "maintenance_task"
  | "manual"
  | "petty_cash";

export type LedgerRecordCounts = {
  activity: number;
  documents: number;
  timelineEvents: number;
};

export type LedgerRiskIndicator = {
  description: string;
  id: string;
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
};

export type LedgerDetailHrefs = {
  documents: string;
  ledger: string;
  property: string;
  reports: string;
  timeline: string;
  unit?: string;
};

export type LedgerNextAction = {
  description: string;
  href: string;
  label: string;
  tone: LedgerRiskIndicator["tone"];
};

export type LedgerEntry = {
  accountingJournalEntryId?: string;
  activity: RecentChange[];
  amount: number;
  archivedAt?: string;
  category: string;
  currency: CurrencyCode;
  description: string;
  documents: LinkedDocument[];
  direction: LedgerDirection;
  hrefs: LedgerDetailHrefs;
  id: string;
  isLocked: boolean;
  nextAction: LedgerNextAction;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  recordCounts: LedgerRecordCounts;
  relatedTimelineEvent?: {
    id: string;
    title: string;
  };
  riskIndicators: LedgerRiskIndicator[];
  sourceId?: string;
  sourceLabel: string;
  sourceType: LedgerSourceType;
  transactionDate: string;
  unitId?: string;
  unitNumber?: string;
};

export type LedgerPeriodLock = {
  id: string;
  lockedAt?: string;
  periodStart: string;
  reason?: string;
};

export type LedgerPropertyOption = {
  id: string;
  label: string;
};

export type LedgerUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type LedgerSnapshot = {
  entryCount: string;
  lockedPeriodCount: string;
  netIncome: MoneyDisplayValue;
  totalExpense: MoneyDisplayValue;
  totalIncome: MoneyDisplayValue;
};

export type LedgerArchiveState = "active" | "archived" | "all";
export type LedgerPeriodFilter = "all" | "current_month" | "last_30_days";

export type LedgerSortKey =
  "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "property_asc";

export type LedgerViewQuery = {
  archiveState: LedgerArchiveState;
  dateFrom: string;
  dateTo: string;
  direction: "all" | LedgerDirection;
  entryId: string | null;
  minAmount: number | null;
  page: number;
  pageSize: number;
  period: LedgerPeriodFilter;
  propertyId: string;
  query: string;
  sort: LedgerSortKey;
  unitId: string;
};

export type LedgerPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type LedgerCloseSummary = FinanceCloseSummary;
