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

export function reportSha256(report) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(report)))
    .digest("hex");
}

export function validateReport(report, manifest) {
  assert.equal(report.organizationId, manifest.organizationId);
  assert.equal(report.propertyId, manifest.propertyId);
  assert.equal(report.ownerPersonId, manifest.ownerPersonId);
  assert.equal(report.propertyOwnerId, manifest.propertyOwnerId);
  assert.equal(report.currency, manifest.currency);
  assert.equal(report.ownershipPercent, "100.000");
  assert.match(report.ownershipRosterHash, /^[0-9a-f]{64}$/);
  assert.equal(report.requests.length, manifest.expected.requestCount);
  assert.equal(report.entries.length, manifest.expected.entryCount);
  assert.equal(report.idempotency.length, manifest.expected.transitionCount);
  assert.equal(report.activity.length, manifest.expected.transitionCount);
  assert.deepEqual(report.statuses, manifest.expected.requestStatuses);
  assert.deepEqual(report.authority, manifest.authority);
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
  assert.ok(
    report.requests.every(
      (request) =>
        /^[0-9a-f]{64}$/.test(request.evidenceSha256) &&
        request.payloadHashValid === true &&
        request.ownershipRosterHash === report.ownershipRosterHash &&
        request.ownershipPercent === "100.000" &&
        request.supportingDocumentId === null,
    ),
  );
  assert.ok(
    report.idempotency.every(
      (row) => row.status === "completed" && row.payloadHashValid === true,
    ),
  );
  assert.ok(
    report.activity.every(
      (row) => row.source === "checked_rpc" && row.payloadHashValid === true,
    ),
  );
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
WITH fixture_requests AS (
  SELECT request.*,
         predecessor.source_reference AS predecessor_source,
         target_request.source_reference AS target_source
  FROM public.owner_opening_balance_requests AS request
  LEFT JOIN public.owner_opening_balance_requests AS predecessor
    ON predecessor.id = request.resubmission_of_request_id
  LEFT JOIN public.owner_opening_balance_entries AS target_entry
    ON target_entry.id = request.correction_of_entry_id
  LEFT JOIN public.owner_opening_balance_requests AS target_request
    ON target_request.id = target_entry.request_id
  WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
    AND request.property_id = '10000000-0000-0000-0000-000000000001'
), fixture_entries AS (
  SELECT entry.*, request.source_reference,
         reversed_request.source_reference AS reversal_target_source
  FROM public.owner_opening_balance_entries AS entry
  JOIN public.owner_opening_balance_requests AS request ON request.id = entry.request_id
  LEFT JOIN public.owner_opening_balance_entries AS reversed ON reversed.id = entry.reversal_of_entry_id
  LEFT JOIN public.owner_opening_balance_requests AS reversed_request ON reversed_request.id = reversed.request_id
  WHERE entry.organization_id = '00000000-0000-0000-0000-000000000001'
    AND entry.property_id = '10000000-0000-0000-0000-000000000001'
)
SELECT json_build_object(
  'organizationId', '00000000-0000-0000-0000-000000000001',
  'propertyId', '10000000-0000-0000-0000-000000000001',
  'ownerPersonId', '80000000-0000-0000-0000-000000000004',
  'propertyOwnerId', (SELECT property_owner_id FROM fixture_requests LIMIT 1),
  'currency', 'USD',
  'effectiveDate', to_char(date_trunc('month', current_date), 'YYYY-MM-DD'),
  'ownershipPercent', (SELECT to_char(ownership_percent_snapshot, 'FM990.000') FROM fixture_requests LIMIT 1),
  'ownershipRosterHash', (SELECT ownership_roster_hash FROM fixture_requests LIMIT 1),
  'statuses', (SELECT json_object_agg(status, count) FROM (SELECT status, count(*)::int AS count FROM fixture_requests GROUP BY status) s),
  'authority', (SELECT json_agg(json_build_object('component', component, 'amount', to_char(current_amount, 'FM9999999999990.00')) ORDER BY component) FROM public.owner_opening_balance_known_authority_v1 WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND property_id = '10000000-0000-0000-0000-000000000001'),
  'requests', (SELECT json_agg(json_build_object(
    'sourceReference', source_reference, 'component', component, 'kind', request_kind,
    'amount', to_char(proposed_amount, 'FM9999999999990.00'), 'status', status,
    'predecessorSource', predecessor_source, 'targetSource', target_source,
    'evidenceSha256', evidence_sha256, 'payloadHashValid', payload_hash ~ '^[0-9a-f]{64}$',
    'ownershipPercent', to_char(ownership_percent_snapshot, 'FM990.000'),
    'ownershipRosterHash', ownership_roster_hash,
    'supportingDocumentId', supporting_document_id,
    'submittedBy', submitted_by, 'reviewedBy', reviewed_by
  ) ORDER BY source_reference) FROM fixture_requests),
  'entries', (SELECT json_agg(json_build_object(
    'sourceReference', source_reference, 'component', component, 'kind', entry_kind,
    'amount', to_char(signed_amount, 'FM9999999999990.00'),
    'reversalTargetSource', reversal_target_source,
    'ownershipPercent', to_char(ownership_percent_snapshot, 'FM990.000'),
    'ownershipRosterHash', ownership_roster_hash
  ) ORDER BY source_reference, entry_kind) FROM fixture_entries),
  'idempotency', (SELECT json_agg(json_build_object(
    'operation', operation, 'key', idempotency_key, 'actorId', actor_id,
    'payloadHashValid', payload_hash ~ '^[0-9a-f]{64}$', 'status', status
  ) ORDER BY idempotency_key) FROM app_private.financial_idempotency_requests
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND operation IN ('submit_owner_opening_balance', 'review_owner_opening_balance', 'submit_owner_opening_balance_correction')),
  'activity', (SELECT json_agg(json_build_object(
    'action', action, 'operation', new_values->>'operation',
    'payloadHashValid', (new_values->>'payload_hash') ~ '^[0-9a-f]{64}$',
    'source', new_values->>'source'
  ) ORDER BY new_values->>'operation', action, entity_id) FROM public.activity_logs
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND entity_type = 'owner_opening_balance_request'),
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
