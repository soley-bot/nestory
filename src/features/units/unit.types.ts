import type { TimelineEventType } from "@/features/timeline/timeline.types";
import type { LinkedDocument } from "@/features/documents/document.types";
import type { AssetPhoto } from "@/features/photos/photo.types";
import type { RecentChange } from "@/features/activity/activity.types";
import type { CurrencyCode, MoneyDisplayValue } from "@/lib/money/format";

export type UnitBadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

export type UnitArchiveState = "active" | "archived" | "all";

export type UnitDisplayMode = "table" | "cards";

export type UnitSortKey =
  | "property_asc"
  | "unit_asc"
  | "status_asc"
  | "rent_desc"
  | "net_desc";

export type UnitStatusValue =
  | "vacant"
  | "occupied"
  | "reserved"
  | "maintenance"
  | "inactive";

export const UNIT_STATUS_OPTIONS: Array<{
  label: string;
  value: UnitStatusValue;
}> = [
  { label: "Occupied", value: "occupied" },
  { label: "Vacant", value: "vacant" },
  { label: "Reserved", value: "reserved" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Inactive", value: "inactive" },
];

export type UnitStatusFilter = UnitStatusValue | "all";

export type UnitLeaseStatusFilter = "missing" | "all";

export type UnitOccupancyFilter = "unoccupied" | "all";

export type UnitPropertyOption = {
  id: string;
  label: string;
};

export type UnitFormValues = {
  currentRentAmount?: number | null;
  currentRentCurrency?: CurrencyCode | null;
  floor?: string | null;
  propertyId: string;
  sizeSqm?: number | null;
  status: string;
  unitNumber: string;
};

export type UnitLeaseSummary = {
  id: string;
  endDate: string;
  monthlyRentDisplay: MoneyDisplayValue;
  monthlyRentLabel: string;
  personId?: string;
  startDate: string;
  statusLabel: string;
  tenantName: string;
};

export type UnitTimelineContext = {
  costDisplay?: MoneyDisplayValue;
  costLabel?: string;
  description: string;
  eventDate: string;
  eventType: TimelineEventType;
  id: string;
  ledgerEntryId?: string;
  leaseId?: string;
  title: string;
  unitId?: string;
};

export type UnitLedgerContext = {
  amount: number;
  amountDisplay: MoneyDisplayValue;
  amountLabel: string;
  category: string;
  currency: CurrencyCode;
  description: string;
  direction: "income" | "expense";
  id: string;
  transactionDate: string;
};

export type UnitMaintenanceContext = {
  actualCostLabel: string;
  category: string;
  dueLabel: string;
  href: string;
  id: string;
  priorityLabel: string;
  statusLabel: string;
  statusTone: UnitBadgeTone;
  title: string;
};

export type UnitRecordCounts = {
  documents: number;
  ledgerEntries: number;
  maintenanceCases?: number;
  openMaintenanceCases?: number;
  overdueMaintenanceCases?: number;
  photos?: number;
  timelineEvents: number;
};

export type UnitPersonLink = {
  contactLabel: string;
  displayName: string;
  href: string;
  id: string;
  roleLabel: string;
};

export type UnitDocumentContext = LinkedDocument & {
  linkedRecordHref?: string;
  linkedRecordLabel: string;
};

export type UnitFinancialSummary = {
  expenseDisplay: MoneyDisplayValue;
  expenseUsd: number;
  incomeDisplay: MoneyDisplayValue;
  incomeUsd: number;
  maintenanceExpenseDisplay: MoneyDisplayValue;
  maintenanceExpenseUsd: number;
  maintenanceRatioLabel: string;
  marginLabel: string;
  noiDisplay: MoneyDisplayValue;
  noiUsd: number;
  periodLabel: string;
  rentRevenueDisplay: MoneyDisplayValue;
  rentRevenueUsd: number;
};

export type UnitHealthIndicator = {
  description: string;
  id: string;
  label: string;
  tone: UnitBadgeTone;
};

export type UnitRepairAction = {
  description: string;
  href: string;
  label: string;
  tone: UnitBadgeTone;
};

export type UnitDetailHrefs = {
  addDocument: string;
  addLease: string;
  addLedgerEntry: string;
  addTimelineEvent: string;
  addMaintenanceCase: string;
  documents: string;
  ledger: string;
  lease?: string;
  leases: string;
  maintenance: string;
  property: string;
  repairAction: string;
  tenantPerson?: string;
  timeline: string;
};

export type UnitPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type UnitViewQuery = {
  archiveState: UnitArchiveState;
  leaseStatus: UnitLeaseStatusFilter;
  occupancy: UnitOccupancyFilter;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  sort: UnitSortKey;
  status: UnitStatusFilter;
};

export type UnitSummary = {
  id: string;
  formValues: UnitFormValues;
  floorLabel: string;
  hasActiveLease: boolean;
  isArchived: boolean;
  ledgerNetUsd: number;
  ledgerNetDisplay: MoneyDisplayValue;
  ledgerNetLabel: string;
  latestTimelineEvent?: UnitTimelineContext;
  leaseLabel: string;
  propertyCode: string;
  propertyId: string;
  propertyName: string;
  rentUsd: number;
  rentDisplay?: MoneyDisplayValue;
  rentLabel: string;
  statusValue: UnitStatusValue;
  statusLabel: string;
  statusTone: UnitBadgeTone;
  thumbnailUrl?: string;
  unitNumber: string;
};

export type UnitDetail = UnitSummary & {
  activeLease?: UnitLeaseSummary;
  activity: RecentChange[];
  counts: UnitRecordCounts;
  documents: UnitDocumentContext[];
  financialSummary: UnitFinancialSummary;
  healthIndicators: UnitHealthIndicator[];
  hrefs: UnitDetailHrefs;
  photos: AssetPhoto[];
  repairAction: UnitRepairAction;
  recentLedgerEntries: UnitLedgerContext[];
  recentMaintenanceCases: UnitMaintenanceContext[];
  recentTimelineEvents: UnitTimelineContext[];
  sizeLabel: string;
  tenantLinks: UnitPersonLink[];
};
