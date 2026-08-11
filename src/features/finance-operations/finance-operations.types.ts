export type FinanceOption = {
  id: string;
  label: string;
  propertyId?: string | null;
};

export type LeaseBillingSummary = {
  billingRecipientKind: "company" | "individual";
  billingRecipientPersonId: string;
  chargeManagementFeeWhenActive: boolean;
  collectionRoute: "direct_to_owner" | "through_ips";
  effectiveFrom: string;
  finalPeriodProratedAmount: number | null;
  firstPeriodProratedAmount: number | null;
  fullManagementFeeDuringProration: boolean;
  id: string;
  managementFeeMode: "flat" | "percentage";
  managementFeeValue: number;
};

export type FinanceLease = {
  billing: LeaseBillingSummary | null;
  endDate: string;
  id: string;
  monthlyRent: number;
  ownerLabel: string;
  ownerPersonId: string | null;
  propertyId: string;
  propertyLabel: string;
  startDate: string;
  status: string;
  tenantLabel: string;
  tenantPersonId: string | null;
  unitId: string | null;
  unitLabel: string;
};

export type TenantInvoiceLine = {
  amount: number;
  balanceDue: number;
  id: string;
  label: string;
  lineType: string;
};

export type TenantInvoiceSettlement = {
  amount: number;
  date: string;
  id: string;
  isReversed: boolean;
  reference: string | null;
  reversalReason: string | null;
  route: "direct_to_owner" | "through_ips";
};

export type TenantInvoiceSummary = {
  balanceDue: number;
  billingPeriodStart: string;
  collectedByOwner: number;
  collectionRoute: "direct_to_owner" | "through_ips";
  dueDate: string;
  generationSource:
    | "activation_catch_up"
    | "manual_recovery"
    | "scheduled"
    | null;
  id: string;
  invoiceNumber: string;
  isProrated: boolean | null;
  issueDate: string;
  leaseId: string;
  lines: TenantInvoiceLine[];
  occupantLabels: string[];
  paidThroughIps: number;
  paymentStatus: "paid" | "partly_paid" | "unpaid" | "voided";
  propertyId: string;
  propertyLabel: string;
  recipientLabel: string;
  settlements: TenantInvoiceSettlement[];
  totalAmount: number;
  unitId: string | null;
  unitLabel: string;
};

export type RentGenerationException = {
  attemptCount: number;
  billingPeriodStart: string;
  code: string;
  id: string;
  lastAttemptAt: string;
  leaseId: string;
  message: string;
  propertyId: string;
};

export type OwnerInvoiceSummary = {
  balanceDue: number;
  dueDate: string;
  id: string;
  invoiceNumber: string;
  ownerLabel: string;
  ownerPersonId: string;
  paidByOwner: number;
  paidFromHeldCash: number;
  paymentStatus: "paid" | "partly_paid" | "unpaid" | "voided";
  propertyId: string;
  propertyLabel: string;
  totalAmount: number;
};

export type ExpenseSubmissionSummary = {
  adjustsSubmissionId?: string | null;
  category: string;
  customerTotal: number;
  date: string;
  evidence?: {
    documentId: string;
    fileName: string;
    href?: string;
    mimeType: string;
    sha256: string;
    sizeBytes: number;
  };
  fundingSourceLabel: string;
  id: string;
  internalCost: number;
  internalMarkup: number;
  maintenanceTask?: {
    completedAt: string | null;
    description: string | null;
    href: string;
    status: string;
    title: string;
  };
  propertyId: string;
  propertyLabel: string;
  previouslyApproved?: number | null;
  recordedTotal?: number | null;
  reference: string | null;
  responsibility: "owner" | "tenant";
  reviewReason: string | null;
  reversalReason: string | null;
  sourceId: string | null;
  sourceType: "general" | "maintenance_task";
  status: "approved" | "rejected" | "reversed" | "submitted";
  submittedAt: string;
  unitId: string | null;
  unitLabel: string;
  vendorLabel: string;
};

export type PropertyFinancePosition = {
  availableWithdrawal: number;
  cashHeldByIps: number;
  managementFeeExpense: number;
  ownerExpense: number;
  ownerLabel: string;
  ownerOwesIps: number;
  ownerPersonId: string | null;
  propertyId: string;
  propertyLabel: string;
  rentIncome: number;
  runningBalance: number;
  withdrawals: number;
};

export type PropertyAccountEntry = {
  amount: number;
  category: string;
  date: string;
  id: string;
  label: string;
  note: string | null;
  propertyId: string;
  runningBalance: number;
};

export type FinanceOperationsData = {
  accountEntries: PropertyAccountEntry[];
  expenseSubmissions: ExpenseSubmissionSummary[];
  leases: FinanceLease[];
  ownerInvoices: OwnerInvoiceSummary[];
  peopleOptions: FinanceOption[];
  positions: PropertyFinancePosition[];
  propertyOptions: FinanceOption[];
  reconciliationSources: FinanceOption[];
  rentGenerationExceptions: RentGenerationException[];
  tenantInvoices: TenantInvoiceSummary[];
  unitOptions: FinanceOption[];
};

export type FinanceOperationsActionState = {
  message?: string;
  status?: "error" | "success";
};
