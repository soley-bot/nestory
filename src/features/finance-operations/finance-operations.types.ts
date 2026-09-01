export type FinanceOption = {
  id: string;
  label: string;
  partyType?: string | null;
  propertyId?: string | null;
  roles?: string[];
};

export type FinanceCategory = {
  archivedAt: string | null;
  code: string;
  displayLabel: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  namespace: "owner_expense" | "tenant_billing";
  reportingGroup: string;
  sortOrder: number;
};

export type LeaseBillingSummary = {
  billingRecipientKind: "company" | "individual" | null;
  billingRecipientPersonId: string | null;
  chargeManagementFeeWhenActive: boolean;
  chargeThroughLeaseEnd: boolean;
  collectionRoute: "direct_to_owner" | "through_ips" | null;
  effectiveFrom: string;
  effectiveTo: string;
  finalPeriodProratedAmount: number | null;
  firstPeriodProratedAmount: number | null;
  fullManagementFeeDuringProration: boolean;
  id: string;
  leaseEndProrationRule: "actual_days" | null;
  leaseStartProrationRule: "actual_days" | null;
  managementFeeMode: "flat" | "percentage" | null;
  managementFeeValue: number | null;
  midPeriodRentChangeRule: "next_full_month" | null;
  rentCalculationTimezone: string | null;
  shortMonthDueDayRule: "last_calendar_day" | null;
};

export type FinanceLease = {
  billing: LeaseBillingSummary | null;
  billingPreview?: {
    endDate: string;
    finalMonthRent: number;
    firstMonthRent: number;
    startDate: string;
  };
  endDate: string;
  expectedCurrentBillingRuleId: string | null;
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

export type CommercialDocumentLink = {
  artifactId: string | null;
  href: string | null;
  publicationStatus: "failed" | "not_published" | "published";
  publishedAt: string | null;
};

export type TenantInvoicePublicationSnapshot = {
  contactEmail: string | null;
  contactPhone: string | null;
  note: string | null;
  paymentInstructions: string;
};

export type TenantInvoiceSettlement = {
  amount: number;
  date: string;
  id: string;
  isReversed: boolean;
  reference: string | null;
  reversalReason: string | null;
  receipt: CommercialDocumentLink | null;
  receiptNumber: string | null;
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
    | "lease_rules_v1"
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
  pdf: CommercialDocumentLink;
  publicationSnapshot: TenantInvoicePublicationSnapshot | null;
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
  categoryLabel?: string | null;
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
  lines?: Array<{
    amount: number;
    category: string;
    categoryLabel?: string | null;
    description: string;
    ownerCashAmount: number | null;
    propertyId: string;
    propertyLabel: string;
    submissionId: string;
    unitId: string | null;
    unitLabel: string;
  }>;
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
  reviewedAt: string | null;
  reviewReason: string | null;
  reversalReason: string | null;
  sourceId: string | null;
  sourceType: "general" | "maintenance_task";
  status: "approved" | "rejected" | "reversed" | "submitted";
  submittedAt: string;
  submittedByLabel: string;
  submittedByUserId: string;
  transactionId?: string | null;
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
  createdAt: string;
  date: string;
  id: string;
  label: string;
  note: string | null;
  propertyId: string;
  runningBalance: number;
  sourceType: string;
};

export type FinanceOperationsData = {
  accountEntries: PropertyAccountEntry[];
  expenseSubmissions: ExpenseSubmissionSummary[];
  financeCategories: FinanceCategory[];
  leases: FinanceLease[];
  ownerInvoices: OwnerInvoiceSummary[];
  operationalTimezone?: string;
  peopleOptions: FinanceOption[];
  positions: PropertyFinancePosition[];
  propertyOptions: FinanceOption[];
  reconciliationSources: FinanceOption[];
  rentGenerationExceptions: RentGenerationException[];
  tenantInvoices: TenantInvoiceSummary[];
  unitOptions: FinanceOption[];
};

export type LeasePaymentResolutionData = {
  invoice: TenantInvoiceSummary;
  nextInvoiceDueDate: string | null;
  ownerLabel: string;
  reconciliationSources: FinanceOption[];
};

export type FinanceOperationsActionState = {
  artifactHref?: string;
  artifactId?: string;
  message?: string;
  paymentId?: string;
  publicationStatus?: "failed" | "published";
  status?: "error" | "success";
};
