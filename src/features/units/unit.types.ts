import type { TimelineEventType } from "@/features/timeline/timeline.types";
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

export type UnitStatusFilter = UnitStatusValue | "all";

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
  startDate: string;
  statusLabel: string;
  tenantName: string;
};

export type UnitTimelineContext = {
  eventDate: string;
  eventType: TimelineEventType;
  id: string;
  title: string;
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

export type UnitRecordCounts = {
  documents: number;
  ledgerEntries: number;
  timelineEvents: number;
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
  unitNumber: string;
};

export type UnitDetail = UnitSummary & {
  activeLease?: UnitLeaseSummary;
  counts: UnitRecordCounts;
  recentLedgerEntries: UnitLedgerContext[];
  recentTimelineEvents: UnitTimelineContext[];
  sizeLabel: string;
};
