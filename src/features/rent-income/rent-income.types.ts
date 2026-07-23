import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";
import type { PersonSelectOption } from "@/features/people/person-select";

export const incomeTypeOptions = [
  { label: "Rent", value: "rent" },
  { label: "Security deposit", value: "security_deposit" },
  { label: "Utility reimbursement", value: "utility_reimbursement" },
  { label: "Parking", value: "parking" },
  { label: "Late fee", value: "late_fee" },
  { label: "Owner contribution", value: "owner_contribution" },
  { label: "Management fee", value: "management_fee" },
  { label: "Leasing commission", value: "leasing_commission" },
  { label: "Service fee", value: "service_fee" },
  { label: "Maintenance markup", value: "maintenance_markup" },
  { label: "Other income", value: "other" },
] as const;

export const incomeStatusOptions = [
  { label: "All statuses", value: "all" },
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
export type RentIncomeGroup = "all" | "management-company";
export type RentIncomeTypeFilter = "all" | RentIncomeType;

export type RentIncomeViewQuery = {
  incomeItemId?: string;
  incomeGroup: RentIncomeGroup;
  incomeType: RentIncomeTypeFilter;
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
  currency: CurrencyCode;
  monthlyRentAmount: number;
  propertyId: string;
  tenantPersonId: string;
  tenantName: string;
  unitId: string | null;
};

export type RentIncomeCreateDefaults = {
  amountDue: string;
  incomeType: RentIncomeType;
  leaseId: string;
  payerPersonId: string;
  propertyId: string;
  unitId: string;
};

export type RentIncomeReceipt = {
  amount: number;
  amountDisplay: MoneyDisplayValue;
  id: string;
  receivedDate: string;
  reference: string;
  reversed: boolean;
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
  payerPersonId: string | null;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  receivedDate: string | null;
  reference: string;
  receipts: RentIncomeReceipt[];
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

export type RentIncomeScreenData = {
  createDefaults?: RentIncomeCreateDefaults;
  incomeItems: RentIncomeItem[];
  leaseOptions: RentIncomeLeaseOption[];
  pagination: RentIncomePagination;
  payerOptions: PersonSelectOption[];
  propertyOptions: RentIncomeOption[];
  summary: RentIncomeSummary;
  unitOptions: RentIncomeUnitOption[];
  viewQuery: RentIncomeViewQuery;
};
