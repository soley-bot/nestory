import { z } from "zod";

import { requireOwnerBalanceReadContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  canonicalizeOwnerOpeningAmount,
  canonicalizeSignedOwnerOpeningAmount,
} from "../owner-balance.money";
import {
  OWNER_BALANCE_COMPONENTS,
  type OpeningBalanceAuthorityData,
  type OwnerBalanceComponent,
  type OwnerOpeningAuthorityGroup,
  type OwnerOpeningEntryKind,
  type OwnerOpeningEntryRecord,
  type OwnerOpeningRequestKind,
  type OwnerOpeningRequestRecord,
  type OwnerOpeningRequestStatus,
  type OwnerRosterReadinessRecord,
} from "../owner-balance.types";

const uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);
const inputSchema = z.object({
  currency: z.literal("USD").optional(),
  effectiveDate: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-01$/),
  ownerPersonId: uuid.optional(),
  propertyId: uuid.optional(),
});

const REQUEST_SELECT = [
  "id",
  "organization_id",
  "property_id",
  "owner_person_id",
  "currency",
  "effective_date",
  "component",
  "request_kind",
  "status",
  "proposed_amount_text:proposed_amount::text",
  "reason",
  "source_reference",
  "supporting_document_id",
  "evidence_sha256",
  "correction_of_entry_id",
  "resubmission_of_request_id",
  "property_owner_id",
  "ownership_percent_snapshot_text:ownership_percent_snapshot::text",
  "ownership_roster_hash",
  "payload_hash",
  "submitted_by",
  "submitted_at",
  "reviewed_by",
  "reviewed_at",
  "review_reason",
  "created_at",
].join(",");

const ENTRY_SELECT = [
  "id",
  "organization_id",
  "property_id",
  "owner_person_id",
  "currency",
  "effective_date",
  "component",
  "request_id",
  "entry_kind",
  "signed_amount_text:signed_amount::text",
  "reversal_of_entry_id",
  "property_owner_id",
  "ownership_percent_snapshot_text:ownership_percent_snapshot::text",
  "ownership_roster_hash",
  "created_by",
  "created_at",
].join(",");

const KNOWN_SELECT = [
  "organization_id",
  "property_id",
  "owner_person_id",
  "currency",
  "effective_date",
  "component",
  "authority_state",
  "current_amount_text:current_amount::text",
  "entry_count",
  "latest_entry_at",
].join(",");

const READINESS_SELECT = [
  "organization_id",
  "property_id",
  "boundary_date",
  "next_boundary_date",
  "issue_code",
  "active_owner_count",
  "ownership_percent_total_text:ownership_percent_total::text",
  "ownership_roster_hash",
  "property_owner_ids",
  "canonical_roster",
  "setup_path",
].join(",");

const ASSIGNMENT_SELECT = [
  "id",
  "organization_id",
  "property_id",
  "person_id",
  "ownership_percent_text:ownership_percent::text",
  "started_on",
  "ended_on",
  "archived_at",
].join(",");

type RawRequest = {
  id: string;
  organization_id: string;
  property_id: string;
  owner_person_id: string;
  currency: string;
  effective_date: string;
  component: string;
  request_kind: string;
  status: string;
  proposed_amount_text: string;
  reason: string;
  source_reference: string | null;
  supporting_document_id: string | null;
  evidence_sha256: string;
  correction_of_entry_id: string | null;
  resubmission_of_request_id: string | null;
  property_owner_id: string;
  ownership_percent_snapshot_text: string;
  ownership_roster_hash: string;
  payload_hash: string;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
};

type RawEntry = {
  id: string;
  organization_id: string;
  property_id: string;
  owner_person_id: string;
  currency: string;
  effective_date: string;
  component: string;
  request_id: string;
  entry_kind: string;
  signed_amount_text: string;
  reversal_of_entry_id: string | null;
  property_owner_id: string;
  ownership_percent_snapshot_text: string;
  ownership_roster_hash: string;
  created_by: string;
  created_at: string;
};

type RawKnown = {
  organization_id: string;
  property_id: string;
  owner_person_id: string;
  currency: string;
  effective_date: string;
  component: string;
  authority_state: string;
  current_amount_text: string;
  entry_count: number;
  latest_entry_at: string;
};

type RawDocument = {
  id: string;
  organization_id: string;
  property_id: string | null;
  category: string;
  file_name: string;
  storage_path: string;
  content_sha256: string | null;
  archived_at: string | null;
};

type RawReadiness = {
  active_owner_count: number;
  boundary_date: string;
  canonical_roster: unknown;
  issue_code: string | null;
  next_boundary_date: string | null;
  organization_id: string;
  ownership_percent_total_text: string;
  ownership_roster_hash: string | null;
  property_id: string;
  property_owner_ids: string[];
  setup_path: string;
};

type RawAssignment = {
  archived_at: string | null;
  ended_on: string | null;
  id: string;
  organization_id: string;
  ownership_percent_text: string;
  person_id: string;
  property_id: string;
  started_on: string;
};

type RawScopedRecord = {
  archived_at: string | null;
  id: string;
  organization_id: string;
};

type RawOwnerRole = {
  archived_at: string | null;
  organization_id: string;
  person_id: string;
  role: string;
  status: string;
};

export async function getOpeningBalanceAuthorityData(
  input: z.input<typeof inputSchema>,
): Promise<OpeningBalanceAuthorityData> {
  const scope = inputSchema.parse(input);
  const context = await requireOwnerBalanceReadContext();
  const supabase = await createSupabaseServerClient();

  let requestQuery = supabase
    .from("owner_opening_balance_requests")
    .select(REQUEST_SELECT)
    .eq("organization_id", context.organizationId)
    .eq("effective_date", scope.effectiveDate);
  let entryQuery = supabase
    .from("owner_opening_balance_entries")
    .select(ENTRY_SELECT)
    .eq("organization_id", context.organizationId)
    .eq("effective_date", scope.effectiveDate);
  let knownQuery = supabase
    .from("owner_opening_balance_known_authority_v1")
    .select(KNOWN_SELECT)
    .eq("organization_id", context.organizationId)
    .eq("effective_date", scope.effectiveDate);
  let readinessQuery = supabase
    .rpc("get_owner_roster_readiness", {
      p_cutover_date: scope.effectiveDate,
      p_organization_id: context.organizationId,
    })
    .select(READINESS_SELECT);
  let assignmentQuery = supabase
    .from("property_owners")
    .select(ASSIGNMENT_SELECT)
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .lte("started_on", scope.effectiveDate)
    .or(`ended_on.is.null,ended_on.gt.${scope.effectiveDate}`);

  if (scope.propertyId) {
    requestQuery = requestQuery.eq("property_id", scope.propertyId);
    entryQuery = entryQuery.eq("property_id", scope.propertyId);
    knownQuery = knownQuery.eq("property_id", scope.propertyId);
    readinessQuery = readinessQuery.eq("property_id", scope.propertyId);
    assignmentQuery = assignmentQuery.eq("property_id", scope.propertyId);
  }
  if (scope.ownerPersonId) {
    requestQuery = requestQuery.eq("owner_person_id", scope.ownerPersonId);
    entryQuery = entryQuery.eq("owner_person_id", scope.ownerPersonId);
    knownQuery = knownQuery.eq("owner_person_id", scope.ownerPersonId);
  }
  if (scope.currency) {
    requestQuery = requestQuery.eq("currency", scope.currency);
    entryQuery = entryQuery.eq("currency", scope.currency);
    knownQuery = knownQuery.eq("currency", scope.currency);
  }

  const [requestResult, entryResult, knownResult, readinessResult, assignmentResult] = await Promise.all([
    requestQuery.order("submitted_at", { ascending: false }).order("id", {
      ascending: false,
    }),
    entryQuery.order("created_at", { ascending: true }).order("id", {
      ascending: true,
    }),
    knownQuery.order("property_id", { ascending: true }),
    readinessQuery,
    assignmentQuery.order("property_id", { ascending: true }).order("id", {
      ascending: true,
    }),
  ]);

  assertQuerySucceeded(requestResult.error);
  assertQuerySucceeded(entryResult.error);
  assertQuerySucceeded(knownResult.error);
  assertQuerySucceeded(readinessResult.error);
  assertQuerySucceeded(assignmentResult.error);

  const rawRequests = (requestResult.data ?? []) as unknown as RawRequest[];
  const rawEntries = (entryResult.data ?? []) as unknown as RawEntry[];
  const rawKnown = (knownResult.data ?? []) as unknown as RawKnown[];
  const rawReadiness = (readinessResult.data ?? []) as unknown as RawReadiness[];
  const rawAssignments = (assignmentResult.data ?? []) as unknown as RawAssignment[];
  assertOrganization(context.organizationId, [
    ...rawRequests,
    ...rawEntries,
    ...rawKnown,
    ...rawReadiness,
    ...rawAssignments,
  ]);

  const scopedReadiness = rawReadiness.filter(
    (row) => row.boundary_date === scope.effectiveDate,
  );
  const scopedBlockers = scopedReadiness.filter(
    (row): row is RawReadiness & { issue_code: string } => row.issue_code !== null,
  );
  const validAssignments = await filterValidAssignments({
    assignments: rawAssignments,
    blockedPropertyIds: new Set(scopedBlockers.map((row) => row.property_id)),
    effectiveDate: scope.effectiveDate,
    organizationId: context.organizationId,
    selectedOwnerPersonId: scope.ownerPersonId,
    supabase,
  });

  const documentIds = [
    ...new Set(
      rawRequests.flatMap((row) =>
        row.supporting_document_id ? [row.supporting_document_id] : [],
      ),
    ),
  ].sort(compareText);
  let documents: RawDocument[] = [];
  if (documentIds.length > 0) {
    const documentResult = await supabase
      .from("documents")
      .select(
        "id,organization_id,property_id,category,file_name,storage_path,content_sha256,archived_at",
      )
      .eq("organization_id", context.organizationId)
      .in("id", documentIds)
      .order("id", { ascending: true });
    assertQuerySucceeded(documentResult.error);
    documents = (documentResult.data ?? []) as unknown as RawDocument[];
    assertOrganization(context.organizationId, documents);
  }

  const groups = mapGroups(
    rawRequests,
    rawEntries,
    rawKnown,
    documents,
    validAssignments,
    scope.effectiveDate,
  );
  const readiness = scopedBlockers.map(mapReadiness).sort(compareReadiness);
  return { effectiveDate: scope.effectiveDate, groups, readiness };
}

function mapGroups(
  rawRequests: RawRequest[],
  rawEntries: RawEntry[],
  rawKnown: RawKnown[],
  documents: RawDocument[],
  validAssignments: RawAssignment[],
  effectiveDate: string,
): OwnerOpeningAuthorityGroup[] {
  const groupKeys = new Map<string, GroupIdentity>();
  for (const row of [...rawRequests, ...rawEntries, ...rawKnown]) {
    const identity = identityOf(row);
    groupKeys.set(groupKey(identity), identity);
  }
  const readyGroupKeys = new Set<string>();
  for (const assignment of validAssignments) {
    const identity = assignmentIdentity(assignment, effectiveDate);
    const key = groupKey(identity);
    groupKeys.set(key, identity);
    readyGroupKeys.add(key);
  }
  const documentsById = new Map(documents.map((document) => [document.id, document]));

  return [...groupKeys.values()]
    .sort(compareGroup)
    .map((identity) => ({
      ...identity,
      rosterState: readyGroupKeys.has(groupKey(identity))
        ? "ready" as const
        : "blocked" as const,
      components: OWNER_BALANCE_COMPONENTS.map((component) => {
        const entries = rawEntries
          .filter((row) => inComponent(row, identity, component))
          .sort(compareEntryRows)
          .map(mapEntry);
        const known = rawKnown.find((row) => inComponent(row, identity, component));
        const currentAuthorityEntryId = known ? findCurrentAuthorityEntry(entries) : null;
        const requests = orderRequestsByCurrentSemantics(
          rawRequests
            .filter((row) => inComponent(row, identity, component))
            .map((row) => mapRequest(row, documentsById)),
          entries,
          currentAuthorityEntryId,
        );
        return {
          authority: known
            ? {
                amount: canonicalizeSignedOwnerOpeningAmount(known.current_amount_text),
                entryCount: known.entry_count,
                knownZero: canonicalizeSignedOwnerOpeningAmount(
                  known.current_amount_text,
                ) === "0.00",
                latestEntryAt: known.latest_entry_at,
                state: "known" as const,
              }
            : { state: "unknown" as const },
          component,
          currentAuthorityEntryId,
          entries,
          requests,
        };
      }),
    }));
}

function assignmentIdentity(row: RawAssignment, effectiveDate: string): GroupIdentity {
  return {
    currency: "USD",
    effectiveDate,
    organizationId: row.organization_id,
    ownerPersonId: row.person_id,
    propertyId: row.property_id,
  };
}

async function filterValidAssignments({
  assignments,
  blockedPropertyIds,
  effectiveDate,
  organizationId,
  selectedOwnerPersonId,
  supabase,
}: {
  assignments: RawAssignment[];
  blockedPropertyIds: Set<string>;
  effectiveDate: string;
  organizationId: string;
  selectedOwnerPersonId?: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}): Promise<RawAssignment[]> {
  const effectiveAssignments = assignments.filter(
    (assignment) =>
      assignment.organization_id === organizationId &&
      assignment.archived_at === null &&
      assignment.started_on <= effectiveDate &&
      (assignment.ended_on === null || effectiveDate < assignment.ended_on),
  );
  if (effectiveAssignments.length === 0) return [];

  const propertyIds = [...new Set(effectiveAssignments.map((row) => row.property_id))]
    .sort(compareText);
  const personIds = [...new Set(effectiveAssignments.map((row) => row.person_id))]
    .sort(compareText);
  const [propertyResult, peopleResult, roleResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id,organization_id,archived_at")
      .eq("organization_id", organizationId)
      .in("id", propertyIds)
      .is("archived_at", null),
    supabase
      .from("people")
      .select("id,organization_id,archived_at")
      .eq("organization_id", organizationId)
      .in("id", personIds)
      .is("archived_at", null),
    supabase
      .from("person_roles")
      .select("organization_id,person_id,role,status,archived_at")
      .eq("organization_id", organizationId)
      .in("person_id", personIds)
      .eq("role", "owner")
      .eq("status", "active")
      .is("archived_at", null),
  ]);
  assertQuerySucceeded(propertyResult.error);
  assertQuerySucceeded(peopleResult.error);
  assertQuerySucceeded(roleResult.error);

  const properties = (propertyResult.data ?? []) as unknown as RawScopedRecord[];
  const people = (peopleResult.data ?? []) as unknown as RawScopedRecord[];
  const roles = (roleResult.data ?? []) as unknown as RawOwnerRole[];
  assertOrganization(organizationId, [...properties, ...people, ...roles]);
  const activeProperties = new Set(
    properties.filter((row) => row.archived_at === null).map((row) => row.id),
  );
  const activePeople = new Set(
    people.filter((row) => row.archived_at === null).map((row) => row.id),
  );
  const activeOwners = new Set(
    roles
      .filter(
        (row) =>
          row.archived_at === null && row.role === "owner" && row.status === "active",
      )
      .map((row) => row.person_id),
  );
  const byProperty = new Map<string, RawAssignment[]>();
  for (const assignment of effectiveAssignments) {
    const rows = byProperty.get(assignment.property_id) ?? [];
    rows.push(assignment);
    byProperty.set(assignment.property_id, rows);
  }

  const valid: RawAssignment[] = [];
  for (const [propertyId, rows] of byProperty) {
    const shares = rows.map((row) => ownershipPercentMillis(row.ownership_percent_text));
    const uniqueOwners = new Set(rows.map((row) => row.person_id));
    const rosterReady =
      !blockedPropertyIds.has(propertyId) &&
      activeProperties.has(propertyId) &&
      uniqueOwners.size === rows.length &&
      shares.every((share) => share !== null && share > 0) &&
      shares.reduce<number>((total, share) => total + (share ?? 0), 0) === 100000 &&
      rows.every(
        (row) => activePeople.has(row.person_id) && activeOwners.has(row.person_id),
      );
    if (!rosterReady) continue;
    valid.push(
      ...rows.filter(
        (row) => !selectedOwnerPersonId || row.person_id === selectedOwnerPersonId,
      ),
    );
  }
  return valid.sort(
    (left, right) =>
      compareText(left.property_id, right.property_id) || compareText(left.id, right.id),
  );
}

function ownershipPercentMillis(value: string): number | null {
  const match = /^(?:0|[1-9]\d{0,2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const whole = value.includes(".") ? value.slice(0, value.indexOf(".")) : value;
  return decimalDigits(whole) * 1000 + decimalDigits((match[1] ?? "").padEnd(3, "0"));
}

function decimalDigits(value: string): number {
  return [...value].reduce(
    (total, digit) => total * 10 + digit.charCodeAt(0) - "0".charCodeAt(0),
    0,
  );
}

type GroupIdentity = {
  organizationId: string;
  propertyId: string;
  ownerPersonId: string;
  currency: string;
  effectiveDate: string;
};

function identityOf(row: {
  organization_id: string;
  property_id: string;
  owner_person_id: string;
  currency: string;
  effective_date: string;
}): GroupIdentity {
  return {
    currency: row.currency,
    effectiveDate: row.effective_date,
    organizationId: row.organization_id,
    ownerPersonId: row.owner_person_id,
    propertyId: row.property_id,
  };
}

function groupKey(identity: GroupIdentity): string {
  return [
    identity.organizationId,
    identity.propertyId,
    identity.ownerPersonId,
    identity.currency,
    identity.effectiveDate,
  ].join("|");
}

function inComponent(
  row: {
    organization_id: string;
    property_id: string;
    owner_person_id: string;
    currency: string;
    effective_date: string;
    component: string;
  },
  identity: GroupIdentity,
  component: OwnerBalanceComponent,
) {
  return groupKey(identityOf(row)) === groupKey(identity) && row.component === component;
}

function mapRequest(
  row: RawRequest,
  documentsById: Map<string, RawDocument>,
): OwnerOpeningRequestRecord {
  const document = row.supporting_document_id
    ? documentsById.get(row.supporting_document_id) ?? null
    : null;
  return {
    correctionOfEntryId: row.correction_of_entry_id,
    createdAt: row.created_at,
    evidence: document
      ? {
          archivedAt: document.archived_at,
          category: document.category,
          contentSha256: document.content_sha256,
          fileName: document.file_name,
          hashMatchesRequest: document.content_sha256 === row.evidence_sha256,
          id: document.id,
          storagePath: document.storage_path,
        }
      : null,
    evidenceSha256: row.evidence_sha256,
    id: row.id,
    ownershipPercentSnapshot: canonicalizeOwnershipPercent(
      row.ownership_percent_snapshot_text,
    ),
    ownershipRosterHash: row.ownership_roster_hash,
    payloadHash: row.payload_hash,
    propertyOwnerId: row.property_owner_id,
    proposedAmount: canonicalizeOwnerOpeningAmount(row.proposed_amount_text),
    reason: row.reason,
    requestKind: requestKind(row.request_kind),
    resubmissionOfRequestId: row.resubmission_of_request_id,
    reviewReason: row.review_reason,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    sourceReference: row.source_reference,
    status: requestStatus(row.status),
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
  };
}

function mapEntry(row: RawEntry): OwnerOpeningEntryRecord {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    entryKind: entryKind(row.entry_kind),
    id: row.id,
    ownershipPercentSnapshot: canonicalizeOwnershipPercent(
      row.ownership_percent_snapshot_text,
    ),
    ownershipRosterHash: row.ownership_roster_hash,
    propertyOwnerId: row.property_owner_id,
    requestId: row.request_id,
    reversalOfEntryId: row.reversal_of_entry_id,
    signedAmount: canonicalizeSignedOwnerOpeningAmount(row.signed_amount_text),
  };
}

function findCurrentAuthorityEntry(entries: OwnerOpeningEntryRecord[]): string | null {
  const reversed = new Set(
    entries.flatMap((entry) =>
      entry.entryKind === "correction_reversal" && entry.reversalOfEntryId
        ? [entry.reversalOfEntryId]
        : [],
    ),
  );
  const candidates = entries.filter(
    (entry) =>
      (entry.entryKind === "opening" || entry.entryKind === "correction_replacement") &&
      !reversed.has(entry.id),
  );
  return candidates.length === 1 ? candidates[0]!.id : null;
}

function orderRequestsByCurrentSemantics(
  requests: OwnerOpeningRequestRecord[],
  entries: OwnerOpeningEntryRecord[],
  currentAuthorityEntryId: string | null,
): OwnerOpeningRequestRecord[] {
  if (requests.length < 2) return [...requests];

  const successorIds = new Set(
    requests.flatMap((request) =>
      request.resubmissionOfRequestId ? [request.resubmissionOfRequestId] : [],
    ),
  );
  const leaves = requests.filter((request) => !successorIds.has(request.id));
  const submitted = leaves.filter((request) => request.status === "submitted");
  const currentAuthorityEntry = currentAuthorityEntryId
    ? entries.find((entry) => entry.id === currentAuthorityEntryId) ?? null
    : null;
  const unresolvedRejected = leaves.filter(
    (request) =>
      request.status === "rejected" &&
      (request.requestKind === "initial" ||
        request.correctionOfEntryId === currentAuthorityEntryId),
  );
  const authorityRequest = currentAuthorityEntry
    ? requests.find((request) => request.id === currentAuthorityEntry.requestId) ?? null
    : null;
  const current =
    (submitted.length === 1 ? submitted[0] : null) ??
    (unresolvedRejected.length === 1 ? unresolvedRejected[0] : null) ??
    authorityRequest ??
    [...leaves].sort(compareRequestSemantics)[0] ??
    [...requests].sort(compareRequestSemantics)[0]!;

  const byId = new Map(requests.map((request) => [request.id, request]));
  const ordered: OwnerOpeningRequestRecord[] = [];
  const included = new Set<string>();
  let cursor: OwnerOpeningRequestRecord | undefined = current;
  while (cursor && !included.has(cursor.id)) {
    ordered.push(cursor);
    included.add(cursor.id);
    cursor = cursor.resubmissionOfRequestId
      ? byId.get(cursor.resubmissionOfRequestId)
      : undefined;
  }
  ordered.push(
    ...requests
      .filter((request) => !included.has(request.id))
      .sort(compareRequestSemantics),
  );
  return ordered;
}

function mapReadiness(
  row: RawReadiness & { issue_code: string },
): OwnerRosterReadinessRecord {
  return {
    activeOwnerCount: row.active_owner_count,
    boundaryDate: row.boundary_date,
    canonicalRoster: row.canonical_roster,
    issueCode: row.issue_code,
    nextBoundaryDate: row.next_boundary_date,
    organizationId: row.organization_id,
    ownershipPercentTotal: canonicalizeOwnershipPercent(
      row.ownership_percent_total_text,
    ),
    ownershipRosterHash: row.ownership_roster_hash,
    propertyId: row.property_id,
    propertyOwnerIds: [...row.property_owner_ids].sort(compareText),
    setupPath: row.setup_path,
  };
}

function canonicalizeOwnershipPercent(value: string): string {
  const match = /^(?:0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error("Invalid exact ownership share returned by the database.");
  const whole = value.includes(".") ? value.slice(0, value.indexOf(".")) : value;
  return `${whole}.${(match[1] ?? "").padEnd(3, "0")}`;
}

function requestKind(value: string): OwnerOpeningRequestKind {
  if (value === "initial" || value === "correction") return value;
  throw new Error("Invalid owner-opening request kind returned by the database.");
}

function requestStatus(value: string): OwnerOpeningRequestStatus {
  if (value === "submitted" || value === "approved" || value === "rejected") {
    return value;
  }
  throw new Error("Invalid owner-opening request status returned by the database.");
}

function entryKind(value: string): OwnerOpeningEntryKind {
  if (
    value === "opening" ||
    value === "correction_reversal" ||
    value === "correction_replacement"
  ) {
    return value;
  }
  throw new Error("Invalid owner-opening entry kind returned by the database.");
}

function assertQuerySucceeded(error: unknown): void {
  if (!error) return;
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "Unknown database error";
  throw new Error(`Unable to load opening-balance authority: ${message}`);
}

function assertOrganization(
  organizationId: string,
  rows: { organization_id: string }[],
): void {
  if (rows.some((row) => row.organization_id !== organizationId)) {
    throw new Error("Cross-organization opening balance data was rejected.");
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareGroup(left: GroupIdentity, right: GroupIdentity): number {
  return compareText(groupKey(left), groupKey(right));
}

function compareRequestSemantics(
  left: OwnerOpeningRequestRecord,
  right: OwnerOpeningRequestRecord,
): number {
  const kindOrder = (value: OwnerOpeningRequestKind) => value === "correction" ? 0 : 1;
  const statusOrder = (value: OwnerOpeningRequestStatus) =>
    value === "submitted" ? 0 : value === "rejected" ? 1 : 2;
  return (
    kindOrder(left.requestKind) - kindOrder(right.requestKind) ||
    statusOrder(left.status) - statusOrder(right.status) ||
    compareText(left.sourceReference ?? "", right.sourceReference ?? "")
  );
}

function compareEntryRows(left: RawEntry, right: RawEntry): number {
  return compareText(left.created_at, right.created_at) || compareText(left.id, right.id);
}

function compareReadiness(
  left: OwnerRosterReadinessRecord,
  right: OwnerRosterReadinessRecord,
): number {
  return (
    compareText(left.propertyId, right.propertyId) ||
    compareText(left.boundaryDate, right.boundaryDate) ||
    compareText(left.issueCode, right.issueCode)
  );
}
