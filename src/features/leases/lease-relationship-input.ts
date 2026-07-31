type NewLeaseRelationshipInput = {
  leaseStatus:
    | "active"
    | "cancelled"
    | "draft"
    | "ended"
    | "notice_given"
    | "terminated";
  recordSource: "imported_explicit" | "operator_confirmed";
  tenantPersonId: string;
};

type PlannedLeaseRelationshipInput = NewLeaseRelationshipInput & {
  participantEndDate?: string;
  participantStartDate?: string;
  partyEndDate?: string;
  partyStartDate?: string;
  scheduledMoveInDate?: string;
  scheduledMoveOutDate?: string;
};

type BoundaryEvidence = {
  confidence: "confirmed" | "unknown";
  date: string | null;
  kind: "known" | "unknown";
};

type NewLeaseRelationshipPayload = {
  occupancy: {
    actualMoveIn: BoundaryEvidence;
    actualMoveOut: BoundaryEvidence;
    lifecycle:
      | "cancelled_before_effective"
      | "notice_given"
      | "occupied"
      | "reserved"
      | "vacated";
    reason: "new_lease_relationship_composition";
    recordSource: NewLeaseRelationshipInput["recordSource"];
    scheduledMoveIn: BoundaryEvidence;
    scheduledMoveOut: BoundaryEvidence;
  };
  participants: Array<{
    endedOn: BoundaryEvidence;
    lifecycle: "cancelled_before_effective" | "planned";
    personId: string;
    reason: "new_lease_relationship_composition";
    recordSource: NewLeaseRelationshipInput["recordSource"];
    startedOn: BoundaryEvidence;
  }>;
  primaryParty: {
    endedOn: BoundaryEvidence;
    lifecycle:
      | "cancelled_before_effective"
      | "effective"
      | "ended"
      | "planned";
    personId: string;
    reason: "new_lease_relationship_composition";
    recordSource: NewLeaseRelationshipInput["recordSource"];
    startedOn: BoundaryEvidence;
  };
};

export function buildNewLeaseRelationshipPayload(
  input: NewLeaseRelationshipInput,
): NewLeaseRelationshipPayload {
  return buildPlannedLeaseRelationshipPayload(input);
}

export function buildPlannedLeaseRelationshipPayload(
  input: PlannedLeaseRelationshipInput,
): NewLeaseRelationshipPayload {
  const participants =
    input.participantStartDate || input.participantEndDate
      ? [
          {
            endedOn: boundary(input.participantEndDate),
            lifecycle:
              input.leaseStatus === "cancelled"
                ? ("cancelled_before_effective" as const)
                : ("planned" as const),
            personId: input.tenantPersonId,
            reason: "new_lease_relationship_composition" as const,
            recordSource: input.recordSource,
            startedOn: boundary(input.participantStartDate),
          },
        ]
      : [];

  return {
    occupancy: {
      actualMoveIn: boundary(),
      actualMoveOut: boundary(),
      lifecycle: occupancyLifecycle(input.leaseStatus),
      reason: "new_lease_relationship_composition",
      recordSource: input.recordSource,
      scheduledMoveIn: boundary(input.scheduledMoveInDate),
      scheduledMoveOut: boundary(input.scheduledMoveOutDate),
    },
    participants,
    primaryParty: {
      endedOn: boundary(input.partyEndDate),
      lifecycle: partyLifecycle(input.leaseStatus),
      personId: input.tenantPersonId,
      reason: "new_lease_relationship_composition",
      recordSource: input.recordSource,
      startedOn: boundary(input.partyStartDate),
    },
  };
}

function occupancyLifecycle(
  status: NewLeaseRelationshipInput["leaseStatus"],
): NewLeaseRelationshipPayload["occupancy"]["lifecycle"] {
  switch (status) {
    case "active":
      return "occupied";
    case "cancelled":
      return "cancelled_before_effective";
    case "ended":
    case "terminated":
      return "vacated";
    case "notice_given":
      return "notice_given";
    default:
      return "reserved";
  }
}

function partyLifecycle(
  status: NewLeaseRelationshipInput["leaseStatus"],
): NewLeaseRelationshipPayload["primaryParty"]["lifecycle"] {
  switch (status) {
    case "active":
    case "notice_given":
      return "effective";
    case "cancelled":
      return "cancelled_before_effective";
    case "ended":
    case "terminated":
      return "ended";
    default:
      return "planned";
  }
}

function boundary(date?: string): BoundaryEvidence {
  return date
    ? { confidence: "confirmed", date, kind: "known" }
    : { confidence: "unknown", date: null, kind: "unknown" };
}
