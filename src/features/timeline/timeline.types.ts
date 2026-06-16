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
