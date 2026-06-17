import type { CurrencyCode } from "@/lib/money/format";
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

export type TimelineEvent = {
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
  isLocked: boolean;
  ledgerEntryId?: string;
  createdBy: string;
  relatedDocument?: string;
  relatedLease?: string;
  relatedLedgerEntry?: string;
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

export type TimelineSnapshot = {
  netIncome: string;
  occupancy: string;
  maintenance: string;
  propertyCount: string;
};

export type TimelineArchiveState = "active" | "archived" | "all";

export type TimelineSortKey =
  | "date_desc"
  | "date_asc"
  | "type_asc"
  | "property_asc";

export type TimelineViewQuery = {
  archiveState: TimelineArchiveState;
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
