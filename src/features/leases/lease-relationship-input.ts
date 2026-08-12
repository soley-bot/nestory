type NewLeaseRelationshipInput = {
  actualMoveInDate?: string;
  actualMoveOutDate?: string;
  leaseStatus:
    | "active"
    | "cancelled"
    | "draft"
    | "ended"
    | "notice_given"
    | "terminated";
  recordSource: "imported_explicit" | "operator_confirmed";
  scheduledMoveInDate?: string;
  scheduledMoveOutDate?: string;
  tenantPersonId: string;
};

type PlannedLeaseRelationshipInput = Omit<
  NewLeaseRelationshipInput,
  "leaseStatus"
> & {
  leaseStatus: "cancelled" | "draft";
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
  kind: "known" | "open_current" | "unknown";
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
    lifecycle:
      | "cancelled_before_effective"
      | "ended"
      | "planned"
      | "present";
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
  const actualEvidence = buildActualOccupancyEvidence(input);

  return {
    occupancy: {
      actualMoveIn: actualEvidence.actualMoveIn,
      actualMoveOut: actualEvidence.actualMoveOut,
      lifecycle: occupancyLifecycle(input.leaseStatus),
      reason: "new_lease_relationship_composition",
      recordSource: input.recordSource,
      scheduledMoveIn: boundary(input.scheduledMoveInDate),
      scheduledMoveOut: boundary(input.scheduledMoveOutDate),
    },
    participants: actualEvidence.participants,
    primaryParty: {
      endedOn: boundary(),
      lifecycle: partyLifecycle(input.leaseStatus),
      personId: input.tenantPersonId,
      reason: "new_lease_relationship_composition",
      recordSource: input.recordSource,
      startedOn: boundary(),
    },
  };
}

function buildActualOccupancyEvidence(input: NewLeaseRelationshipInput) {
  const actualMoveIn = boundary(input.actualMoveInDate);

  if (!input.actualMoveInDate) {
    return {
      actualMoveIn,
      actualMoveOut: boundary(input.actualMoveOutDate),
      participants: [],
    };
  }

  const isCurrent =
    input.leaseStatus === "active" || input.leaseStatus === "notice_given";
  const actualMoveOut = isCurrent
    ? openBoundary()
    : boundary(input.actualMoveOutDate);

  return {
    actualMoveIn,
    actualMoveOut,
    participants: [
      {
        endedOn: isCurrent ? openBoundary() : boundary(input.actualMoveOutDate),
        lifecycle:
          input.leaseStatus === "ended" || input.leaseStatus === "terminated"
            ? ("ended" as const)
            : ("present" as const),
        personId: input.tenantPersonId,
        reason: "new_lease_relationship_composition" as const,
        recordSource: input.recordSource,
        startedOn: actualMoveIn,
      },
    ],
  };
}

export function buildPlannedLeaseRelationshipPayload(
  input: PlannedLeaseRelationshipInput,
): NewLeaseRelationshipPayload {
  const leaseStatus =
    input.leaseStatus as NewLeaseRelationshipInput["leaseStatus"];

  if (leaseStatus !== "cancelled" && leaseStatus !== "draft") {
    throw new Error(
      "Explicit participant evidence requires coherent actual occupancy dates",
    );
  }

  const participants =
    input.participantStartDate || input.participantEndDate
      ? [
          {
            endedOn: boundary(input.participantEndDate),
            lifecycle: participantLifecycle(leaseStatus),
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

function participantLifecycle(
  status: PlannedLeaseRelationshipInput["leaseStatus"],
): NewLeaseRelationshipPayload["participants"][number]["lifecycle"] {
  return status === "cancelled" ? "cancelled_before_effective" : "planned";
}

function boundary(date?: string): BoundaryEvidence {
  return date
    ? { confidence: "confirmed", date, kind: "known" }
    : { confidence: "unknown", date: null, kind: "unknown" };
}

function openBoundary(): BoundaryEvidence {
  return { confidence: "confirmed", date: null, kind: "open_current" };
}
