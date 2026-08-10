import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type OwnerBalanceComponent,
} from "@/features/owner-balances/owner-balance.types";
import type {
  OwnerCloseBlocker,
  OwnerCloseCorrection,
  OwnerCloseData,
  OwnerCloseLine,
  OwnerCloseLineKind,
  OwnerCloseLineSource,
  OwnerCloseReadiness,
  OwnerCloseRevision,
  OwnerCloseRevisionStatus,
  OwnerCloseScope,
  OwnerCloseSeries,
  OwnerCloseSeriesState,
} from "@/features/owner-close/owner-close.types";
import { requireOwnerCloseReadinessContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

const SERIES_STATES = new Set<OwnerCloseSeriesState>([
  "open", "preparing", "closed", "stale",
]);
const REVISION_STATUSES = new Set<OwnerCloseRevisionStatus>([
  "preparing", "closed", "abandoned",
]);
const LINE_KINDS = new Set<OwnerCloseLineKind>([
  "opening", "movement", "activity", "closing",
]);
const componentRank = new Map(
  OWNER_BALANCE_COMPONENTS.map((component, index) => [component, index]),
);
const SHA256 = /^[0-9a-f]{64}$/;

export async function getOwnerCloseData(
  scope: OwnerCloseScope,
): Promise<OwnerCloseData> {
  const context = await requireOwnerCloseReadinessContext();
  if (!scope.propertyId || !scope.ownerPersonId) return emptyData();

  const supabase = await createSupabaseServerClient();
  const rpcScope = {
    p_currency: scope.currency,
    p_month_start: scope.monthStart,
    p_organization_id: context.organizationId,
    p_owner_person_id: scope.ownerPersonId,
    p_property_id: scope.propertyId,
  };
  const readinessResult = await supabase.rpc("get_owner_close_readiness", rpcScope);
  if (readinessResult.error) throw new Error("Unable to load owner close readiness.");

  let readiness: OwnerCloseReadiness;
  try {
    readiness = mapReadiness(readinessResult.data);
  } catch {
    throw new Error("Invalid owner close readiness returned by the database.");
  }

  const historyResult = await supabase.rpc("get_owner_close_history", rpcScope);
  if (historyResult.error) throw new Error("Unable to load frozen owner close evidence.");
  try {
    return { ...mapHistory(historyResult.data), readiness };
  } catch {
    throw new Error("Invalid owner close evidence returned by the database.");
  }
}

function emptyData(): OwnerCloseData {
  return { corrections: [], readiness: null, revisions: [], series: null };
}

function mapReadiness(value: unknown): OwnerCloseReadiness {
  const row = object(value);
  if (
    typeof row.is_ready !== "boolean" ||
    !Array.isArray(row.blockers) ||
    !Array.isArray(row.components)
  ) throw new Error("Invalid readiness envelope.");

  const blockers = row.blockers.map((value): OwnerCloseBlocker => {
    const blocker = object(value);
    if (typeof blocker.code !== "string") throw new Error("Invalid blocker.");
    return blocker as OwnerCloseBlocker;
  });
  const components = row.components.map((value) => {
    const component = object(value);
    if (
      !isComponent(component.component) ||
      typeof component.opening_amount !== "string" ||
      typeof component.movement_amount !== "string" ||
      typeof component.closing_amount !== "string"
    ) throw new Error("Invalid readiness component.");
    return {
      closingAmount: canonicalizeSignedOwnerOpeningAmount(component.closing_amount),
      component: component.component,
      movementAmount: canonicalizeSignedOwnerOpeningAmount(component.movement_amount),
      openingAmount: canonicalizeSignedOwnerOpeningAmount(component.opening_amount),
    };
  });
  components.sort((left, right) =>
    (componentRank.get(left.component) ?? 0) -
    (componentRank.get(right.component) ?? 0),
  );
  if (components.length !== 0 && components.length !== 4) {
    throw new Error("Readiness must have four components.");
  }
  if (new Set(components.map((item) => item.component)).size !== components.length) {
    throw new Error("Readiness contains duplicate components.");
  }

  return {
    blockers,
    components,
    inputHash: hashOrNull(row.input_hash),
    inputWatermark: nullableString(row.input_watermark),
    isReady: row.is_ready,
    periodId: nullableString(row.period_id),
    seriesId: nullableString(row.series_id),
    seriesState: nullableState(row.series_state),
  };
}

function mapHistory(value: unknown): Omit<OwnerCloseData, "readiness"> {
  const envelope = object(value);
  if (!Array.isArray(envelope.revisions) || !Array.isArray(envelope.corrections)) {
    throw new Error("Invalid owner close history envelope.");
  }
  return {
    corrections: envelope.corrections.map(mapCorrection),
    revisions: envelope.revisions.map(mapRevision).sort(
      (left, right) => right.revisionNumber - left.revisionNumber,
    ),
    series: envelope.series === null ? null : mapSeries(envelope.series),
  };
}

function mapSeries(value: unknown): OwnerCloseSeries {
  const row = object(value);
  if (typeof row.state !== "string" || !SERIES_STATES.has(row.state as OwnerCloseSeriesState)) {
    throw new Error("Invalid owner close series state.");
  }
  return {
    activeRevisionId: nullableString(row.active_revision_id),
    currentClosedRevisionId: nullableString(row.current_closed_revision_id),
    id: requiredString(row.id),
    state: row.state as OwnerCloseSeriesState,
    stateChangedAt: requiredString(row.state_changed_at),
  };
}

function mapRevision(value: unknown): OwnerCloseRevision {
  const row = object(value);
  if (
    typeof row.status !== "string" ||
    !REVISION_STATUSES.has(row.status as OwnerCloseRevisionStatus) ||
    !Array.isArray(row.lines)
  ) throw new Error("Invalid owner close revision.");
  const revisionNumber = positiveInteger(row.revision_number);
  const lines = row.lines.map(mapLine).sort(
    (left, right) => left.lineNumber - right.lineNumber,
  );
  if (new Set(lines.map((line) => line.lineNumber)).size !== lines.length) {
    throw new Error("Duplicate frozen line number.");
  }

  const revision: OwnerCloseRevision = {
    closeReason: nullableString(row.close_reason),
    closedAt: nullableString(row.closed_at),
    closedBy: nullableString(row.closed_by),
    contentHash: hashOrNull(row.content_hash),
    id: requiredString(row.id),
    inputHash: hashOrNull(row.input_hash),
    inputWatermark: nullableString(row.input_watermark),
    lines,
    preparedAt: requiredString(row.prepared_at),
    preparedBy: requiredString(row.prepared_by),
    reopenReason: nullableString(row.reopen_reason),
    revisionNumber,
    status: row.status as OwnerCloseRevisionStatus,
    supersedesRevisionId: nullableString(row.supersedes_revision_id),
  };
  if (
    revision.status === "closed" &&
    (!revision.contentHash || !revision.inputHash || !revision.closedAt ||
      !revision.closedBy || !revision.closeReason)
  ) throw new Error("Closed revision evidence is incomplete.");
  return revision;
}

function mapLine(value: unknown): OwnerCloseLine {
  const row = object(value);
  if (
    typeof row.line_kind !== "string" ||
    !LINE_KINDS.has(row.line_kind as OwnerCloseLineKind) ||
    !Array.isArray(row.sources) ||
    typeof row.signed_amount !== "string"
  ) throw new Error("Invalid owner close line.");
  if (row.component !== null && !isComponent(row.component)) {
    throw new Error("Invalid owner close component.");
  }
  const sourceCount = positiveInteger(row.source_count);
  const sources = row.sources.map(mapSource).sort((left, right) =>
    left.sourceType.localeCompare(right.sourceType) ||
    left.sourceLineId.localeCompare(right.sourceLineId) ||
    left.id.localeCompare(right.id),
  );
  if (sources.length !== sourceCount) {
    throw new Error("Frozen line source count does not match.");
  }
  return {
    businessDate: requiredString(row.business_date),
    component: row.component as OwnerBalanceComponent | null,
    description: requiredString(row.description),
    id: requiredString(row.id),
    lineKind: row.line_kind as OwnerCloseLineKind,
    lineNumber: positiveInteger(row.line_number),
    signedAmount: canonicalizeSignedOwnerOpeningAmount(row.signed_amount),
    sourceCount,
    sources,
  };
}

function mapSource(value: unknown): OwnerCloseLineSource {
  const row = object(value);
  return {
    id: requiredString(row.id),
    ownerBalancePeriodComponentId: nullableString(row.owner_balance_period_component_id),
    ownerComponentMovementId: nullableString(row.owner_component_movement_id),
    ownerEventOwnerAllocationId: nullableString(row.owner_event_owner_allocation_id),
    ownerOpeningBalanceEntryId: nullableString(row.owner_opening_balance_entry_id),
    sourceFingerprint: requiredHash(row.source_fingerprint),
    sourceId: requiredString(row.source_id),
    sourceLineId: requiredString(row.source_line_id),
    sourceType: requiredString(row.source_type),
  };
}

function mapCorrection(value: unknown): OwnerCloseCorrection {
  const row = object(value);
  if (!isComponent(row.component) || typeof row.signed_amount !== "string") {
    throw new Error("Invalid owner close correction.");
  }
  return {
    component: row.component,
    createdAt: requiredString(row.created_at),
    createdBy: requiredString(row.created_by),
    effectiveDate: requiredString(row.effective_date),
    evidenceSha256: requiredHash(row.evidence_sha256),
    id: requiredString(row.id),
    reason: requiredString(row.reason),
    revisionId: requiredString(row.owner_close_revision_id),
    signedAmount: canonicalizeSignedOwnerOpeningAmount(row.signed_amount),
    sourceReference: requiredString(row.source_reference),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Expected string.");
  return value;
}

function nullableString(value: unknown) {
  if (value === null) return null;
  return requiredString(value);
}

function requiredHash(value: unknown) {
  const hash = requiredString(value);
  if (!SHA256.test(hash)) throw new Error("Expected SHA-256 hash.");
  return hash;
}

function hashOrNull(value: unknown) {
  if (value === null) return null;
  return requiredHash(value);
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Expected positive integer.");
  }
  return value;
}

function nullableState(value: unknown): OwnerCloseSeriesState | null {
  if (value === null) return null;
  if (typeof value !== "string" || !SERIES_STATES.has(value as OwnerCloseSeriesState)) {
    throw new Error("Invalid readiness series state.");
  }
  return value as OwnerCloseSeriesState;
}

function isComponent(value: unknown): value is OwnerBalanceComponent {
  return typeof value === "string" &&
    (OWNER_BALANCE_COMPONENTS as readonly string[]).includes(value);
}
