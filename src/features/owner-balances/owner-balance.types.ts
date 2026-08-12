export const OWNER_BALANCE_COMPONENTS = [
  "ips_held_owner_cash",
  "owner_due_to_ips",
  "ips_due_to_owner",
  "security_deposit_custody",
] as const;

export type OwnerBalanceComponent = (typeof OWNER_BALANCE_COMPONENTS)[number];

export const OWNER_BALANCE_COMPONENT_LABELS: Record<OwnerBalanceComponent, string> = {
  ips_held_owner_cash: "IPS-held owner cash",
  owner_due_to_ips: "Owner due to IPS",
  ips_due_to_owner: "IPS due to owner",
  security_deposit_custody: "Security-deposit custody",
};

declare const canonicalOwnerBalanceAmount: unique symbol;
export type CanonicalOwnerBalanceAmount = string & {
  readonly [canonicalOwnerBalanceAmount]: true;
};

export type OwnerOpeningRequestStatus = "submitted" | "approved" | "rejected";
export type OwnerOpeningRequestKind = "initial" | "correction";
export type OwnerOpeningEntryKind =
  | "opening"
  | "correction_reversal"
  | "correction_replacement";

export type OwnerBalanceActionErrorCode =
  | "validation"
  | "authentication"
  | "authorization"
  | "financial_month_locked"
  | "ownership_roster"
  | "evidence"
  | "stale_target"
  | "idempotency_conflict"
  | "not_found"
  | "unexpected_response"
  | "database";

export type OwnerBalanceActionState =
  | {
      status: "success";
      message: string;
      requestId: string;
      entryIds: string[];
    }
  | {
      status: "error";
      message: string;
      errorCode: OwnerBalanceActionErrorCode;
    };

export type OwnerOpeningEvidence = {
  id: string;
  fileName: string;
  storagePath: string;
  category: string;
  contentSha256: string | null;
  archivedAt: string | null;
  hashMatchesRequest: boolean;
};

export type OwnerOpeningRequestRecord = {
  id: string;
  requestKind: OwnerOpeningRequestKind;
  status: OwnerOpeningRequestStatus;
  proposedAmount: CanonicalOwnerBalanceAmount;
  reason: string;
  sourceReference: string | null;
  evidenceSha256: string;
  evidence: OwnerOpeningEvidence | null;
  correctionOfEntryId: string | null;
  resubmissionOfRequestId: string | null;
  propertyOwnerId: string;
  ownershipPercentSnapshot: string;
  ownershipRosterHash: string;
  payloadHash: string;
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
};

export type OwnerOpeningEntryRecord = {
  id: string;
  requestId: string;
  entryKind: OwnerOpeningEntryKind;
  signedAmount: CanonicalOwnerBalanceAmount;
  reversalOfEntryId: string | null;
  propertyOwnerId: string;
  ownershipPercentSnapshot: string;
  ownershipRosterHash: string;
  createdBy: string;
  createdAt: string;
};

export type OwnerOpeningAuthority =
  | { state: "unknown" }
  | {
      state: "known";
      amount: CanonicalOwnerBalanceAmount;
      knownZero: boolean;
      entryCount: number;
      latestEntryAt: string;
    };

export type OwnerOpeningComponentRecord = {
  component: OwnerBalanceComponent;
  authority: OwnerOpeningAuthority;
  currentAuthorityEntryId: string | null;
  requests: OwnerOpeningRequestRecord[];
  entries: OwnerOpeningEntryRecord[];
};

export type OwnerOpeningAuthorityGroup = {
  organizationId: string;
  propertyId: string;
  ownerPersonId: string;
  currency: string;
  effectiveDate: string;
  rosterState: "ready" | "blocked";
  components: OwnerOpeningComponentRecord[];
};

export type OwnerRosterReadinessRecord = {
  organizationId: string;
  propertyId: string;
  boundaryDate: string;
  nextBoundaryDate: string | null;
  issueCode: string;
  activeOwnerCount: number;
  ownershipPercentTotal: string;
  ownershipRosterHash: string | null;
  propertyOwnerIds: string[];
  canonicalRoster: unknown;
  setupPath: string;
};

export type OpeningBalanceAuthorityData = {
  effectiveDate: string;
  groups: OwnerOpeningAuthorityGroup[];
  readiness: OwnerRosterReadinessRecord[];
};

export type OwnerBalancePeriodStatus = "blocked" | "closed" | "ready" | "stale";

export type OwnerBalancePeriodComponentRecord = {
  component: OwnerBalanceComponent;
  openingAmount: CanonicalOwnerBalanceAmount;
  movementAmount: CanonicalOwnerBalanceAmount;
  closingAmount: CanonicalOwnerBalanceAmount;
};

export type OwnerBalancePeriodRecord = {
  id: string;
  monthStart: string;
  status: OwnerBalancePeriodStatus;
  components: OwnerBalancePeriodComponentRecord[];
  availableWithdrawal: CanonicalOwnerBalanceAmount | null;
  inputWatermark: string | null;
  inputHash: string | null;
  blockedReasonCode: string | null;
  blockedReasonDetail: unknown;
};

export type OwnerEventAllocationQueueRecord = {
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
  eventDate: string;
  grossSignedAmount: CanonicalOwnerBalanceAmount;
  allocationState: string;
  remediationCode: string | null;
  remediationDetail: unknown;
  allocationSetId: string | null;
};

export type OwnerBalanceSourceMovementRecord = {
  id: string;
  component: OwnerBalanceComponent;
  signedAmount: CanonicalOwnerBalanceAmount;
  reversalOfMovementId: string | null;
};

export type OwnerBalanceSourceRecord = {
  allocationSetId: string;
  eventDate: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
  grossSignedAmount: CanonicalOwnerBalanceAmount;
  sourceFingerprint: string;
  allocationBasis: string;
  allocatedGrossSignedAmount: CanonicalOwnerBalanceAmount;
  ownershipPercentSnapshot: string;
  ownershipRosterHash: string;
  reversalOfAllocationSetId: string | null;
  movements: OwnerBalanceSourceMovementRecord[];
};

export type OwnerBalanceOption = {
  id: string;
  label: string;
};

export type OwnerWithdrawalCapacity = {
  asOfDate: string;
  authoritativeHeldCash: CanonicalOwnerBalanceAmount;
  availableWithdrawal: CanonicalOwnerBalanceAmount | null;
  committedReserved: CanonicalOwnerBalanceAmount;
  periodStatus: string | null;
  status: string;
};

export type OwnerBalanceData = {
  periods: OwnerBalancePeriodRecord[];
  queue: OwnerEventAllocationQueueRecord[];
  sources: OwnerBalanceSourceRecord[];
  propertyOptions: OwnerBalanceOption[];
  ownerOptions: OwnerBalanceOption[];
  withdrawalCapacity: OwnerWithdrawalCapacity | null;
};
