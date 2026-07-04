import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type PettyCashEntryKind = "advance" | "cash_in" | "expense";
export type PettyCashEntryStatus = "cleared" | "draft" | "posted" | "void";

export type PettyCashAccount = {
  accountNumber: string;
  currency: CurrencyCode;
  floatAmount: number;
  id: string;
  name: string;
  status: string;
};

export type PettyCashPeriod = {
  advanceAmount: number;
  countedCashAmount?: number;
  id: string;
  openingBalanceAmount: number;
  periodStart: string;
  status: string;
};

export type PettyCashEntry = {
  balanceAfter: number;
  category: string;
  clearDate?: string;
  createdAt: string;
  currency: CurrencyCode;
  description: string;
  entryKind: PettyCashEntryKind;
  id: string;
  inAmount: number;
  invoiceDate: string;
  ledgerEntryId?: string;
  outAmount: number;
  propertyCode?: string;
  propertyId?: string;
  propertyName?: string;
  receiptReference?: string;
  remark?: string;
  status: PettyCashEntryStatus;
  supplier?: string;
  unitId?: string;
  unitNumber?: string;
};

export type PettyCashPropertyOption = {
  id: string;
  label: string;
};

export type PettyCashUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type PettyCashSummary = {
  balance: MoneyDisplayValue;
  cashIn: MoneyDisplayValue;
  cashOut: MoneyDisplayValue;
  postedCount: string;
  readyToPostCount: string;
  receiptMissingCount: string;
};

export type PettyCashSchemaStatus = {
  isReady: boolean;
  message?: string;
};
