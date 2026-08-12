import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { inspectIpsCutoverManifest } from "./verify-ips-cutover-manifest.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = findLocalDatabaseContainer(cwd);
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const label = process.env.IPS_CUTOVER_REHEARSAL_LABEL ?? new Date().toISOString().replaceAll(/[:.]/g, "-");
const manifest = JSON.parse(
  readFileSync(new URL("./fixtures/ips-cutover-manifest.json", import.meta.url), "utf8"),
);
const manifestSql = JSON.stringify(manifest).replaceAll("'", "''");
const manualSteps = [
  "Reset disposable local Supabase",
  "Load the core guarded redacted SQL fixture",
  "Install four synthetic terminal import claims",
  "Stage the redacted manifest as the local Super Admin",
  "Commit with explicit reconciliation sign-off",
  "Verify counts, tenant balance, four owner components, hashes, and selected months",
  "Restore the guarded local baseline",
];

let evidence;
let failure;
const startedAt = performance.now();
try {
  inspectIpsCutoverManifest(manifest);
  loadBaseline();
  installSyntheticImportAuthority();
  const stage = authJson(`public.stage_ips_cutover_batch(
    '${organizationId}',
    '${manifest.authorityStartDate}',
    '${manifest.dataOwner}',
    '${manifestSql}'::jsonb,
    'ips-cutover-rehearsal-stage-${sqlText(label)}'
  )`);
  assert.equal(stage.status, "staged");
  assert.equal(stage.blocker_count, 0);

  const commit = authJson(`public.commit_ips_cutover_batch(
    '${organizationId}',
    '${stage.batch_id}',
    'Redacted source totals independently checked',
    'ips-cutover-rehearsal-commit-${sqlText(label)}'
  )`);
  assert.equal(commit.status, "reconciled");

  const authority = queryJson(`
    SELECT json_build_object(
      'batchStatus', batch.status,
      'manifestSha256', batch.manifest_sha256,
      'reconciliationSha256', reconciliation.reconciliation_sha256,
      'expectedCounts', reconciliation.expected_counts,
      'actualCounts', reconciliation.actual_counts,
      'expectedTotals', reconciliation.expected_totals,
      'actualTotals', reconciliation.actual_totals,
      'differences', reconciliation.differences,
      'selectedInvoiceCount', (
        SELECT count(*) FROM public.tenant_invoices AS invoice
        JOIN public.leases AS lease ON lease.id=invoice.lease_id
        JOIN public.units AS unit ON unit.id=lease.unit_id
        JOIN public.properties AS property ON property.id=lease.property_id
        WHERE property.code='CTR-RES' AND unit.unit_number='A-01'
          AND invoice.billing_period_start IN ('2026-07-01','2026-08-01')
      ),
      'unselectedJuneCount', (
        SELECT count(*) FROM public.tenant_invoices AS invoice
        JOIN public.leases AS lease ON lease.id=invoice.lease_id
        JOIN public.units AS unit ON unit.id=lease.unit_id
        JOIN public.properties AS property ON property.id=lease.property_id
        WHERE property.code='CTR-RES' AND unit.unit_number='A-01'
          AND invoice.billing_period_start='2026-06-01'
      ),
      'pendingIdempotency', (
        SELECT count(*) FROM app_private.financial_idempotency_requests
        WHERE organization_id='${organizationId}' AND status='pending'
          AND operation LIKE '%ips_cutover_batch'
      )
    )
    FROM public.ips_cutover_batches AS batch
    JOIN public.ips_cutover_reconciliations AS reconciliation ON reconciliation.batch_id=batch.id
    WHERE batch.id='${stage.batch_id}';
  `);
  assert.equal(authority.batchStatus, "reconciled");
  assert.deepEqual(authority.expectedCounts, authority.actualCounts);
  assert.deepEqual(authority.expectedTotals, authority.actualTotals);
  assert.deepEqual(authority.differences, []);
  assert.equal(authority.selectedInvoiceCount, 2);
  assert.equal(authority.unselectedJuneCount, 0);
  assert.equal(authority.pendingIdempotency, 0);
  assert.deepEqual(authority.actualTotals["cutover-central-a01-tenant-balance-v1"], { amount: "875.00", currency: "USD" });
  assert.deepEqual(authority.actualTotals["cutover-central-held-v1"], { amount: "1250.00", currency: "USD" });
  assert.deepEqual(authority.actualTotals["cutover-central-owner-due-v1"], { amount: "0.00", currency: "USD" });
  assert.deepEqual(authority.actualTotals["cutover-central-ips-due-v1"], { amount: "240.50", currency: "USD" });
  assert.deepEqual(authority.actualTotals["cutover-central-deposit-v1"], { amount: "800.00", currency: "USD" });

  evidence = {
    ...authority,
    authorityStartDate: manifest.authorityStartDate,
    dataOwner: manifest.dataOwner,
    durationMs: Math.round(performance.now() - startedAt),
    label,
    manualSteps,
  };
  const artifactDirectory = path.join(cwd, "artifacts", "ips-cutover-rehearsal");
  mkdirSync(artifactDirectory, { recursive: true });
  const outputPath = path.join(artifactDirectory, `${label}.json`);
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`PASS IPS cutover rehearsal ${label}\n${outputPath}\n${JSON.stringify(evidence)}\n`);
} catch (error) {
  failure = error;
} finally {
  try {
    loadBaseline();
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else process.stderr.write(`Cutover rehearsal cleanup also failed: ${cleanupError}\n`);
  }
}
if (failure) throw failure;

function installSyntheticImportAuthority() {
  runSql(`
    ALTER TABLE public.import_runs DISABLE TRIGGER USER;
    INSERT INTO public.import_runs (
      id, organization_id, import_type, status, source_file_name, source_file_size,
      source_mime_type, headers, mapping, total_rows, ready_rows, warning_rows,
      error_rows, created_count, updated_count, failed_count, skipped_count,
      committed_at, source_claim_hash, snapshot_hash
    ) VALUES
      ('91000000-0000-4000-8000-000000000001','${organizationId}','properties','committed','redacted-properties.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('1',64),repeat('a',64)),
      ('91000000-0000-4000-8000-000000000002','${organizationId}','units','committed','redacted-units.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('2',64),repeat('b',64)),
      ('91000000-0000-4000-8000-000000000003','${organizationId}','people','committed','redacted-people.csv',1,'text/csv','[]','{}',2,2,0,0,2,0,0,0,now(),repeat('3',64),repeat('c',64)),
      ('91000000-0000-4000-8000-000000000004','${organizationId}','leases','committed','redacted-leases.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('4',64),repeat('d',64));
    ALTER TABLE public.import_runs ENABLE TRIGGER USER;
  `);
}

function authJson(expression) {
  return queryJson(`
    BEGIN;
    SELECT pg_catalog.set_config('request.jwt.claim.sub','${superAdminId}',true);
    SET LOCAL ROLE authenticated;
    SELECT (${expression})::text;
    COMMIT;
  `);
}

function queryJson(sql) {
  const lines = runSql(sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const json = [...lines].reverse().find((line) => line.startsWith("{") || line.startsWith("["));
  assert.ok(json, `query returned no JSON: ${lines.join(" | ")}`);
  return JSON.parse(json);
}

function runSql(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { cwd, encoding: "utf8", input: sql, shell: false },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function loadBaseline() {
  runNpm("db:reset");
  const fixtureSql = readFileSync(path.join(cwd, "supabase", "test-fixtures", "baseline.sql"), "utf8");
  runSql(fixtureSql);
}

function runNpm(script, attempts = 1) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const npmCli = process.env.npm_execpath;
    result = npmCli
      ? spawnSync(process.execPath, [npmCli, "run", script], { cwd, encoding: "utf8", shell: false, timeout: 180_000 })
      : spawnSync("npm", ["run", script], { cwd, encoding: "utf8", shell: false, timeout: 180_000 });
    if (result.status === 0) return;
    if (attempt < attempts) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
    }
  }
  assert.equal(result?.status, 0, result?.stderr || result?.stdout);
}

function sqlText(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}
