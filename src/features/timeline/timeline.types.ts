import type { CurrencyCode } from "@/lib/money/format";
import type { RecentChange } from "@/features/activity/activity.types";
import type { ActivityEntityType } from "@/features/activity/entity-target";
import type { LinkedDocument } from "@/features/documents/document.types";

export type TimelineEventType =
  | "Lease Started"
  | "Lease Ended"
  | "Tenant Move In"
  | "Tenant Move Out"
  | "Rent Increase"
  | "Maintenance"
  | "Repair"
  | "Renovation"
  | "Inspection"
  | "Document Added"
  | "General Note";

export type TimelineRecordCounts = {
  activity: number;
  documents: number;
  linkedRecords: number;
};

export type TimelineSourceReference =
  | {
      availability: "available";
      entityId: string;
      entityType: ActivityEntityType;
      href: string;
      isArchived: boolean;
      label: string;
      moduleLabel: string;
    }
  | {
      availability: "unavailable";
      entityType: ActivityEntityType;
      label: string;
      moduleLabel: string;
    };

export type TimelineRiskIndicator = {
  description: string;
  id: string;
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
};

export type TimelineDetailHrefs = {
  documents: string;
  ledger?: string;
  lease?: string;
  property: string;
  timeline: string;
  unit?: string;
};

export type TimelineNextAction = {
  description: string;
  href: string;
  label: string;
  tone: TimelineRiskIndicator["tone"];
};

export type TimelineEvent = {
  activity: RecentChange[];
  id: string;
  archivedAt?: string;
  eventDate: string;
  eventType: TimelineEventType;
  title: string;
  description: string;
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  unitId?: string;
  unitNumber?: string;
  cost?: number;
  currency?: CurrencyCode;
  documents: LinkedDocument[];
  hasAttachment: boolean;
  hrefs: TimelineDetailHrefs;
  isLocked: boolean;
  ledgerEntryId?: string;
  nextAction: TimelineNextAction;
  recordCounts: TimelineRecordCounts;
  createdBy: string;
  relatedDocument?: string;
  relatedLease?: string;
  relatedLeaseId?: string;
  relatedLedgerEntry?: string;
  riskIndicators: TimelineRiskIndicator[];
  sources: TimelineSourceReference[];
};

export type TimelinePropertyOption = {
  id: string;
  label: string;
};

export type TimelineUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type TimelineArchiveState = "active" | "archived" | "all";

export type TimelineScope = "global" | "property" | "maintenance" | "financial";

export type TimelineSortKey =
  "date_desc" | "date_asc" | "type_asc" | "property_asc";

export type TimelineViewQuery = {
  archiveState: TimelineArchiveState;
  dateFrom: string | null;
  dateTo: string | null;
  eventId: string | null;
  eventType: TimelineEventType | "all";
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  sort: TimelineSortKey;
  unitId?: string;
};

export type TimelinePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};
