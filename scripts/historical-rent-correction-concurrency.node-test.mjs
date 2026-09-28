import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "a1000000-0000-0000-0000-000000000001";
const superAdminId = "a1000000-0000-0000-0000-000000000101";

function databaseContainer() {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return selectLocalDatabaseContainer(
    repoRoot,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

const container = databaseContainer();

function psqlArgs(sql) {
  return [
    "exec",
    container,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ];
}

function run(sql) {
  const result = spawnSync("docker", psqlArgs(sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function spawnSession(sql) {
  const child = spawn("docker", psqlArgs(sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  const session = { child, stdout: "", stderr: "", status: null, closed: false };
  child.stdout.on("data", (chunk) => { session.stdout += chunk; });
  child.stderr.on("data", (chunk) => { session.stderr += chunk; });
  session.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      session.status = status;
      session.closed = true;
      resolve(session);
    });
  });
  return session;
}

async function waitForMarker(session, marker, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (`${session.stdout}\n${session.stderr}`.includes(marker)) return;
    if (session.closed) {
      assert.fail(`session closed before ${marker}: ${session.stdout}\n${session.stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${marker}: ${session.stdout}\n${session.stderr}`);
}

async function waitForDatabaseLock(applicationName, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const wait = run(`
      SELECT coalesce(activity.wait_event_type, '') || '|' ||
        coalesce(activity.wait_event, '')
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.application_name = '${applicationName}'
        AND activity.state <> 'idle';
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
    timeout: 40_000,
  });
  assert.equal(result.status, 0, result.stderr);
}


function setupCase() {
  // Reuse the independently reviewed disposable fixture, before its first
  // assertion or settlement. The fixture and its RPC assertions stay in one source.
  const fixture = readFileSync(path.join(repoRoot,
    "supabase/tests/historical_rent_correction_execution_test.sql"), "utf8")
    .split("SELECT lives_ok($$SELECT public.preview_historical_rent_correction(")[0]
    .replace("SELECT no_plan();", "");
  const output = run(fixture + `
    SELECT jsonb_build_object(
      'invoiceId',c.invoice_id,
      'leaseId',state.good_lease_id, 'termId',state.good_term_id,
      'previewHash',public.preview_historical_rent_correction(
        state.organization_id,c.invoice_id,1200,10)->>'previewHash'
    ) FROM historical_cases c CROSS JOIN lease_rent_state state
    WHERE c.name='unpaid-increase';
    COMMIT;`);
  const row = output.split(/\r?\n/).findLast((line) => line.startsWith("{"));
  assert.ok(row, "fixture must return its exact invoice and preview");
  return JSON.parse(row);
}

function correctionSql(scope, key, applicationName, pause) {
  assert.match(scope.invoiceId, /^[0-9a-f-]{36}$/);
  assert.match(scope.previewHash, /^[0-9a-f]{64}$/);
  assert.match(key, /^[a-z-]+$/);
  assert.match(applicationName, /^[a-z-]+$/);
  return `BEGIN;
    SET LOCAL statement_timeout='15s';
    SET LOCAL application_name='${applicationName}';
    SELECT set_config('request.jwt.claim.sub','${superAdminId}',true);
    SELECT set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    SELECT public.correct_historical_rent('${organizationId}','${scope.invoiceId}',
      1200,10,'Verified signed historical lease evidence','${scope.previewHash}','${key}');
    ${pause ? "DO $ready$ BEGIN RAISE NOTICE 'historical_rent_race_ready'; END $ready$; SELECT pg_sleep(2);" : ""}
    COMMIT;`;
}

function correctionResult(session) {
  const row = session.stdout.split(/\r?\n/).find((line) =>
    line.startsWith("{") && line.includes('"correctionId"'));
  assert.ok(row, session.stdout + "\n" + session.stderr);
  return JSON.parse(row);
}

beforeEach(reloadFixture);
after(reloadFixture);

test("concurrent same-key correction callers both receive the identical result", { timeout: 30_000 }, async () => {
  const scope = setupCase();
  const first = spawnSession(correctionSql(scope,"historical-race-same","historical-first",true));
  await waitForMarker(first,"historical_rent_race_ready");
  const second = spawnSession(correctionSql(scope,"historical-race-same","historical-second",false));
  await waitForDatabaseLock("historical-second");
  const results = await Promise.all([first.done,second.done]);
  for (const result of results) assert.equal(result.status,0,result.stderr);
  assert.deepEqual(correctionResult(results[0]),correctionResult(results[1]));
  assert.equal(run(`SELECT count(*) FROM public.tenant_invoice_corrections
    WHERE organization_id='${organizationId}' AND tenant_invoice_id='${scope.invoiceId}'`),"1");
});

test("concurrent edits with the same preview cannot append two successors", { timeout: 30_000 }, async () => {
  const scope = setupCase();
  const first = spawnSession(correctionSql(scope,"historical-race-first","historical-first",true));
  await waitForMarker(first,"historical_rent_race_ready");
  const second = spawnSession(correctionSql(scope,"historical-race-second","historical-second",false));
  await waitForDatabaseLock("historical-second");
  const [winner,loser] = await Promise.all([first.done,second.done]);
  assert.equal(winner.status,0,winner.stderr);
  assert.notEqual(loser.status,0);
  assert.match(loser.stderr,/historical_rent_preview_stale/);
  assert.equal(run(`SELECT count(*) FROM public.tenant_invoice_lines
    WHERE organization_id='${organizationId}' AND invoice_id='${scope.invoiceId}'`),"3");
  assert.equal(run(`SELECT total_amount FROM public.tenant_invoice_balances
    WHERE organization_id='${organizationId}' AND id='${scope.invoiceId}'`),"1200.00");
});

function termCorrectionSql(scope, pause) {
  return `BEGIN;
    SET LOCAL statement_timeout='15s';
    SET LOCAL application_name='rent-term-correction';
    SELECT set_config('request.jwt.claim.sub','${superAdminId}',true);
    SELECT set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    SELECT public.schedule_authoritative_lease_term('${organizationId}','${scope.leaseId}',
      (SELECT billing_period_start FROM public.tenant_invoices WHERE id='${scope.invoiceId}'),
      (SELECT end_date FROM public.lease_terms WHERE id='${scope.termId}'),
      1300,'USD',10,'monthly','${scope.termId}','term-direct-correction-race');
    ${pause ? "DO $ready$ BEGIN RAISE NOTICE 'rent_term_correction_ready'; END $ready$; SELECT pg_sleep(2);" : ""}
    COMMIT;`;
}

test("term correction and direct correction serialize before month locks", { timeout: 30_000 }, async () => {
  const scope = setupCase();
  const first = spawnSession(termCorrectionSql(scope,true));
  await waitForMarker(first,"rent_term_correction_ready");
  const second = spawnSession(correctionSql(scope,"direct-after-term","historical-second",false));
  await waitForDatabaseLock("historical-second");
  const [term,direct] = await Promise.all([first.done,second.done]);
  assert.equal(term.status,0,term.stderr);
  assert.notEqual(direct.status,0);
  assert.match(direct.stderr,/historical_rent_preview_stale/);
  assert.doesNotMatch(term.stderr + direct.stderr,/deadlock detected|40P01/i);
});

test("direct correction and term correction serialize in the reverse order", { timeout: 30_000 }, async () => {
  const scope = setupCase();
  const first = spawnSession(correctionSql(scope,"direct-before-term","historical-first",true));
  await waitForMarker(first,"historical_rent_race_ready");
  const second = spawnSession(termCorrectionSql(scope,false));
  await waitForDatabaseLock("rent-term-correction");
  const results = await Promise.all([first.done,second.done]);
  for (const result of results) assert.equal(result.status,0,result.stderr);
  assert.doesNotMatch(results.map(result=>result.stderr).join("\n"),/deadlock detected|40P01/i);
});

test("fee correction serializes with an effective-month rent change", { timeout: 30_000 }, async () => {
  const scope = setupCase();
  const first = spawnSession(`BEGIN;
    SET LOCAL statement_timeout='15s';
    SELECT set_config('request.jwt.claim.sub','${superAdminId}',true);
    SELECT set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    SELECT public.correct_historical_rent('${organizationId}','${scope.invoiceId}',1000,
      extract(day FROM i.due_date)::integer,'Verified fee correction evidence',
      public.preview_historical_rent_correction('${organizationId}','${scope.invoiceId}',1000,extract(day FROM i.due_date)::integer,50)->>'previewHash',
      'fee-before-term-correction',50)
    FROM public.tenant_invoices i WHERE i.id='${scope.invoiceId}';
    DO $ready$ BEGIN RAISE NOTICE 'fee_rent_correction_ready'; END $ready$;
    SELECT pg_sleep(2); COMMIT;`);
  await waitForMarker(first,"fee_rent_correction_ready");
  const second = spawnSession(termCorrectionSql(scope,false));
  await waitForDatabaseLock("rent-term-correction");
  const results = await Promise.all([first.done,second.done]);
  for (const result of results) assert.equal(result.status,0,result.stderr);
  assert.doesNotMatch(results.map(result=>result.stderr).join("\n"),/deadlock detected|40P01/i);
});
