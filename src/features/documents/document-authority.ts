import type { PermissionKey } from "@/lib/auth/permission-catalog";

export type DocumentAuthorityDomain =
  | "finance"
  | "lease"
  | "maintenance"
  | "property";

type TimelineAuthoritySource = {
  eventType?: string | null;
  leaseId?: string | null;
  ledgerEntryId?: string | null;
};

type DocumentAuthoritySource = {
  leaseId?: string | null;
  ledgerEntryId?: string | null;
  propertyId?: string | null;
  taskId?: string | null;
  tenantRequestId?: string | null;
  timelineEvent?: TimelineAuthoritySource | null;
};

const maintenanceTimelineTypes = new Set([
  "Inspection",
  "Maintenance",
  "Renovation",
  "Repair",
]);
const leaseTimelineTypes = new Set([
  "Lease Ended",
  "Lease Started",
  "Rent Increase",
  "Tenant Move In",
  "Tenant Move Out",
]);

export function getDocumentAuthorityDomain(
  source: DocumentAuthoritySource,
): DocumentAuthorityDomain {
  if (source.ledgerEntryId || source.timelineEvent?.ledgerEntryId) {
    return "finance";
  }

  if (
    source.taskId ||
    source.tenantRequestId ||
    (source.timelineEvent?.eventType &&
      maintenanceTimelineTypes.has(source.timelineEvent.eventType))
  ) {
    return "maintenance";
  }

  if (
    source.leaseId ||
    source.timelineEvent?.leaseId ||
    (source.timelineEvent?.eventType &&
      leaseTimelineTypes.has(source.timelineEvent.eventType))
  ) {
    return "lease";
  }

  return "property";
}

export function getDocumentPermission(
  domain: DocumentAuthorityDomain,
  operation: "archive" | "read" | "write",
): PermissionKey {
  if (domain === "finance") {
    return operation === "read" ? "finance.view" : "finance.correct_records";
  }

  if (domain === "maintenance") {
    return operation === "read"
      ? "maintenance.view"
      : "maintenance.create_assign";
  }

  if (domain === "lease") {
    if (operation === "read") return "leases.view";
    return operation === "archive" ? "leases.archive" : "leases.change_terms";
  }

  if (operation === "read") return "properties.view";
  return operation === "archive" ? "properties.archive" : "properties.write";
}
