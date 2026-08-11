import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import test, { after, beforeEach } from "node:test";
import { performance } from "node:perf_hooks";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const manifest = JSON.parse(
  readFileSync(new URL("./fixtures/ips-cutover-manifest.json", import.meta.url), "utf8"),
);
const dockerNames = spawnSync(
  "docker",
  ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
  { encoding: "utf8", shell: false },
).stdout.trim().split(/\r?\n/).filter(Boolean);
const container = selectLocalDatabaseContainer(repoRoot, dockerNames, {
  expectedContainerName: "supabase_db_nestory",
});

function run(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { cwd: repoRoot, encoding: "utf8", input: sql, shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function spawnSession(sql) {
  const child = spawn(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { cwd: repoRoot, shell: false, stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(sql);
  const startedAt = performance.now();
  return {
    child,
    done: new Promise((resolve) => {
      child.on("close", (status) => resolve({
        durationMs: performance.now() - startedAt,
        status,
        stderr,
        stdout,
      }));
    }),
    get stderr() { return stderr; },
  };
}

async function waitForMarker(session, marker, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (session.stderr.includes(marker)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${marker}: ${session.stderr}`);
}

async function waitForDatabaseLock(applicationName, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const wait = run(`
      SELECT coalesce(wait_event_type, '') || '|' || coalesce(wait_event, '')
      FROM pg_catalog.pg_stat_activity
      WHERE application_name = '${applicationName}' AND state <> 'idle';
    `);
    if (wait.startsWith("Lock|")) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`${applicationName} did not reach a database lock wait`);
}

function reloadFixture() {
  const result = spawnSync(process.execPath, ["scripts/load-test-fixture.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
}

function installPauseHarness() {
  run(`
    CREATE OR REPLACE FUNCTION app_private.pause_ips_cutover_test()
    RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
    DECLARE v_pause text := current_setting('app.ips_cutover_test_pause', true);
    BEGIN
      IF v_pause = 'reconciliation_insert' AND TG_TABLE_NAME = 'ips_cutover_reconciliations' THEN
        RAISE NOTICE 'ips_cutover_reconciliation_paused';
        PERFORM pg_catalog.pg_sleep(3);
      ELSIF v_pause = 'invoice_insert' AND TG_TABLE_NAME = 'tenant_invoices' THEN
        RAISE NOTICE 'ips_cutover_invoice_paused';
        PERFORM pg_catalog.pg_sleep(3);
      END IF;
      RETURN NEW;
    END;
    $function$;
    DROP TRIGGER IF EXISTS pause_ips_cutover_reconciliation ON public.ips_cutover_reconciliations;
    CREATE TRIGGER pause_ips_cutover_reconciliation BEFORE INSERT ON public.ips_cutover_reconciliations
      FOR EACH ROW EXECUTE FUNCTION app_private.pause_ips_cutover_test();
    DROP TRIGGER IF EXISTS pause_ips_cutover_invoice ON public.tenant_invoices;
    CREATE TRIGGER pause_ips_cutover_invoice BEFORE INSERT ON public.tenant_invoices
      FOR EACH ROW EXECUTE FUNCTION app_private.pause_ips_cutover_test();
  `);
}

function removePauseHarness() {
  run(`
    DROP TRIGGER IF EXISTS pause_ips_cutover_reconciliation ON public.ips_cutover_reconciliations;
    DROP TRIGGER IF EXISTS pause_ips_cutover_invoice ON public.tenant_invoices;
    DROP FUNCTION IF EXISTS app_private.pause_ips_cutover_test();
  `);
}

function installSyntheticImportAuthority() {
  run(`
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

function stageBatch(suffix) {
  const manifestSql = JSON.stringify(manifest).replaceAll("'", "''");
  const output = run(`
    BEGIN;
    SELECT pg_catalog.set_config('request.jwt.claim.sub','${superAdminId}',true);
    SET LOCAL ROLE authenticated;
    SELECT public.stage_ips_cutover_batch(
      '${organizationId}','2026-09-01','REDACTED-IPS-DATA-OWNER',
      '${manifestSql}'::jsonb,'cutover-concurrency-stage-${suffix}'
    )->>'batch_id';
    COMMIT;
  `).split(/\r?\n/).filter(Boolean);
  return output.at(-2) ?? output.at(-1);
}

function commitSql(batchId, key, { pause = "", applicationName = "" } = {}) {
  return `BEGIN;
    SET LOCAL statement_timeout='20s';
    ${applicationName ? `SET LOCAL application_name='${applicationName}';` : ""}
    SELECT pg_catalog.set_config('request.jwt.claim.sub','${superAdminId}',true);
    ${pause ? `SELECT pg_catalog.set_config('app.ips_cutover_test_pause','${pause}',true);` : ""}
    SET LOCAL ROLE authenticated;
    SELECT public.commit_ips_cutover_batch(
      '${organizationId}','${batchId}',
      'Redacted source totals independently checked','${key}'
    );
    COMMIT;`;
}

function generatorSql(leaseId, { pause = "", applicationName = "" } = {}) {
  return `BEGIN;
    SET LOCAL statement_timeout='20s';
    ${applicationName ? `SET LOCAL application_name='${applicationName}';` : ""}
    ${pause ? `SELECT pg_catalog.set_config('app.ips_cutover_test_pause','${pause}',true);` : ""}
    SELECT app_private.generate_lease_rent_invoice(
      '${organizationId}','${leaseId}','2026-07-01','2026-07-01',
      'manual_recovery','${superAdminId}'
    );
    COMMIT;`;
}

function assertFinalState(batchId) {
  assert.equal(
    run(`
      SELECT batch.status || '|' || count(DISTINCT reconciliation.id)::text || '|' ||
        count(DISTINCT invoice.id)::text || '|' ||
        to_char(sum(DISTINCT balance.balance_due),'FM999999999990.00') || '|' ||
        (SELECT count(*) FROM app_private.financial_idempotency_requests WHERE status='pending' AND operation LIKE '%ips_cutover_batch')::text
      FROM public.ips_cutover_batches AS batch
      JOIN public.ips_cutover_reconciliations AS reconciliation ON reconciliation.batch_id=batch.id
      JOIN public.leases AS lease ON lease.organization_id=batch.organization_id
      JOIN public.units AS unit ON unit.id=lease.unit_id
      JOIN public.properties AS property ON property.id=lease.property_id
      JOIN public.tenant_invoices AS invoice ON invoice.lease_id=lease.id AND invoice.billing_period_start IN ('2026-07-01','2026-08-01')
      JOIN public.tenant_invoice_balances AS balance ON balance.id=invoice.id
      WHERE batch.id='${batchId}' AND property.code='CTR-RES' AND unit.unit_number='A-01'
      GROUP BY batch.status;
    `),
    "reconciled|1|2|875.00|0",
  );
}

beforeEach(() => {
  reloadFixture();
  installSyntheticImportAuthority();
  installPauseHarness();
});

after(() => {
  removePauseHarness();
  reloadFixture();
});

test("concurrent exact cutover commits serialize and replay one reconciliation", async () => {
  const batchId = stageBatch("replay");
  const first = spawnSession(commitSql(batchId, "cutover-concurrency-commit-replay", { pause: "reconciliation_insert" }));
  await waitForMarker(first, "ips_cutover_reconciliation_paused");
  const second = spawnSession(commitSql(batchId, "cutover-concurrency-commit-replay", { applicationName: "ips-cutover-replay-second" }));
  await waitForDatabaseLock("ips-cutover-replay-second");
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.ok(secondResult.durationMs >= 1500, `second commit waited ${secondResult.durationMs}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /deadlock detected|40P01/i);
  assertFinalState(batchId);
});

test("historical generation first makes cutover wait and reuse one selected invoice", async () => {
  const batchId = stageBatch("generation-first");
  const leaseId = run(`SELECT lease.id FROM public.leases lease JOIN public.units unit ON unit.id=lease.unit_id JOIN public.properties property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01';`);
  const generator = spawnSession(generatorSql(leaseId, { pause: "invoice_insert" }));
  await waitForMarker(generator, "ips_cutover_invoice_paused");
  const commit = spawnSession(commitSql(batchId, "cutover-concurrency-generation-first", { applicationName: "ips-cutover-generation-first-commit" }));
  await waitForDatabaseLock("ips-cutover-generation-first-commit");
  const [generatorResult, commitResult] = await Promise.all([generator.done, commit.done]);
  assert.equal(generatorResult.status, 0, generatorResult.stderr);
  assert.equal(commitResult.status, 0, commitResult.stderr);
  assert.ok(commitResult.durationMs >= 1500, `cutover waited ${commitResult.durationMs}ms`);
  assert.doesNotMatch(`${generatorResult.stderr}\n${commitResult.stderr}`, /deadlock detected|40P01/i);
  assertFinalState(batchId);
});

test("cutover generation first makes a duplicate historical generator wait and replay", async () => {
  const batchId = stageBatch("cutover-first");
  const leaseId = run(`SELECT lease.id FROM public.leases lease JOIN public.units unit ON unit.id=lease.unit_id JOIN public.properties property ON property.id=lease.property_id WHERE property.code='CTR-RES' AND unit.unit_number='A-01';`);
  const commit = spawnSession(commitSql(batchId, "cutover-concurrency-cutover-first", { pause: "reconciliation_insert" }));
  await waitForMarker(commit, "ips_cutover_reconciliation_paused");
  const generator = spawnSession(generatorSql(leaseId, { applicationName: "ips-cutover-generator-second" }));
  await waitForDatabaseLock("ips-cutover-generator-second");
  const [commitResult, generatorResult] = await Promise.all([commit.done, generator.done]);
  assert.equal(commitResult.status, 0, commitResult.stderr);
  assert.equal(generatorResult.status, 0, generatorResult.stderr);
  assert.ok(generatorResult.durationMs >= 1500, `generator waited ${generatorResult.durationMs}ms`);
  assert.doesNotMatch(`${generatorResult.stderr}\n${commitResult.stderr}`, /deadlock detected|40P01/i);
  assertFinalState(batchId);
});
