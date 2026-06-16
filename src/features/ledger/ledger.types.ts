import type { CurrencyCode } from "@/lib/money/format";

export type LedgerDirection = "income" | "expense";

export type LedgerEntry = {
  amount: number;
  category: string;
  currency: CurrencyCode;
  description: string;
  direction: LedgerDirection;
  id: string;
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
  netIncome: string;
  totalExpense: string;
  totalIncome: string;
};
