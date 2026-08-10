import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";

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
    "exec", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ];
}

function run(sql) {
  const result = spawnSync("docker", psqlArgs(sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function authenticatedSql(actorId, command) {
  return `BEGIN;
    SET LOCAL statement_timeout = '15s';
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${command}
    COMMIT;`;
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
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
}

function prepareReadyClose() {
  run(authenticatedSql(superAdminId, `
    SELECT public.set_financial_month_lock(
      '${organizationId}', date_trunc('month', current_date)::date, true,
      'Owner close concurrency acceptance'
    );
    SELECT public.review_owner_opening_balance(
      request.organization_id, request.id, 'reject',
      'Resolve pending fixture correction before close',
      'owner-close-concurrency-reject-pending'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${centralPropertyId}'
      AND request.owner_person_id = '${centralOwnerId}'
      AND request.currency = 'USD'
      AND request.effective_date = date_trunc('month', current_date)::date
      AND request.status = 'submitted';
  `));
  assert.equal(run(authenticatedSql(superAdminId, `
    SELECT public.get_owner_close_readiness(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date
    )->>'is_ready';
  `)).split(/\r?\n/).at(-1), "true");
}

function removePauseHarness() {
  run(`
    DROP TRIGGER IF EXISTS test_pause_owner_close_revision_insert
      ON public.owner_close_revisions;
    DROP TRIGGER IF EXISTS test_pause_owner_close_correction_insert
      ON public.owner_close_corrections;
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_close_write();
  `);
}

function installPauseHarness() {
  removePauseHarness();
  run(`
    CREATE FUNCTION app_private.test_pause_owner_close_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $pause$
    BEGIN
      IF pg_catalog.current_setting('app.owner_close_test_pause', true)
          IN ('revision_insert', 'correction_insert') THEN
        PERFORM pg_catalog.set_config('app.owner_close_test_pause', '', true);
        RAISE NOTICE 'owner_close_write_pause_ready';
        PERFORM pg_catalog.pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $pause$;
    CREATE TRIGGER test_pause_owner_close_revision_insert
      BEFORE INSERT ON public.owner_close_revisions
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_close_write();
    CREATE TRIGGER test_pause_owner_close_correction_insert
      BEFORE INSERT ON public.owner_close_corrections
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_close_write();
  `);
}

function prepareReopenedClose() {
  prepareReadyClose();
  run(authenticatedSql(superAdminId, `
    SELECT public.close_owner_month(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date,
      'Concurrency fixture revision one close',
      'owner-close-correction-reroll-close-r1'
    );
  `));
  run(authenticatedSql(superAdminId, `
    SELECT public.reopen_owner_month(
      '${organizationId}',
      (
        SELECT series.id
        FROM public.owner_close_series AS series
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND series.currency = 'USD'
          AND series.month_start = date_trunc('month', current_date)::date
      ),
      'Concurrency fixture requires checked correction',
      'owner-close-correction-reroll-reopen-r2'
    );
  `));
  return run(`
    SELECT revision.id::text
    FROM public.owner_close_revisions AS revision
    JOIN public.owner_close_series AS series
      ON series.organization_id = revision.organization_id
     AND series.active_revision_id = revision.id
    WHERE series.organization_id = '${organizationId}'
      AND series.property_id = '${centralPropertyId}'
      AND series.owner_person_id = '${centralOwnerId}'
      AND series.currency = 'USD'
      AND series.month_start = date_trunc('month', current_date)::date;
  `);
}

beforeEach(() => {
  removePauseHarness();
  reloadFixture();
});
after(() => {
  removePauseHarness();
  reloadFixture();
});

test("two real sessions serialize competing closes to one immutable revision", async () => {
  prepareReadyClose();
  installPauseHarness();

  const first = spawnSession(authenticatedSql(superAdminId, `
    SELECT set_config('app.owner_close_test_pause', 'revision_insert', true);
    SELECT public.close_owner_month(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date,
      'First concurrent reconciled close', 'owner-close-concurrency-first'
    );
  `));
  await waitForMarker(first, "owner_close_write_pause_ready", 15_000);

  const startedAt = performance.now();
  const second = spawnSync("docker", psqlArgs(authenticatedSql(superAdminId, `
    SELECT public.close_owner_month(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date,
      'Second competing reconciled close', 'owner-close-concurrency-second'
    );
  `)), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
  });
  const secondElapsedMs = performance.now() - startedAt;
  await first.done;

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 1, second.stderr);
  assert.match(second.stderr, /owner_close_blocked|owner_close_reopen_required/i);
  assert.doesNotMatch(`${first.stderr}\n${second.stderr}`, /deadlock detected/i);
  assert.ok(secondElapsedMs >= 1_500, `second close waited only ${secondElapsedMs}ms`);
  assert.equal(run(`
    SELECT jsonb_build_array(
      count(*),
      count(*) FILTER (WHERE status = 'closed'),
      count(DISTINCT content_hash)
    )
    FROM public.owner_close_revisions
    WHERE organization_id = '${organizationId}'
      AND owner_close_series_id = (
        SELECT series.id
        FROM public.owner_close_series AS series
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND series.currency = 'USD'
          AND series.month_start = date_trunc('month', current_date)::date
      );
  `), "[1, 1, 1]");
});

test("a checked correction serializes before the competing deterministic reroll", async () => {
  const revisionId = prepareReopenedClose();
  installPauseHarness();

  const correction = spawnSession(authenticatedSql(superAdminId, `
    SELECT set_config('app.owner_close_test_pause', 'correction_insert', true);
    SELECT public.record_owner_close_correction(
      '${organizationId}', '${revisionId}', 'ips_held_owner_cash',
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      -25.00,
      'Late evidenced bank fee must precede the reroll',
      'CONCURRENCY-CLOSE-BANK-FEE-001',
      repeat('b', 64),
      'owner-close-correction-reroll-correction'
    );
  `));
  await waitForMarker(correction, "owner_close_write_pause_ready", 15_000);

  const startedAt = performance.now();
  const reroll = spawnSync("docker", psqlArgs(authenticatedSql(superAdminId, `
    SELECT public.generate_owner_balance_period(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date,
      'owner-close-correction-reroll-generate'
    );
  `)), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
  });
  const rerollElapsedMs = performance.now() - startedAt;
  await correction.done;

  assert.equal(correction.status, 0, correction.stderr);
  assert.equal(reroll.status, 0, reroll.stderr);
  assert.doesNotMatch(`${correction.stderr}\n${reroll.stderr}`, /deadlock detected/i);
  assert.ok(rerollElapsedMs >= 1_500, `reroll waited only ${rerollElapsedMs}ms`);
  assert.equal(run(`
    SELECT jsonb_build_array(
      (SELECT count(*)
       FROM public.owner_close_corrections AS item
       WHERE item.organization_id = '${organizationId}'
         AND item.owner_close_revision_id = '${revisionId}'
         AND item.signed_amount = -25.00),
      period.status,
      to_char(component.closing_amount, 'FM999999999990.00'),
      (SELECT count(*)
       FROM app_private.financial_idempotency_requests AS request
       WHERE request.organization_id = '${organizationId}'
         AND request.status = 'pending')
    )
    FROM public.owner_balance_periods AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
     AND component.component = 'ips_held_owner_cash'
    WHERE period.organization_id = '${organizationId}'
      AND period.property_id = '${centralPropertyId}'
      AND period.owner_person_id = '${centralOwnerId}'
      AND period.currency = 'USD'
      AND period.month_start = date_trunc('month', current_date)::date;
  `), '[1, "ready", "1830.00", 0]');
});
