import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(
  scriptDirectory,
  "fixtures",
  "owner-opening-balances.json",
);

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function semanticReport(report) {
  const requestSources = new Map(
    (report.requests ?? []).map((row) => [row.id, row.sourceReference]),
  );
  const entryKeys = new Map(
    (report.entries ?? []).map((row) => [row.id, row.entryKey]),
  );
  const normalize = (value, key = "") => {
    if (Array.isArray(value)) return value.map((item) => normalize(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([childKey]) => ![
            "id",
            "requestId",
            "financialIdempotencyRequestId",
            "payloadHash",
            "expectedPayloadHash",
          ].includes(childKey))
          .map(([childKey, childValue]) => {
            if (childKey === "effectiveDate") return [childKey, "CURRENT_MONTH"];
            if (childKey === "correctionOfEntryId" || childKey === "reversalOfEntryId") {
              return [childKey.replace(/Id$/, "Key"), childValue ? entryKeys.get(childValue) ?? childValue : null];
            }
            if (childKey === "resubmissionOfRequestId") {
              return ["resubmissionOfRequestSource", childValue ? requestSources.get(childValue) ?? childValue : null];
            }
            return [childKey, normalize(childValue, childKey)];
          }),
      );
    }
    return key === "effectiveDate" ? "CURRENT_MONTH" : value;
  };
  return normalize(report);
}

export function reportSha256(report) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(semanticReport(report))))
    .digest("hex");
}

export function assertCurrentMonthDates(report, expectedCurrentMonth) {
  assert.match(expectedCurrentMonth, /^\d{4}-\d{2}-01$/);
  assert.equal(report.effectiveDate, expectedCurrentMonth, "report effective date must equal the current business month");
  for (const [collection, rows] of [
    ["request", report.requests ?? []],
    ["entry", report.entries ?? []],
    ["authority", report.authority ?? []],
  ]) {
    for (const row of rows) {
      assert.equal(
        row.effectiveDate,
        expectedCurrentMonth,
        `${collection} effective date must equal the current business month`,
      );
    }
  }
}

function exactRows(actual, expected, naturalKey, collectionName) {
  assert.deepEqual(
    actual.map((row) => row[naturalKey]).sort(),
    expected.map((row) => row[naturalKey]).sort(),
    `${collectionName} natural keys changed`,
  );
  const expectedByKey = new Map(expected.map((row) => [row[naturalKey], row]));
  for (const row of actual) {
    const oracle = expectedByKey.get(row[naturalKey]);
    assert.ok(oracle, `unexpected ${collectionName} row ${row[naturalKey]}`);
    for (const [key, value] of Object.entries(oracle)) {
      assert.deepEqual(row[key], value, `${collectionName} ${row[naturalKey]} ${key} changed`);
    }
  }
}

export function validateReport(
  report,
  manifest,
  { expectedCurrentMonth = report.effectiveDate } = {},
) {
  assert.equal(report.organizationId, manifest.organizationId);
  assert.equal(report.propertyId, manifest.propertyId);
  assert.equal(report.ownerPersonId, manifest.ownerPersonId);
  assert.equal(report.propertyOwnerId, manifest.propertyOwnerId);
  assert.equal(report.currency, manifest.currency);
  assert.equal(manifest.effectiveMonth, "CURRENT_MONTH");
  assertCurrentMonthDates(report, expectedCurrentMonth);
  assert.equal(report.requests.length, manifest.expected.requestCount);
  assert.equal(report.entries.length, manifest.expected.entryCount);
  assert.equal(report.idempotency.length, manifest.expected.transitionCount);
  assert.equal(report.activity.length, manifest.expected.transitionCount);
  assert.deepEqual(report.statuses, manifest.expected.requestStatuses);
  assert.deepEqual(
    report.authority.map((row) => ({
      amount: row.amount,
      component: row.component,
    })),
    manifest.authority,
  );
  assert.equal(report.documentReferences, 0);
  assert.equal(report.storageObjects, 0);

  assert.equal(
    report.requests.filter((request) => request.predecessorSource !== null)
      .length,
    2,
  );
  assert.equal(
    report.entries.filter(
      (entry) =>
        entry.component === "owner_due_to_ips" &&
        entry.amount === "0.00" &&
        ["correction_reversal", "correction_replacement"].includes(
          entry.kind,
        ),
    ).length,
    2,
  );
  exactRows(report.requests, manifest.requests, "sourceReference", "request");
  exactRows(report.entries, manifest.entries, "entryKey", "entry");
  exactRows(report.idempotency, manifest.transitions, "key", "idempotency");
  exactRows(report.activity, manifest.transitions, "key", "activity");

  for (const request of report.requests) {
    assert.match(request.payloadHash, /^[0-9a-f]{64}$/);
    assert.equal(
      request.payloadHash,
      request.expectedPayloadHash,
      `request ${request.sourceReference} payload hash is not its canonical public payload`,
    );
  }
  const idempotencyByKey = new Map(report.idempotency.map((row) => [row.key, row]));
  for (const activity of report.activity) {
    const idempotency = idempotencyByKey.get(activity.key);
    assert.ok(idempotency, `activity ${activity.key} has no idempotency row`);
    assert.equal(idempotency.payloadHash, idempotency.expectedPayloadHash, `idempotency ${activity.key} payload hash changed`);
    assert.equal(activity.payloadHash, idempotency.payloadHash, `activity ${activity.key} payload hash does not match idempotency`);
    assert.equal(activity.financialIdempotencyRequestId, idempotency.id, `activity ${activity.key} points at the wrong idempotency row`);
    assert.equal(activity.source, "checked_rpc");
  }
}

function localDatabaseContainer() {
  if (process.env.SUPABASE_DB_CONTAINER) return process.env.SUPABASE_DB_CONTAINER;
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error("Could not inspect local database containers");
  const names = result.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  const preferred = `supabase_db_${path.basename(cwd)}`;
  if (names.includes(preferred)) return preferred;
  if (names.length === 1) return names[0];
  throw new Error("Set SUPABASE_DB_CONTAINER to one local test database container");
}

export function queryReport() {
  const sql = String.raw`
WITH fixture_request_links AS (
  SELECT request.*,
         predecessor.source_reference AS predecessor_source,
         target_request.source_reference AS target_source,
         CASE WHEN target_entry.id IS NULL THEN NULL
           ELSE target_request.source_reference || ':' || target_entry.entry_kind::text END AS target_entry_key
  FROM public.owner_opening_balance_requests AS request
  LEFT JOIN public.owner_opening_balance_requests AS predecessor
    ON predecessor.id = request.resubmission_of_request_id
  LEFT JOIN public.owner_opening_balance_entries AS target_entry
    ON target_entry.id = request.correction_of_entry_id
  LEFT JOIN public.owner_opening_balance_requests AS target_request
    ON target_request.id = target_entry.request_id
  WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
    AND request.property_id = '10000000-0000-0000-0000-000000000001'
), fixture_requests AS (
  SELECT request.*,
    app_private.canonical_financial_payload_hash(
      CASE WHEN request.request_kind = 'initial' THEN jsonb_build_object(
        'organization_id', request.organization_id::text,
        'property_id', request.property_id::text,
        'owner_person_id', request.owner_person_id::text,
        'currency', request.currency::text,
        'effective_date', request.effective_date::text,
        'component', request.component::text,
        'amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
        'reason', request.reason,
        'source_reference', request.source_reference,
        'supporting_document_id', request.supporting_document_id::text,
        'evidence_sha256', request.evidence_sha256,
        'resubmission_of_request_id', request.resubmission_of_request_id::text
      ) ELSE jsonb_build_object(
        'organization_id', request.organization_id::text,
        'entry_id', request.correction_of_entry_id::text,
        'replacement_amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
        'reason', request.reason,
        'source_reference', request.source_reference,
        'supporting_document_id', request.supporting_document_id::text,
        'evidence_sha256', request.evidence_sha256,
        'resubmission_of_request_id', request.resubmission_of_request_id::text
      ) END
    ) AS expected_payload_hash,
    app_private.canonical_financial_payload_hash(
      CASE WHEN request.request_kind = 'initial' THEN jsonb_build_object(
        'organization_id', request.organization_id::text,
        'property_id', request.property_id::text,
        'owner_person_id', request.owner_person_id::text,
        'currency', request.currency::text,
        'effective_date', 'CURRENT_MONTH',
        'component', request.component::text,
        'amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
        'reason', request.reason,
        'source_reference', request.source_reference,
        'supporting_document_id', NULL,
        'evidence_sha256', request.evidence_sha256,
        'resubmission_of_request_id', request.predecessor_source
      ) ELSE jsonb_build_object(
        'organization_id', request.organization_id::text,
        'entry_id', request.target_entry_key,
        'replacement_amount', to_char(request.proposed_amount, 'FM9999999999990.00'),
        'reason', request.reason,
        'source_reference', request.source_reference,
        'supporting_document_id', NULL,
        'evidence_sha256', request.evidence_sha256,
        'resubmission_of_request_id', request.predecessor_source
      ) END
    ) AS canonical_payload_sha256
  FROM fixture_request_links AS request
), fixture_entries AS (
  SELECT entry.*, request.source_reference,
         request.source_reference || ':' || entry.entry_kind::text AS entry_key,
         reversed_request.source_reference AS reversal_target_source,
         CASE WHEN reversed.id IS NULL THEN NULL
           ELSE reversed_request.source_reference || ':' || reversed.entry_kind::text END AS reversal_target_entry_key
  FROM public.owner_opening_balance_entries AS entry
  JOIN public.owner_opening_balance_requests AS request ON request.id = entry.request_id
  LEFT JOIN public.owner_opening_balance_entries AS reversed ON reversed.id = entry.reversal_of_entry_id
  LEFT JOIN public.owner_opening_balance_requests AS reversed_request ON reversed_request.id = reversed.request_id
  WHERE entry.organization_id = '00000000-0000-0000-0000-000000000001'
    AND entry.property_id = '10000000-0000-0000-0000-000000000001'
), fixture_transitions AS (
  SELECT idem.id, idem.idempotency_key, idem.operation, idem.actor_id,
         idem.payload_hash, idem.status, activity.action, activity.entity_id,
         activity.actor_id AS activity_actor_id, activity.new_values,
         request.source_reference AS request_source,
         CASE WHEN idem.operation = 'review_owner_opening_balance' THEN
           app_private.canonical_financial_payload_hash(jsonb_build_object(
             'organization_id', idem.organization_id::text,
             'request_id', request.id::text,
             'decision', CASE activity.action WHEN 'approved' THEN 'approve' ELSE 'reject' END,
             'review_reason', request.review_reason
           ))
         ELSE request.expected_payload_hash END AS expected_payload_hash,
         CASE WHEN idem.operation = 'review_owner_opening_balance' THEN
           app_private.canonical_financial_payload_hash(jsonb_build_object(
             'organization_id', idem.organization_id::text,
             'request_id', request.source_reference,
             'decision', CASE activity.action WHEN 'approved' THEN 'approve' ELSE 'reject' END,
             'review_reason', request.review_reason
           ))
         ELSE request.canonical_payload_sha256 END AS canonical_payload_sha256
  FROM app_private.financial_idempotency_requests AS idem
  LEFT JOIN public.activity_logs AS activity
    ON activity.new_values->>'financial_idempotency_request_id' = idem.id::text
   AND activity.entity_type = 'owner_opening_balance_request'
  LEFT JOIN fixture_requests AS request ON request.id = activity.entity_id
  WHERE idem.organization_id = '00000000-0000-0000-0000-000000000001'
    AND idem.operation IN ('submit_owner_opening_balance', 'review_owner_opening_balance', 'submit_owner_opening_balance_correction')
)
SELECT json_build_object(
  'organizationId', '00000000-0000-0000-0000-000000000001',
  'propertyId', '10000000-0000-0000-0000-000000000001',
  'ownerPersonId', '80000000-0000-0000-0000-000000000004',
  'propertyOwnerId', '90000000-0000-0000-0000-000000000001',
  'currency', 'USD',
  'effectiveDate', to_char(date_trunc('month', current_date), 'YYYY-MM-DD'),
  'statuses', (SELECT json_object_agg(status, count) FROM (SELECT status, count(*)::int AS count FROM fixture_requests GROUP BY status) s),
  'authority', (SELECT json_agg(json_build_object('component', component, 'amount', to_char(current_amount, 'FM9999999999990.00'), 'effectiveDate', effective_date::text) ORDER BY component) FROM public.owner_opening_balance_known_authority_v1 WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND property_id = '10000000-0000-0000-0000-000000000001'),
  'requests', (SELECT json_agg(json_build_object(
    'id', id,
    'sourceReference', source_reference, 'component', component, 'kind', request_kind,
    'amount', to_char(proposed_amount, 'FM9999999999990.00'), 'status', status,
    'effectiveDate', effective_date::text,
    'predecessorSource', predecessor_source, 'targetSource', target_source,
    'correctionOfEntryId', correction_of_entry_id,
    'resubmissionOfRequestId', resubmission_of_request_id,
    'targetEntryKey', target_entry_key,
    'evidenceSha256', evidence_sha256, 'payloadHash', payload_hash,
    'expectedPayloadHash', expected_payload_hash,
    'canonicalPayloadSha256', canonical_payload_sha256,
    'propertyOwnerId', property_owner_id,
    'ownershipPercent', to_char(ownership_percent_snapshot, 'FM990.000'),
    'ownershipRosterHash', ownership_roster_hash,
    'supportingDocumentId', supporting_document_id,
    'submittedBy', submitted_by, 'reviewedBy', reviewed_by,
    'reason', reason, 'reviewReason', review_reason
  ) ORDER BY source_reference) FROM fixture_requests),
  'entries', (SELECT json_agg(json_build_object(
    'id', id, 'requestId', request_id, 'entryKey', entry_key,
    'sourceReference', source_reference, 'component', component, 'kind', entry_kind,
    'amount', to_char(signed_amount, 'FM9999999999990.00'),
    'effectiveDate', effective_date::text,
    'reversalTargetSource', reversal_target_source,
    'reversalOfEntryId', reversal_of_entry_id,
    'reversalTargetEntryKey', reversal_target_entry_key,
    'propertyOwnerId', property_owner_id,
    'ownershipPercent', to_char(ownership_percent_snapshot, 'FM990.000'),
    'ownershipRosterHash', ownership_roster_hash
  ) ORDER BY source_reference, entry_kind) FROM fixture_entries),
  'idempotency', (SELECT json_agg(json_build_object(
    'id', id, 'operation', operation, 'key', idempotency_key, 'actorId', actor_id,
    'requestSource', request_source, 'action', action,
    'payloadHash', payload_hash, 'expectedPayloadHash', expected_payload_hash,
    'canonicalPayloadSha256', canonical_payload_sha256, 'status', status
  ) ORDER BY idempotency_key) FROM fixture_transitions),
  'activity', (SELECT json_agg(json_build_object(
    'key', idempotency_key, 'operation', operation, 'requestSource', request_source,
    'action', action, 'actorId', activity_actor_id,
    'payloadHash', new_values->>'payload_hash',
    'canonicalPayloadSha256', canonical_payload_sha256,
    'financialIdempotencyRequestId', new_values->>'financial_idempotency_request_id',
    'source', new_values->>'source'
  ) ORDER BY idempotency_key) FROM fixture_transitions),
  'documentReferences', (SELECT count(*)::int FROM fixture_requests WHERE supporting_document_id IS NOT NULL),
  'storageObjects', (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'nestory-documents' AND name LIKE '00000000-0000-0000-0000-000000000001/%owner-opening%')
)::text;`;
  const result = spawnSync(
    "docker",
    ["exec", localDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Fixture reconciliation query failed");
  return JSON.parse(result.stdout.trim());
}

export async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const report = queryReport();
  validateReport(report, manifest);
  const actualHash = reportSha256(report);
  if (process.argv.includes("--print-report-hash")) {
    process.stdout.write(`${actualHash}\n`);
    return;
  }
  assert.equal(actualHash, manifest.reportSha256, "fixture report hash changed");
  process.stdout.write(`Owner-opening fixture reconciled: ${actualHash}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
