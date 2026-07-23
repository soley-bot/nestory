import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type PettyCashEntryKind = "advance" | "cash_in" | "expense";
export type PettyCashEntryStatus = "cleared" | "draft" | "posted" | "void";
export type PettyCashEconomicScope =
  | "company_advance"
  | "company_cost"
  | "property_expense";
export type PettyCashOwnerBillStatus =
  | "billable"
  | "billed"
  | "not_billable"
  | "partially_reimbursed"
  | "reimbursed"
  | "written_off";

export type PettyCashAccount = {
  accountNumber: string;
  currency: CurrencyCode;
  custodianName?: string;
  custodianPersonId?: string;
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
  companyLossAmount: number;
  counterpartyCurrentName?: string;
  counterpartyPersonId?: string;
  createdAt: string;
  currency: CurrencyCode;
  description: string;
  economicScope: PettyCashEconomicScope;
  economicScopeLabel: string;
  entryKind: PettyCashEntryKind;
  id: string;
  inAmount: number;
  invoiceDate: string;
  ledgerEntryId?: string;
  outAmount: number;
  ownerBillStatus: PettyCashOwnerBillStatus;
  ownerBillStatusLabel: string;
  ownerReceivable: MoneyDisplayValue;
  ownerReceivableAmount: number;
  ownerReimbursableAmount: number;
  ownerReimbursedAmount: number;
  propertyCode?: string;
  propertyId?: string;
  propertyName?: string;
  receiptReference?: string;
  remark?: string;
  status: PettyCashEntryStatus;
  supplier?: string;
  unitId?: string;
  unitNumber?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
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
  openingFloat: MoneyDisplayValue;
  postedCount: string;
  readyToPostCount: string;
  receiptMissingCount: string;
  voidCount: string;
};

export type PettyCashSchemaStatus = {
  isReady: boolean;
  message?: string;
};
