import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const financeManagerId = "00000000-0000-0000-0000-000000000701";
const financeMemberId = "00000000-0000-0000-0000-000000000801";
const riversidePropertyId = "10000000-0000-0000-0000-000000000002";
const riversideOwnerId = "80000000-0000-0000-0000-000000000005";
const openingRacePropertyId = "c4000000-0000-4000-8000-000000000001";
const openingRaceOwnerId = "c4000000-0000-4000-8000-000000000002";
const openingRaceAssignmentId = "c4000000-0000-4000-8000-000000000003";
const correctionChainPropertyId = "c5000000-0000-4000-8000-000000000001";
const correctionChainOwnerId = "c5000000-0000-4000-8000-000000000002";
const correctionChainAssignmentId = "c5000000-0000-4000-8000-000000000003";

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

async function observedBlockingRelationship(
  waiterApplicationName,
  blockerApplicationName,
  timeoutMs = 1_500,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const observed = run(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity AS waiter
        JOIN pg_catalog.pg_stat_activity AS blocker
          ON blocker.pid = ANY(pg_catalog.pg_blocking_pids(waiter.pid))
        WHERE waiter.application_name = '${waiterApplicationName}'
          AND blocker.application_name = '${blockerApplicationName}'
      );
    `);
    if (observed === "t") return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function observedWaitingOnFinancialMonth(
  applicationName,
  monthStart,
  timeoutMs = 1_500,
) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const observed = run(`
      WITH expected AS (
        SELECT pg_catalog.hashtextextended(
          pg_catalog.concat_ws(
            ':',
            'financial_month_v1',
            '${organizationId}',
            '${monthStart}'
          ),
          0
        ) AS lock_key
      )
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity AS activity
        JOIN pg_catalog.pg_locks AS held_or_waiting
          ON held_or_waiting.pid = activity.pid
        CROSS JOIN expected
        WHERE activity.application_name = '${applicationName}'
          AND held_or_waiting.locktype = 'advisory'
          AND held_or_waiting.granted = false
          AND held_or_waiting.classid = (
            (expected.lock_key >> 32) & 4294967295
          )::bigint::oid
          AND held_or_waiting.objid = (
            expected.lock_key & 4294967295
          )::bigint::oid
          AND held_or_waiting.objsubid = 1
      );
    `);
    if (observed === "t") return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

function lifecycleBarrierSession(applicationName, propertyId, ownerId) {
  return spawnSession(`BEGIN;
    SET LOCAL statement_timeout = '10s';
    SET LOCAL application_name = '${applicationName}';
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat_ws(
          ':',
          'owner_balance_lifecycle_v1',
          '${organizationId}',
          '${propertyId}',
          '${ownerId}',
          'USD'
        ),
        0
      )
    );
    DO $barrier$ BEGIN
      RAISE NOTICE 'n1_lifecycle_barrier_ready';
    END $barrier$;
    SELECT pg_catalog.pg_sleep(4);
    COMMIT;`);
}

async function raceAfterMarker(firstSql, secondSql) {
  const first = spawnSession(firstSql);
  await waitForMarker(first, "owner_balance_correction_pause_ready", 15_000);
  const startedAt = performance.now();
  const second = spawnSync("docker", psqlArgs(secondSql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 20_000,
  });
  const secondElapsedMs = performance.now() - startedAt;
  await first.done;
  return { first, second, secondElapsedMs };
}

function removePauseTrigger() {
  run(`
    DROP TRIGGER IF EXISTS test_pause_owner_correction_allocation
      ON public.owner_event_allocation_sets;
    DROP TRIGGER IF EXISTS test_pause_owner_correction_distribution
      ON public.property_withdrawals;
    DROP TRIGGER IF EXISTS test_pause_owner_correction_period
      ON public.owner_balance_periods;
    DROP TRIGGER IF EXISTS test_pause_owner_correction_opening
      ON public.owner_opening_balance_entries;
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_balance_correction();
  `);
}

function installPauseTrigger() {
  removePauseTrigger();
  run(`
    CREATE FUNCTION app_private.test_pause_owner_balance_correction()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $pause$
    DECLARE
      v_target_table text := current_setting('app.owner_balance_correction_pause_table', true);
      v_target_scope text := current_setting('app.owner_balance_correction_pause_scope', true);
      v_write_scope text;
    BEGIN
      v_write_scope := CASE TG_TABLE_NAME
        WHEN 'owner_event_allocation_sets' THEN pg_catalog.to_jsonb(NEW)->>'source_line_id'
        WHEN 'property_withdrawals' THEN pg_catalog.to_jsonb(NEW)->>'idempotency_key'
        WHEN 'owner_balance_periods' THEN
          (pg_catalog.to_jsonb(NEW)->>'owner_person_id') || ':' ||
          (pg_catalog.to_jsonb(NEW)->>'month_start')
        WHEN 'owner_opening_balance_entries' THEN pg_catalog.to_jsonb(NEW)->>'request_id'
      END;
      IF TG_TABLE_NAME = v_target_table AND v_write_scope = v_target_scope THEN
        PERFORM pg_catalog.set_config('app.owner_balance_correction_pause_table', '', true);
        RAISE NOTICE 'owner_balance_correction_pause_ready';
        PERFORM pg_catalog.pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $pause$;

    CREATE TRIGGER test_pause_owner_correction_allocation
      BEFORE INSERT ON public.owner_event_allocation_sets
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_correction();
    CREATE TRIGGER test_pause_owner_correction_distribution
      BEFORE INSERT ON public.property_withdrawals
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_correction();
    CREATE TRIGGER test_pause_owner_correction_period
      BEFORE INSERT ON public.owner_balance_periods
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_correction();
    CREATE TRIGGER test_pause_owner_correction_opening
      BEFORE INSERT ON public.owner_opening_balance_entries
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_correction();
  `);
}

function reloadFixture() {
  removePauseTrigger();
  const result = spawnSync(process.execPath, ["scripts/load-test-fixture.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
}

function installRiversideCurrentPeriod() {
  run(`
    SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);
    INSERT INTO public.owner_balance_periods (
      organization_id, property_id, owner_person_id, currency, month_start,
      status, input_watermark, input_hash, generated_at, generated_by
    ) VALUES (
      '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}', 'USD',
      date_trunc('month', current_date)::date, 'ready',
      'correction-concurrency-current', repeat('a', 64), now(), '${financeManagerId}'
    );
    INSERT INTO public.owner_balance_period_components (
      owner_balance_period_id, organization_id, component,
      opening_amount, movement_amount, closing_amount, created_by
    )
    SELECT period.id, period.organization_id, component, 0.00, 0.00, 0.00,
      '${financeManagerId}'
    FROM public.owner_balance_periods AS period
    CROSS JOIN pg_catalog.unnest(enum_range(NULL::public.owner_balance_component)) AS component
    WHERE period.organization_id = '${organizationId}'
      AND period.property_id = '${riversidePropertyId}'
      AND period.owner_person_id = '${riversideOwnerId}'
      AND period.month_start = date_trunc('month', current_date)::date;
  `);
}

function createRiversideDepositSource(reference) {
  run(authenticatedSql(superAdminId, `
    SELECT public.record_lease_deposit_event(
      '${organizationId}', deposit.id, 'received', current_date, 10.00,
      '${reference}'
    )
    FROM public.lease_deposits AS deposit
    JOIN public.leases AS lease
      ON lease.organization_id = deposit.organization_id
     AND lease.id = deposit.lease_id
    WHERE deposit.organization_id = '${organizationId}'
      AND lease.property_id = '${riversidePropertyId}'
    ORDER BY deposit.id
    LIMIT 1;
  `));
  const sourceLineId = run(`SELECT id FROM public.lease_deposit_events
    WHERE organization_id = '${organizationId}' AND reference = '${reference}';`);
  assert.match(sourceLineId, /^[0-9a-f-]{36}$/);
  return sourceLineId;
}

function prepareOwnerBalanceLockOrderAuthority(suffix) {
  run(`
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES (
      '${correctionChainPropertyId}', '${organizationId}',
      'Owner balance lock-order property', 'LOCK-ORDER', 'Apartment'
    );
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${correctionChainOwnerId}', '${organizationId}', 'Lock-order owner');
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${organizationId}', '${correctionChainOwnerId}', 'owner', 'active');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${correctionChainAssignmentId}', '${organizationId}', '${correctionChainPropertyId}',
      '${correctionChainOwnerId}', 100.000, date_trunc('month', current_date)::date
    );
  `);
  run(authenticatedSql(financeMemberId, `
    SELECT public.submit_owner_opening_balance(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', date_trunc('month', current_date)::date,
      requested.component, requested.amount,
      'N1 lock-order opening authority',
      'LOCK-ORDER-${suffix}-' || requested.label,
      NULL, repeat(requested.hash_character, 64), NULL,
      'lock-order-${suffix}-' || lower(requested.label) || '-submit'
    )
    FROM (VALUES
      ('ips_due_to_owner'::public.owner_balance_component, 0.00::numeric, 'DUE', '1'),
      ('ips_held_owner_cash'::public.owner_balance_component, 100.00::numeric, 'HELD', '2'),
      ('owner_due_to_ips'::public.owner_balance_component, 0.00::numeric, 'OWED', '3'),
      ('security_deposit_custody'::public.owner_balance_component, 0.00::numeric, 'DEPOSIT', '4')
    ) AS requested(component, amount, label, hash_character);
  `));
  run(authenticatedSql(superAdminId, `
    SELECT public.review_owner_opening_balance(
      request.organization_id, request.id, 'approve', NULL,
      'lock-order-${suffix}-' || lower(request.component::text) || '-approve'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${correctionChainPropertyId}'
      AND request.source_reference LIKE 'LOCK-ORDER-${suffix}-%'
    ORDER BY request.component;
  `));
  return run(`SELECT date_trunc('month', current_date)::date;`);
}

function prepareLateOpeningCorrection(suffix) {
  run(`
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES (
      '${correctionChainPropertyId}', '${organizationId}',
      'Opening correction chain property', 'OPEN-CHAIN', 'Apartment'
    );
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${correctionChainOwnerId}', '${organizationId}', 'Opening correction chain owner');
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${organizationId}', '${correctionChainOwnerId}', 'owner', 'active');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${correctionChainAssignmentId}', '${organizationId}', '${correctionChainPropertyId}',
      '${correctionChainOwnerId}', 100.000, date_trunc('month', current_date)::date
    );
  `);
  run(authenticatedSql(financeMemberId, `
    SELECT public.submit_owner_opening_balance(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', date_trunc('month', current_date)::date,
      requested.component, requested.amount,
      'Correction chain initial authority',
      'CORRECTION-CHAIN-${suffix}-' || requested.label,
      NULL, repeat(requested.hash_character, 64), NULL,
      'correction-chain-${suffix}-' || lower(requested.label) || '-submit'
    )
    FROM (VALUES
      ('ips_due_to_owner'::public.owner_balance_component, 0.00::numeric, 'DUE', '1'),
      ('ips_held_owner_cash'::public.owner_balance_component, 100.00::numeric, 'HELD', '2'),
      ('owner_due_to_ips'::public.owner_balance_component, 0.00::numeric, 'OWED', '3'),
      ('security_deposit_custody'::public.owner_balance_component, 0.00::numeric, 'DEPOSIT', '4')
    ) AS requested(component, amount, label, hash_character);
  `));
  run(authenticatedSql(superAdminId, `
    SELECT public.review_owner_opening_balance(
      request.organization_id, request.id, 'approve', NULL,
      'correction-chain-${suffix}-' || lower(request.component::text) || '-approve'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${correctionChainPropertyId}'
      AND request.source_reference LIKE 'CORRECTION-CHAIN-${suffix}-%'
    ORDER BY request.component;
  `));
  const currentMonth = run(`SELECT date_trunc('month', current_date)::date;`);
  const nextMonth = run(`SELECT (date_trunc('month', current_date) + interval '1 month')::date;`);
  run(authenticatedSql(financeManagerId, `
    SELECT public.generate_owner_balance_period(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', '${currentMonth}', 'correction-chain-${suffix}-current-period'
    );
  `));
  const activeEntryId = run(`SELECT id
    FROM public.owner_opening_balance_entries
    WHERE organization_id = '${organizationId}'
      AND property_id = '${correctionChainPropertyId}'
      AND owner_person_id = '${correctionChainOwnerId}'
      AND component = 'ips_held_owner_cash'
      AND entry_kind = 'opening';`);
  run(authenticatedSql(financeManagerId, `
    SELECT public.submit_owner_opening_balance_correction(
      '${organizationId}', '${activeEntryId}', 80.00,
      'Late correction must serialize with next period',
      'CORRECTION-CHAIN-${suffix}-HELD-80', NULL, repeat('9', 64), NULL,
      'correction-chain-${suffix}-correction-submit'
    );
  `));
  const pendingRequestId = run(`SELECT id
    FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}'
      AND source_reference = 'CORRECTION-CHAIN-${suffix}-HELD-80';`);
  return { currentMonth, nextMonth, pendingRequestId };
}

beforeEach(() => reloadFixture());
after(() => reloadFixture());

test("cross-month withdrawal race serializes the later consumer before the backdated consumer", async () => {
  run(authenticatedSql(financeManagerId, `
    SELECT public.record_owner_cash_event(
      '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}',
      'USD', 'owner_contribution', current_date, 100.00,
      'Cross-month race funding', 'correction-race-cross-month-funding'
    );
  `));

  installPauseTrigger();
  try {
    const firstKey = "correction-race-later-distribution";
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'property_withdrawals', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${firstKey}', true);
      SELECT public.record_owner_distribution(
        '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}',
        'USD', 60.00,
        (date_trunc('month', current_date) + interval '1 month')::date,
        'Later consumer wins', '${firstKey}'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.record_owner_distribution(
        '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}',
        'USD', 50.00, current_date,
        'Backdated consumer loses', 'correction-race-backdated-distribution'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /backdated_owner_cash_consumer|insufficient_authoritative_held_cash/i);
    assert.ok(race.secondElapsedMs >= 1_500, `backdated consumer waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT to_char(sum(signed_amount), 'FM999999999990.00')
      FROM public.owner_component_movements
      WHERE organization_id = '${organizationId}'
        AND property_id = '${riversidePropertyId}'
        AND owner_person_id = '${riversideOwnerId}'
        AND component = 'ips_held_owner_cash';`), "40.00");
  } finally {
    removePauseTrigger();
  }
});

test("opening correction loses after a distribution commits exact opening-source use", async () => {
  run(`
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES (
      '${openingRacePropertyId}', '${organizationId}',
      'Opening correction race property', 'OPEN-CORR-RACE', 'Apartment'
    );
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${openingRaceOwnerId}', '${organizationId}', 'Opening correction race owner');
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${organizationId}', '${openingRaceOwnerId}', 'owner', 'active');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${openingRaceAssignmentId}', '${organizationId}', '${openingRacePropertyId}',
      '${openingRaceOwnerId}', 100.000, date_trunc('month', current_date)::date
    );
  `);
  run(authenticatedSql(financeMemberId, `
    SELECT public.submit_owner_opening_balance(
      '${organizationId}', '${openingRacePropertyId}', '${openingRaceOwnerId}',
      'USD', date_trunc('month', current_date)::date,
      'ips_held_owner_cash', 500.00,
      'Create isolated opening cash race authority',
      'CORRECTION-RACE-OPENING-500', NULL, repeat('8', 64), NULL,
      'correction-race-opening-500-submit'
    );
  `));
  const firstRequestId = run(`SELECT id FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}'
      AND source_reference = 'CORRECTION-RACE-OPENING-500';`);
  run(authenticatedSql(superAdminId, `
    SELECT public.review_owner_opening_balance(
      '${organizationId}', '${firstRequestId}', 'approve', NULL,
      'correction-race-opening-500-approve'
    );
  `));

  const activeEntryId = run(`SELECT entry.id
    FROM public.owner_opening_balance_entries AS entry
    WHERE entry.organization_id = '${organizationId}'
      AND entry.request_id = '${firstRequestId}'
      AND entry.entry_kind = 'opening';`);
  assert.match(activeEntryId, /^[0-9a-f-]{36}$/);
  run(authenticatedSql(financeManagerId, `
    SELECT public.submit_owner_opening_balance_correction(
      '${organizationId}', '${activeEntryId}', 400.00,
      'Correction must lose after dependent use', 'CORRECTION-RACE-OPENING-400',
      NULL, repeat('9', 64), NULL, 'correction-race-opening-400-submit'
    );
  `));
  const pendingRequestId = run(`SELECT id FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}'
      AND source_reference = 'CORRECTION-RACE-OPENING-400';`);

  installPauseTrigger();
  try {
    const firstKey = "correction-race-opening-distribution";
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'property_withdrawals', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${firstKey}', true);
      SELECT public.record_owner_distribution(
        '${organizationId}', '${openingRacePropertyId}', '${openingRaceOwnerId}',
        'USD', 1.00, current_date,
        'Opening consumer wins', '${firstKey}'
      );
    `);
    const second = authenticatedSql(superAdminId, `
      SELECT public.review_owner_opening_balance(
        '${organizationId}', '${pendingRequestId}', 'approve', NULL,
        'correction-race-opening-400-approve'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /dependent_owner_cash/i);
    assert.ok(race.secondElapsedMs >= 1_500, `opening correction waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT count(*) FROM public.owner_cash_source_consumptions
      WHERE organization_id = '${organizationId}'
        AND source_opening_entry_id = '${activeEntryId}';`), "1");
  } finally {
    removePauseTrigger();
  }
});

test("late opening correction waits behind next-period generation and then stales it", async () => {
  const { nextMonth, pendingRequestId } = prepareLateOpeningCorrection("A");

  installPauseTrigger();
  try {
    const scope = `${correctionChainOwnerId}:${nextMonth}`;
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'owner_balance_periods', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${scope}', true);
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
        'USD', '${nextMonth}', 'correction-chain-a-generate-first'
      );
    `);
    const second = authenticatedSql(superAdminId, `
      SELECT public.review_owner_opening_balance(
        '${organizationId}', '${pendingRequestId}', 'approve', NULL,
        'correction-chain-a-correction-approve'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 0, race.second.stderr);
    assert.ok(race.secondElapsedMs >= 1_500, `late correction waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT status FROM public.owner_balance_periods
      WHERE organization_id = '${organizationId}'
        AND property_id = '${correctionChainPropertyId}'
        AND owner_person_id = '${correctionChainOwnerId}'
        AND month_start = '${nextMonth}';`), "stale");
  } finally {
    removePauseTrigger();
  }
});

test("next-period generation waits behind late opening correction and cannot commit ready", async () => {
  const { nextMonth, pendingRequestId } = prepareLateOpeningCorrection("B");

  installPauseTrigger();
  try {
    const first = authenticatedSql(superAdminId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'owner_opening_balance_entries', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${pendingRequestId}', true);
      SELECT public.review_owner_opening_balance(
        '${organizationId}', '${pendingRequestId}', 'approve', NULL,
        'correction-chain-b-correction-approve'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
        'USD', '${nextMonth}', 'correction-chain-b-generate-second'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 0, race.second.stderr);
    assert.ok(race.secondElapsedMs >= 1_500, `next-period generation waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT status || ':' || blocked_reason_code
      FROM public.owner_balance_periods
      WHERE organization_id = '${organizationId}'
        AND property_id = '${correctionChainPropertyId}'
        AND owner_person_id = '${correctionChainOwnerId}'
        AND month_start = '${nextMonth}';`), "blocked:prior_period_not_ready");
  } finally {
    removePauseTrigger();
  }
});

test("late current-period allocation waits behind next-period generation and then stales it", async () => {
  installRiversideCurrentPeriod();
  const sourceLineId = createRiversideDepositSource("CORRECTION-RACE-LATE-SOURCE-A");
  const nextMonth = run(`SELECT (date_trunc('month', current_date) + interval '1 month')::date;`);

  installPauseTrigger();
  try {
    const scope = `${riversideOwnerId}:${nextMonth}`;
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'owner_balance_periods', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${scope}', true);
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}',
        'USD', '${nextMonth}', 'correction-race-generate-first'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.allocate_owner_event(
        '${organizationId}', 'security_deposit_receipt', '${sourceLineId}',
        'correction-race-late-source-a'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 0, race.second.stderr);
    assert.ok(race.secondElapsedMs >= 1_500, `late allocation waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT status FROM public.owner_balance_periods
      WHERE organization_id = '${organizationId}'
        AND property_id = '${riversidePropertyId}'
        AND owner_person_id = '${riversideOwnerId}'
        AND month_start = '${nextMonth}';`), "stale");
  } finally {
    removePauseTrigger();
  }
});

test("next-period generation waits behind late allocation and cannot commit ready from stale predecessor", async () => {
  installRiversideCurrentPeriod();
  const sourceLineId = createRiversideDepositSource("CORRECTION-RACE-LATE-SOURCE-B");
  const nextMonth = run(`SELECT (date_trunc('month', current_date) + interval '1 month')::date;`);

  installPauseTrigger();
  try {
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_correction_pause_table', 'owner_event_allocation_sets', true);
      SELECT set_config('app.owner_balance_correction_pause_scope', '${sourceLineId}', true);
      SELECT public.allocate_owner_event(
        '${organizationId}', 'security_deposit_receipt', '${sourceLineId}',
        'correction-race-late-source-b'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${riversidePropertyId}', '${riversideOwnerId}',
        'USD', '${nextMonth}', 'correction-race-generate-second'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 0, race.second.stderr);
    assert.ok(race.secondElapsedMs >= 1_500, `next-period generation waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT status FROM public.owner_balance_periods
      WHERE organization_id = '${organizationId}'
        AND property_id = '${riversidePropertyId}'
        AND owner_person_id = '${riversideOwnerId}'
        AND month_start = '${nextMonth}';`), "blocked");
  } finally {
    removePauseTrigger();
  }
});

test("same-month source first serializes generation behind the canonical month then lifecycle order", async () => {
  const currentMonth = prepareOwnerBalanceLockOrderAuthority("N1-SOURCE-FIRST");
  const controllerName = "n1_source_first_controller";
  const sourceName = "n1_source_first_source";
  const generationName = "n1_source_first_generation";
  const controller = lifecycleBarrierSession(
    controllerName,
    correctionChainPropertyId,
    correctionChainOwnerId,
  );
  await waitForMarker(controller, "n1_lifecycle_barrier_ready");

  const source = spawnSession(authenticatedSql(financeManagerId, `
    SET LOCAL application_name = '${sourceName}';
    SELECT public.record_owner_cash_event(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', 'owner_contribution', '${currentMonth}', 10.00,
      'N1 same-month source-first contribution',
      'n1-source-first-contribution'
    );
  `));
  const sourceWaitedForLifecycle = await observedBlockingRelationship(
    sourceName,
    controllerName,
  );

  const generation = spawnSession(authenticatedSql(financeManagerId, `
    SET LOCAL application_name = '${generationName}';
    SELECT public.generate_owner_balance_period(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', '${currentMonth}', 'n1-source-first-generation'
    );
  `));
  const generationWaitedForSourceMonth = await observedBlockingRelationship(
    generationName,
    sourceName,
  );
  const generationWaitedOnFinancialMonth = await observedWaitingOnFinancialMonth(
    generationName,
    currentMonth,
  );

  await Promise.all([controller.done, source.done, generation.done]);
  const transcript = [
    controller.stdout, controller.stderr,
    source.stdout, source.stderr,
    generation.stdout, generation.stderr,
  ].join("\n");

  assert.equal(sourceWaitedForLifecycle, true, transcript);
  assert.equal(generationWaitedForSourceMonth, true, transcript);
  assert.equal(generationWaitedOnFinancialMonth, true, transcript);
  assert.doesNotMatch(transcript, /40P01|deadlock detected/i);
  assert.equal(controller.status, 0, controller.stderr);
  assert.equal(source.status, 0, source.stderr);
  assert.equal(generation.status, 0, generation.stderr);
  assert.equal(run(`
    SELECT period.status || '|' || period.input_watermark
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = '${organizationId}'
      AND period.property_id = '${correctionChainPropertyId}'
      AND period.owner_person_id = '${correctionChainOwnerId}'
      AND period.currency = 'USD'
      AND period.month_start = '${currentMonth}';
  `), `ready|sources=1;movements=1;month=${currentMonth}`);
  assert.equal(run(`
    SELECT count(*)
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_cash_events AS event
      ON event.organization_id = allocation_set.organization_id
     AND event.id = allocation_set.source_line_id
    WHERE allocation_set.organization_id = '${organizationId}'
      AND allocation_set.source_type = 'owner_contribution'
      AND event.idempotency_key = 'n1-source-first-contribution';
  `), "1");
});

test("same-month generation first makes the later source type-stale the committed period", async () => {
  const currentMonth = prepareOwnerBalanceLockOrderAuthority("N1-GENERATION-FIRST");
  const controllerName = "n1_generation_first_controller";
  const generationName = "n1_generation_first_generation";
  const sourceName = "n1_generation_first_source";
  const controller = lifecycleBarrierSession(
    controllerName,
    correctionChainPropertyId,
    correctionChainOwnerId,
  );
  await waitForMarker(controller, "n1_lifecycle_barrier_ready");

  const generation = spawnSession(authenticatedSql(financeManagerId, `
    SET LOCAL application_name = '${generationName}';
    SELECT public.generate_owner_balance_period(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', '${currentMonth}', 'n1-generation-first-period'
    );
  `));
  const generationWaitedForLifecycle = await observedBlockingRelationship(
    generationName,
    controllerName,
  );

  const source = spawnSession(authenticatedSql(financeManagerId, `
    SET LOCAL application_name = '${sourceName}';
    SELECT public.record_owner_cash_event(
      '${organizationId}', '${correctionChainPropertyId}', '${correctionChainOwnerId}',
      'USD', 'owner_contribution', '${currentMonth}', 10.00,
      'N1 same-month generation-first contribution',
      'n1-generation-first-contribution'
    );
  `));
  const sourceWaitedForGenerationMonth = await observedBlockingRelationship(
    sourceName,
    generationName,
  );
  const sourceWaitedOnFinancialMonth = await observedWaitingOnFinancialMonth(
    sourceName,
    currentMonth,
  );

  await Promise.all([controller.done, generation.done, source.done]);
  const transcript = [
    controller.stdout, controller.stderr,
    generation.stdout, generation.stderr,
    source.stdout, source.stderr,
  ].join("\n");

  assert.equal(generationWaitedForLifecycle, true, transcript);
  assert.equal(sourceWaitedForGenerationMonth, true, transcript);
  assert.equal(sourceWaitedOnFinancialMonth, true, transcript);
  assert.doesNotMatch(transcript, /40P01|deadlock detected/i);
  assert.equal(controller.status, 0, controller.stderr);
  assert.equal(generation.status, 0, generation.stderr);
  assert.equal(source.status, 0, source.stderr);
  assert.equal(run(`
    SELECT period.status || '|' || period.stale_reason || '|' || period.input_watermark
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = '${organizationId}'
      AND period.property_id = '${correctionChainPropertyId}'
      AND period.owner_person_id = '${correctionChainOwnerId}'
      AND period.currency = 'USD'
      AND period.month_start = '${currentMonth}';
  `), `stale|source_allocation_changed|sources=0;movements=0;month=${currentMonth}`);
  assert.equal(run(`
    SELECT count(*)
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_cash_events AS event
      ON event.organization_id = allocation_set.organization_id
     AND event.id = allocation_set.source_line_id
    WHERE allocation_set.organization_id = '${organizationId}'
      AND allocation_set.source_type = 'owner_contribution'
      AND event.idempotency_key = 'n1-generation-first-contribution';
  `), "1");
});
