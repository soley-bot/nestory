import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export const expenseTypeOptions = [
  { label: "Vendor bill", value: "vendor_bill" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Utilities", value: "utilities" },
  { label: "Supplies", value: "supplies" },
  { label: "Owner payout", value: "owner_payout" },
  { label: "Refund", value: "refund" },
  { label: "Other expense", value: "other" },
] as const;

export const expenseStatusOptions = [
  { label: "All active", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Approved", value: "approved" },
  { label: "Posted", value: "posted" },
  { label: "Paid", value: "paid" },
] as const;

export type BillsExpenseStatus =
  | "approved"
  | "draft"
  | "paid"
  | "posted"
  | "void";
export type BillsExpenseStatusFilter =
  | "all"
  | Exclude<BillsExpenseStatus, "void">;
export type BillsExpenseType = (typeof expenseTypeOptions)[number]["value"];
export type BillsExpenseEconomicScope =
  | "company_advance"
  | "company_cost"
  | "property_expense";
export type BillsExpenseOwnerBillStatus =
  | "billable"
  | "billed"
  | "not_billable"
  | "partially_reimbursed"
  | "reimbursed"
  | "written_off";

export const economicScopeOptions = [
  { label: "Property expense", value: "property_expense" },
  { label: "Company advance", value: "company_advance" },
  { label: "Company cost", value: "company_cost" },
] as const;

export const ownerBillStatusOptions = [
  { label: "Not billable", value: "not_billable" },
  { label: "Billable", value: "billable" },
  { label: "Billed", value: "billed" },
  { label: "Partially reimbursed", value: "partially_reimbursed" },
  { label: "Reimbursed", value: "reimbursed" },
  { label: "Written off", value: "written_off" },
] as const;

export type BillsExpensesViewQuery = {
  month: string;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  status: BillsExpenseStatusFilter;
  unitId: string;
};

export type BillsExpenseOption = {
  id: string;
  label: string;
};

export type BillsExpenseUnitOption = BillsExpenseOption & {
  propertyId: string;
};

export type BillsExpenseItem = {
  amount: number;
  amountDisplay: MoneyDisplayValue;
  amountPaid: number;
  amountPaidDisplay: MoneyDisplayValue;
  category: string;
  currency: CurrencyCode;
  description: string;
  dueDate: string | null;
  economicScope: BillsExpenseEconomicScope;
  economicScopeLabel: string;
  expenseType: BillsExpenseType;
  expenseTypeLabel: string;
  hrefs: {
    ledger?: string;
    property: string;
    unit?: string;
  };
  id: string;
  invoiceDate: string;
  isOverdue: boolean;
  ledgerEntryId: string | null;
  nextAction: string;
  outstandingAmount: number;
  outstandingAmountDisplay: MoneyDisplayValue;
  ownerBillStatus: BillsExpenseOwnerBillStatus;
  ownerBillStatusLabel: string;
  ownerReceivableDisplay: MoneyDisplayValue;
  ownerReimbursableAmount: number;
  ownerReimbursedAmount: number;
  paidDate: string | null;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  reference: string;
  status: BillsExpenseStatus;
  statusLabel: string;
  companyLossAmount: number;
  companyLossDisplay: MoneyDisplayValue;
  unitId: string | null;
  unitNumber: string;
  vendorLabel: string;
  vendorPersonId: string | null;
};

export type BillsExpensesSummary = {
  approvedCount: string;
  draftCount: string;
  overdueCount: string;
  postedTotal: MoneyDisplayValue;
  unpostedTotal: MoneyDisplayValue;
};

export type BillsExpensesPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};
