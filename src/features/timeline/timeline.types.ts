import type { CurrencyCode } from "@/lib/money/format";

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
  eventDate: string;
  eventType: TimelineEventType;
  title: string;
  description: string;
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  unitNumber?: string;
  cost?: number;
  currency?: CurrencyCode;
  hasAttachment: boolean;
  createdBy: string;
  relatedDocument?: string;
  relatedLease?: string;
  relatedLedgerEntry?: string;
};

export type TimelinePropertyOption = {
  id: string;
  label: string;
};

export type TimelineSnapshot = {
  netIncome: string;
  occupancy: string;
  maintenance: string;
  propertyCount: string;
};
