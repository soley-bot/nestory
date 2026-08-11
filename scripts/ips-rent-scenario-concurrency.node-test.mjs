import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";

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

function reloadFixture() {
  const result = spawnSync(process.execPath, ["scripts/load-test-fixture.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 40_000,
  });
  assert.equal(result.status, 0, result.stderr);
}

function removePauseHarness() {
  run(`
    DROP TRIGGER IF EXISTS test_pause_ips_rent_term_update ON public.lease_terms;
    DROP TRIGGER IF EXISTS test_pause_ips_rent_invoice_insert ON public.tenant_invoices;
    DROP FUNCTION IF EXISTS app_private.test_pause_ips_rent_write();
  `);
}

function installPauseHarness() {
  removePauseHarness();
  run(`
    CREATE FUNCTION app_private.test_pause_ips_rent_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $pause$
    BEGIN
      IF pg_catalog.current_setting('app.ips_rent_test_pause', true) = 'term_update'
          AND TG_TABLE_NAME = 'lease_terms'
          AND TG_OP = 'UPDATE'
          AND pg_catalog.to_jsonb(NEW)->>'lease_id' = (
            SELECT invoice.lease_id::text
            FROM public.tenant_invoices AS invoice
            JOIN public.properties AS property ON property.id = invoice.property_id
            WHERE property.code = 'RIV-SHP'
              AND invoice.billing_period_start = '2026-08-01'
            LIMIT 1
          ) THEN
        PERFORM pg_catalog.set_config('app.ips_rent_test_pause', '', true);
        RAISE NOTICE 'ips_rent_term_pause_ready';
        PERFORM pg_catalog.pg_sleep(2);
      ELSIF pg_catalog.current_setting('app.ips_rent_test_pause', true) = 'invoice_insert'
          AND TG_TABLE_NAME = 'tenant_invoices'
          AND TG_OP = 'INSERT'
          AND (pg_catalog.to_jsonb(NEW)->>'billing_period_start')::date = '2026-09-01' THEN
        PERFORM pg_catalog.set_config('app.ips_rent_test_pause', '', true);
        RAISE NOTICE 'ips_rent_invoice_pause_ready';
        PERFORM pg_catalog.pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $pause$;
    CREATE TRIGGER test_pause_ips_rent_term_update
      AFTER UPDATE ON public.lease_terms
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_ips_rent_write();
    CREATE TRIGGER test_pause_ips_rent_invoice_insert
      AFTER INSERT ON public.tenant_invoices
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_ips_rent_write();
  `);
}

function rentScope() {
  const [leaseId, termId] = run(`
    SELECT invoice.lease_id::text || '|' || invoice.lease_term_id::text
    FROM public.tenant_invoices AS invoice
    JOIN public.properties AS property ON property.id = invoice.property_id
    WHERE property.code = 'RIV-SHP'
      AND invoice.billing_period_start = '2026-08-01';
  `).split("|");
  return { leaseId, termId };
}

function scheduleSql({ leaseId, termId }) {
  return `BEGIN;
    SET LOCAL statement_timeout = '15s';
    SELECT pg_catalog.set_config('request.jwt.claim.sub', '${superAdminId}', true);
    SET LOCAL ROLE authenticated;
    SELECT pg_catalog.set_config('app.ips_rent_test_pause', 'term_update', true);
    SELECT public.schedule_authoritative_lease_term(
      '${organizationId}', '${leaseId}', '2026-09-15', '2027-11-30',
      1550.00, 'USD', 5, 'monthly', '${termId}', 'track-5-race-schedule'
    );
    COMMIT;`;
}

function generationSql(leaseId, pause = false) {
  return `BEGIN;
    SET LOCAL statement_timeout = '15s';
    ${pause ? "SELECT pg_catalog.set_config('app.ips_rent_test_pause', 'invoice_insert', true);" : ""}
    SELECT app_private.generate_lease_rent_invoice(
      '${organizationId}', '${leaseId}', '2026-09-01', '2026-09-01',
      'scheduled', '${superAdminId}'
    );
    COMMIT;`;
}

before(installPauseHarness);
beforeEach(reloadFixture);
after(() => {
  removePauseHarness();
  reloadFixture();
});

test("term-first generation waits and freezes both next-full-period segments", async () => {
  const scope = rentScope();
  const first = spawnSession(scheduleSql(scope));
  await waitForMarker(first, "ips_rent_term_pause_ready");

  const startedAt = performance.now();
  const second = spawnSession(generationSql(scope.leaseId));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.ok(elapsedMs >= 1_500, `generation waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /deadlock detected|40P01/i);
  assert.equal(
    run(`
      SELECT to_char(invoice.total_amount, 'FM999999999990.00') || '|' ||
        invoice.is_prorated::text || '|' || count(segment.id)::text || '|' ||
        string_agg(to_char(segment.amount, 'FM999999999990.00'), ',' ORDER BY segment.segment_start)
      FROM public.tenant_invoices AS invoice
      JOIN public.tenant_invoice_rent_segments AS segment ON segment.invoice_id = invoice.id
      WHERE invoice.lease_id = '${scope.leaseId}'
        AND invoice.billing_period_start = '2026-09-01'
      GROUP BY invoice.total_amount, invoice.is_prorated;
    `),
    "1450.00|false|2|1450.00,0.00",
  );
});

test("generation-first term change waits then rejects immutable obligation drift", async () => {
  const scope = rentScope();
  const first = spawnSession(generationSql(scope.leaseId, true));
  await waitForMarker(first, "ips_rent_invoice_pause_ready");

  const startedAt = performance.now();
  const second = spawnSession(scheduleSql(scope));
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.notEqual(secondResult.status, 0, "same-period term change unexpectedly succeeded");
  assert.match(secondResult.stderr, /rent_obligation_already_generated/);
  assert.ok(elapsedMs >= 1_500, `term change waited only ${elapsedMs.toFixed(0)}ms`);
  assert.doesNotMatch(`${firstResult.stderr}\n${secondResult.stderr}`, /deadlock detected|40P01/i);
  assert.equal(
    run(`
      SELECT count(DISTINCT invoice.id)::text || '|' ||
        count(segment.id)::text || '|' ||
        count(DISTINCT term.id)::text || '|' ||
        to_char(max(segment.amount), 'FM999999999990.00')
      FROM public.tenant_invoices AS invoice
      JOIN public.tenant_invoice_rent_segments AS segment ON segment.invoice_id = invoice.id
      JOIN public.lease_terms AS term ON term.lease_id = invoice.lease_id
        AND term.status IN ('active', 'upcoming')
      WHERE invoice.lease_id = '${scope.leaseId}'
        AND invoice.billing_period_start = '2026-09-01';
    `),
    "1|1|1|1450.00",
  );
});
