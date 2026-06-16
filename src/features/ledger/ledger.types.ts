import type { CurrencyCode } from "@/lib/money/format";
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
  netIncome: string;
  totalExpense: string;
  totalIncome: string;
};
