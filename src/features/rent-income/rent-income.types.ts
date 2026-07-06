import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export const incomeTypeOptions = [
  { label: "Rent", value: "rent" },
  { label: "Security deposit", value: "security_deposit" },
  { label: "Utility reimbursement", value: "utility_reimbursement" },
  { label: "Parking", value: "parking" },
  { label: "Late fee", value: "late_fee" },
  { label: "Owner contribution", value: "owner_contribution" },
  { label: "Other income", value: "other" },
] as const;

export const incomeStatusOptions = [
  { label: "All active", value: "all" },
  { label: "Open", value: "open" },
  { label: "Partial", value: "partially_received" },
  { label: "Received", value: "received" },
  { label: "Posted", value: "posted" },
] as const;

export type RentIncomeStatus =
  | "open"
  | "partially_received"
  | "posted"
  | "received"
  | "void";

export type RentIncomeStatusFilter =
  | "all"
  | Exclude<RentIncomeStatus, "void">;

export type RentIncomeType = (typeof incomeTypeOptions)[number]["value"];

export type RentIncomeViewQuery = {
  month: string;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  status: RentIncomeStatusFilter;
  unitId: string;
};

export type RentIncomeOption = {
  id: string;
  label: string;
};

export type RentIncomeUnitOption = RentIncomeOption & {
  propertyId: string;
};

export type RentIncomeLeaseOption = RentIncomeOption & {
  propertyId: string;
  tenantName: string;
  unitId: string | null;
};

export type RentIncomeItem = {
  amountDue: number;
  amountDueDisplay: MoneyDisplayValue;
  amountReceived: number;
  amountReceivedDisplay: MoneyDisplayValue;
  balanceDisplay: MoneyDisplayValue;
  currency: CurrencyCode;
  description: string;
  dueDate: string;
  hrefs: {
    ledger?: string;
    lease?: string;
    property: string;
    unit?: string;
  };
  id: string;
  incomeType: RentIncomeType;
  incomeTypeLabel: string;
  isOverdue: boolean;
  leaseId: string | null;
  ledgerEntryId: string | null;
  nextAction: string;
  payerLabel: string;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  receivedDate: string | null;
  reference: string;
  status: RentIncomeStatus;
  statusLabel: string;
  unitId: string | null;
  unitNumber: string;
};

export type RentIncomeSummary = {
  openCount: string;
  overdueCount: string;
  receivedTotal: MoneyDisplayValue;
  receivableTotal: MoneyDisplayValue;
  unpostedCount: string;
};

export type RentIncomePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};
