import type { TimelineEvent } from "@/features/timeline/timeline.types";

export const timelineEvents: TimelineEvent[] = [
  {
    id: "evt_001",
    eventDate: "2026-06-12",
    eventType: "Renovation",
    title: "Bathroom renovation completed",
    description:
      "Unit 12B bathroom refit completed with new tiles, sink, waterproofing, and fixtures.",
    propertyName: "Central Residence",
    propertyCode: "CTR-RES-018",
    unitNumber: "12B",
    cost: 2450,
    currency: "USD",
    hasAttachment: true,
    createdBy: "Admin",
    relatedDocument: "Invoice REN-2026-144",
    relatedLedgerEntry: "EXP-2026-0612",
  },
  {
    id: "evt_002",
    eventDate: "2026-06-08",
    eventType: "Inspection",
    title: "Quarterly unit inspection",
    description:
      "Minor paint marks noted in living area. Air conditioner and water pressure passed inspection.",
    propertyName: "Central Residence",
    propertyCode: "CTR-RES-018",
    unitNumber: "09A",
    hasAttachment: true,
    createdBy: "Admin",
    relatedDocument: "Inspection 09A Jun 2026",
  },
  {
    id: "evt_003",
    eventDate: "2026-05-31",
    eventType: "Rent Increase",
    title: "Rent increased at renewal",
    description:
      "Monthly rent updated after lease renewal based on market review and owner approval.",
    propertyName: "Northline Mixed Use",
    propertyCode: "NTH-MU-006",
    unitNumber: "04C",
    cost: 75,
    currency: "USD",
    hasAttachment: false,
    createdBy: "Admin",
    relatedLease: "Lease 04C 2026-2027",
  },
  {
    id: "evt_004",
    eventDate: "2026-05-25",
    eventType: "Maintenance",
    title: "Air conditioner service",
    description:
      "Cleaned filters, checked gas pressure, and replaced worn drain pipe in bedroom unit.",
    propertyName: "Canal View Apartments",
    propertyCode: "CNV-APT-003",
    unitNumber: "07D",
    cost: 185000,
    currency: "KHR",
    hasAttachment: true,
    createdBy: "Admin",
    relatedDocument: "Receipt AC-0525",
    relatedLedgerEntry: "EXP-2026-0525",
  },
  {
    id: "evt_005",
    eventDate: "2026-05-19",
    eventType: "Lease Started",
    title: "New lease started",
    description:
      "Tenant moved in after deposit confirmation and handover checklist completion.",
    propertyName: "Central Residence",
    propertyCode: "CTR-RES-018",
    unitNumber: "03A",
    hasAttachment: true,
    createdBy: "Admin",
    relatedLease: "Lease 03A 2026-2027",
  },
  {
    id: "evt_006",
    eventDate: "2026-05-12",
    eventType: "Document Added",
    title: "Updated owner agreement uploaded",
    description:
      "Signed owner agreement added to property document record after renewal.",
    propertyName: "Garden Lane Townhouse",
    propertyCode: "GL-TH-011",
    hasAttachment: true,
    createdBy: "Admin",
    relatedDocument: "Owner Agreement 2026",
  },
];

export const eventTypes = Array.from(
  new Set(timelineEvents.map((event) => event.eventType)),
).sort();

export const propertyOptions = Array.from(
  new Set(timelineEvents.map((event) => event.propertyName)),
).sort();
