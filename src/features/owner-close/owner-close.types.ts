import type {
  CanonicalOwnerBalanceAmount,
  OwnerBalanceComponent,
} from "@/features/owner-balances/owner-balance.types";

export type OwnerCloseSeriesState = "open" | "preparing" | "closed" | "stale";
export type OwnerCloseRevisionStatus = "preparing" | "closed" | "abandoned";
export type OwnerCloseLineKind = "opening" | "movement" | "activity" | "closing";

export type OwnerCloseBlocker = {
  code: string;
  [key: string]: unknown;
};

export type OwnerCloseReadinessComponent = {
  component: OwnerBalanceComponent;
  openingAmount: CanonicalOwnerBalanceAmount;
  movementAmount: CanonicalOwnerBalanceAmount;
  closingAmount: CanonicalOwnerBalanceAmount;
};

export type OwnerCloseReadiness = {
  blockers: OwnerCloseBlocker[];
  components: OwnerCloseReadinessComponent[];
  inputHash: string | null;
  inputWatermark: string | null;
  isReady: boolean;
  periodId: string | null;
  seriesId: string | null;
  seriesState: OwnerCloseSeriesState | null;
};

export type OwnerCloseSeries = {
  activeRevisionId: string | null;
  currentClosedRevisionId: string | null;
  id: string;
  state: OwnerCloseSeriesState;
  stateChangedAt: string;
};

export type OwnerCloseLineSource = {
  id: string;
  ownerBalancePeriodComponentId: string | null;
  ownerComponentMovementId: string | null;
  ownerEventOwnerAllocationId: string | null;
  ownerOpeningBalanceEntryId: string | null;
  sourceFingerprint: string;
  sourceId: string;
  sourceLineId: string;
  sourceType: string;
};

export type OwnerCloseLine = {
  businessDate: string;
  component: OwnerBalanceComponent | null;
  description: string;
  id: string;
  lineKind: OwnerCloseLineKind;
  lineNumber: number;
  signedAmount: CanonicalOwnerBalanceAmount;
  sourceCount: number;
  sources: OwnerCloseLineSource[];
};

export type OwnerCloseRevision = {
  closeReason: string | null;
  closedAt: string | null;
  closedBy: string | null;
  contentHash: string | null;
  id: string;
  inputHash: string | null;
  inputWatermark: string | null;
  lines: OwnerCloseLine[];
  preparedAt: string;
  preparedBy: string;
  reopenReason: string | null;
  revisionNumber: number;
  status: OwnerCloseRevisionStatus;
  supersedesRevisionId: string | null;
};

export type OwnerCloseCorrection = {
  component: OwnerBalanceComponent;
  createdAt: string;
  createdBy: string;
  effectiveDate: string;
  evidenceSha256: string;
  id: string;
  reason: string;
  revisionId: string;
  signedAmount: CanonicalOwnerBalanceAmount;
  sourceReference: string;
};

export type OwnerStatementPublicationReadiness = {
  blockers: OwnerCloseBlocker[];
  existingPublicationId: string | null;
  isReady: boolean;
  revisionId: string;
};

export type OwnerStatementPublicationArtifact = {
  format: "pdf" | "xlsx";
  id: string;
};

export type OwnerStatementPublicationSummary = {
  artifacts: OwnerStatementPublicationArtifact[];
  contentHash: string;
  generatedAt: string;
  id: string;
  revisionId: string;
  revisionNumber: number;
  statementNumber: string;
  supersededByPublicationId: string | null;
  supersedesPublicationId: string | null;
};

export type OwnerCloseData = {
  corrections: OwnerCloseCorrection[];
  publicationReadiness: OwnerStatementPublicationReadiness | null;
  publications: OwnerStatementPublicationSummary[];
  readiness: OwnerCloseReadiness | null;
  revisions: OwnerCloseRevision[];
  series: OwnerCloseSeries | null;
};

export type OwnerCloseScope = {
  currency: "USD";
  monthStart: string;
  ownerPersonId?: string;
  propertyId?: string;
};
