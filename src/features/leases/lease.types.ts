import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";
import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { PersonSelectOption } from "@/features/people/person-select";

export type LeaseBadgeTone =
  | "accent"
  | "danger"
  | "neutral"
  | "success"
  | "warning";

export type LeaseArchiveState = "active" | "archived" | "all";

export type LeaseSortKey =
  | "end_asc"
  | "rent_desc"
  | "start_desc"
  | "tenant_asc";

export type LeaseStatusValue =
  | "active"
  | "cancelled"
  | "draft"
  | "ended"
  | "notice_given"
  | "terminated";

export type LeaseStatusFilter = LeaseStatusValue | "all" | "current";
export type LeaseTenantStatusFilter = "all" | "missing";
export type LeasePaymentFrequency =
  | "annual"
  | "monthly"
  | "one_time"
  | "quarterly"
  | "semi_annual";
export type LeaseTermStatus =
  | "active"
  | "draft"
  | "expired"
  | "terminated"
  | "upcoming";

export type LeasePropertyOption = {
  id: string;
  label: string;
};

export type LeaseUnitOption = {
  id: string;
  label: string;
  propertyId: string;
  reservations?: LeaseUnitReservation[];
};

export type LeaseUnitReservation = {
  endDate: string;
  leaseId: string;
  startDate: string;
};

export type LeaseTenantOption = PersonSelectOption;

export type LeaseCreateContext = {
  propertyId: string;
  propertyLabel: string;
  unitId: string | null;
  unitLabel: string | null;
};

export type LeaseBillingRuleState = "current" | "historical" | "scheduled";

export type LeaseBillingRule = {
  billingRecipientKind: "company" | "individual" | null;
  billingRecipientLabel: string;
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
  leaseEndProrationRule: "actual_days";
  leaseStartProrationRule: "actual_days";
  managementFeeMode: "flat" | "percentage" | null;
  managementFeeValue: number | null;
  midPeriodRentChangeRule: "next_full_month";
  rentCalculationTimezone: string;
  shortMonthDueDayRule: "last_calendar_day";
  state: LeaseBillingRuleState;
};

export type LeaseBillingRuleFieldErrors = Partial<
  Record<
    | "billingRecipientKind"
    | "billingRecipientPersonId"
    | "chargeManagementFeeWhenActive"
    | "chargeThroughLeaseEnd"
    | "collectionRoute"
    | "finalPeriodProratedAmount"
    | "firstPeriodProratedAmount"
    | "fullManagementFeeDuringProration"
    | "leaseEndProrationRule"
    | "leaseStartProrationRule"
    | "managementFeeMode"
    | "managementFeeValue"
    | "midPeriodRentChangeRule"
    | "rentCalculationTimezone"
    | "shortMonthDueDayRule",
    string[]
  >
>;

export type LeaseBillingFormConfig = {
  companyOptions: Array<{ id: string; label: string }>;
  operationalTimezone: string;
  organizationName: string;
};

export type LeaseFormValues = {
  depositAmount?: number | null;
  depositCurrency?: CurrencyCode | null;
  leaseEndDate: string;
  leaseStartDate: string;
  monthlyRentAmount: number;
  monthlyRentCurrency: CurrencyCode;
  paymentFrequency?: LeasePaymentFrequency | null;
  propertyId: string;
  rentDueDay?: number | null;
  status: LeaseStatusValue;
  tenantPersonId: string;
  tenantName: string;
  termStatus?: LeaseTermStatus | null;
  unitId?: string | null;
};

export type LeasePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type LeaseViewQuery = {
  archiveState: LeaseArchiveState;
  endMonth: string;
  endsWithinDays: number | null;
  leaseId: string | null;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  sort: LeaseSortKey;
  status: LeaseStatusFilter;
  tenantStatus: LeaseTenantStatusFilter;
  unitId: string;
};

export type LeaseLinkedPerson = {
  contactLabel: string;
  href: string;
  id: string;
  isPrimary: boolean;
  label: string;
  roleLabel: string;
};

export type LeaseTermContext = {
  datesLabel: string;
  dueLabel: string;
  endDate: string;
  id: string;
  paymentFrequency: LeasePaymentFrequency | null;
  paymentFrequencyLabel: string;
  rentAmount: number;
  rentCurrency: CurrencyCode;
  rentDueDay: number | null;
  rentDisplay: MoneyDisplayValue;
  rentLabel: string;
  startDate: string;
  status: LeaseTermStatus | "superseded";
  statusLabel: string;
};

export type LeaseRentReadiness = {
  label: string;
  policyId?: string;
  reasonCode: string;
  repairLabel: string;
  status: string;
  termId?: string;
  tone: LeaseBadgeTone;
};

export type LeaseOccupancyContext = {
  actualLabel: string;
  datesLabel: string;
  evidenceLabel: string;
  evidenceState: string;
  id: string;
  residentLabel: string;
  scheduledLabel: string;
  statusLabel: string;
  unitHref?: string;
  unitLabel: string;
};

export type LeaseDepositContext = {
  amount: number;
  amountCents: number;
  amountDisplay: MoneyDisplayValue;
  amountLabel: string;
  id: string;
  currency: CurrencyCode;
  events: LeaseDepositEventContext[];
  heldBalance: number;
  heldBalanceCents: number;
  heldBalanceDisplay: MoneyDisplayValue;
  receivedAmount: number;
  statusLabel: string;
  typeLabel: string;
};

export type LeaseDepositEventContext = { id: string; eventDate: string; eventType: string; amountDisplay: MoneyDisplayValue; reference: string; reversible: boolean };

export type LeaseDocumentContext = LinkedDocument & {
  linkedRecordLabel: string;
};

export type LeaseTimelineContext = {
  eventDateLabel: string;
  href: string;
  id: string;
  title: string;
  typeLabel: string;
};

export type LeaseRecordCounts = {
  documents: number;
  ledgerEntries: number;
  parties: number;
  timelineEvents: number;
};

export type LeaseRiskIndicator = {
  description: string;
  id: string;
  label: string;
  tone: LeaseBadgeTone;
};

export type LeaseNextAction = {
  description: string;
  href: string;
  label: string;
  tone: LeaseBadgeTone;
};

export type LeaseDetailHrefs = {
  addDocument: string;
  addLedgerEntry: string;
  addTimelineEvent: string;
  documents: string;
  ledger: string;
  people: string;
  property: string;
  timeline: string;
  unit?: string;
};

export type LeaseSummary = {
  activationSchedule?: {
    activationDate: string;
    failureMessage: string | null;
    id: string;
    status: "cancelled" | "failed" | "pending" | "processed";
  };
  activity: RecentChange[];
  billingRules: LeaseBillingRule[];
  depositDisplay?: MoneyDisplayValue;
  depositLabel: string;
  deposits: LeaseDepositContext[];
  documents: LeaseDocumentContext[];
  endDateLabel: string;
  formValues: LeaseFormValues;
  hrefs: LeaseDetailHrefs;
  id: string;
  isArchived: boolean;
  leaseLabel: string;
  nextAction: LeaseNextAction;
  occupancies: LeaseOccupancyContext[];
  occupancyLabel: string;
  parties: LeaseLinkedPerson[];
  partySummary: string;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  recordCounts: LeaseRecordCounts;
  rentDisplay: MoneyDisplayValue;
  rentLabel: string;
  rentReadiness: LeaseRentReadiness;
  rentUsd: number;
  riskIndicators: LeaseRiskIndicator[];
  startDateLabel: string;
  statusLabel: string;
  statusTone: LeaseBadgeTone;
  statusValue: LeaseStatusValue;
  tenantName: string;
  termLabel: string;
  terms: LeaseTermContext[];
  timeline: LeaseTimelineContext[];
  unitId: string | null;
  unitLabel: string;
};
