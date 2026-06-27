import type { CurrencyCode } from "@/lib/money/format";
import type { MoneyDisplayValue } from "@/lib/money/format";
import type { LinkedDocument } from "@/features/documents/document.types";

export type LedgerDirection = "income" | "expense";

export type LedgerEntry = {
  amount: number;
  archivedAt?: string;
  category: string;
  currency: CurrencyCode;
  description: string;
  documents: LinkedDocument[];
  direction: LedgerDirection;
  id: string;
  isLocked: boolean;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  relatedTimelineEvent?: {
    id: string;
    title: string;
  };
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
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc"
  | "property_asc";

export type LedgerViewQuery = {
  archiveState: LedgerArchiveState;
  dateFrom: string;
  dateTo: string;
  direction: "all" | LedgerDirection;
  minAmount: number | null;
  page: number;
  pageSize: number;
  period: LedgerPeriodFilter;
  propertyId: string;
  query: string;
  sort: LedgerSortKey;
};

export type LedgerPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};
