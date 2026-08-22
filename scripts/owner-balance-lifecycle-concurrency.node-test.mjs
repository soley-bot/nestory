import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const financeManagerId = "00000000-0000-0000-0000-000000000701";
const branchId = "00000000-0000-0000-0000-000000000211";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const riversidePropertyId = "10000000-0000-0000-0000-000000000002";
const gardenPropertyId = "10000000-0000-0000-0000-000000000003";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";
const riversideOwnerId = "80000000-0000-0000-0000-000000000005";
const gardenSuccessorId = "80000000-0000-0000-0000-000000000012";
const remainderOwnerId = "80000000-0000-0000-0000-000000000013";
const remainderFirstAssignmentId = "90000000-0000-0000-0000-000000000006";
const remainderSecondAssignmentId = "90000000-0000-0000-0000-000000000007";
const transferRacePropertyId = "c6000000-0000-4000-8000-000000000001";
const transferRaceOwnerId = "c6000000-0000-4000-8000-000000000002";
const transferRaceSuccessorId = "c6000000-0000-4000-8000-000000000003";
const transferRaceOwnerAssignmentId = "c6000000-0000-4000-8000-000000000004";
const transferRaceSuccessorAssignmentId = "c6000000-0000-4000-8000-000000000005";
const transferRacePeriodId = "c6000000-0000-4000-8000-000000000006";

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

async function raceAfterMarker(firstSql, secondSql) {
  const first = spawnSession(firstSql);
  await waitForMarker(first, "owner_balance_write_pause_ready", 15_000);
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
    DROP TRIGGER IF EXISTS test_pause_owner_event_allocation_write
      ON public.owner_event_allocation_sets;
    DROP TRIGGER IF EXISTS test_pause_owner_distribution_write
      ON public.property_withdrawals;
    DROP TRIGGER IF EXISTS test_pause_owner_period_write
      ON public.owner_balance_periods;
    DROP TRIGGER IF EXISTS test_pause_owner_transfer_write
      ON public.owner_component_transfer_instructions;
    DROP FUNCTION IF EXISTS app_private.test_pause_owner_balance_write();
  `);
}

function installPauseTrigger() {
  removePauseTrigger();
  run(`
    CREATE FUNCTION app_private.test_pause_owner_balance_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $pause$
    DECLARE
      v_target_table text := current_setting('app.owner_balance_test_pause_table', true);
      v_target_scope text := current_setting('app.owner_balance_test_pause_scope', true);
      v_write_scope text;
    BEGIN
      v_write_scope := CASE TG_TABLE_NAME
        WHEN 'owner_event_allocation_sets' THEN pg_catalog.to_jsonb(NEW)->>'source_line_id'
        WHEN 'property_withdrawals' THEN pg_catalog.to_jsonb(NEW)->>'idempotency_key'
        WHEN 'owner_balance_periods' THEN
          (pg_catalog.to_jsonb(NEW)->>'owner_person_id') || ':' ||
          (pg_catalog.to_jsonb(NEW)->>'month_start')
        WHEN 'owner_component_transfer_instructions' THEN
          pg_catalog.to_jsonb(NEW)->>'idempotency_key'
      END;
      IF TG_TABLE_NAME = v_target_table AND v_write_scope = v_target_scope THEN
        PERFORM pg_catalog.set_config('app.owner_balance_test_pause_table', '', true);
        RAISE NOTICE 'owner_balance_write_pause_ready';
        PERFORM pg_catalog.pg_sleep(2);
      END IF;
      RETURN NEW;
    END;
    $pause$;

    CREATE TRIGGER test_pause_owner_event_allocation_write
      BEFORE INSERT ON public.owner_event_allocation_sets
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_write();
    CREATE TRIGGER test_pause_owner_distribution_write
      BEFORE INSERT ON public.property_withdrawals
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_write();
    CREATE TRIGGER test_pause_owner_period_write
      BEFORE INSERT ON public.owner_balance_periods
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_write();
    CREATE TRIGGER test_pause_owner_transfer_write
      BEFORE INSERT ON public.owner_component_transfer_instructions
      FOR EACH ROW EXECUTE FUNCTION app_private.test_pause_owner_balance_write();
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

beforeEach(() => reloadFixture());
after(() => reloadFixture());

test("two sessions serialize duplicate source allocation to one persisted set", async () => {
  const reference = "CONCURRENCY-DUPLICATE-ALLOCATION";
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
      AND lease.property_id = '${centralPropertyId}'
      AND deposit.amount = 850.00;
  `));
  const sourceLineId = run(`SELECT id FROM public.lease_deposit_events
    WHERE organization_id = '${organizationId}' AND reference = '${reference}';`);
  assert.match(sourceLineId, /^[0-9a-f-]{36}$/);

  installPauseTrigger();
  try {
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_test_pause_table', 'owner_event_allocation_sets', true);
      SELECT set_config('app.owner_balance_test_pause_scope', '${sourceLineId}', true);
      SELECT public.allocate_owner_event(
        '${organizationId}', 'security_deposit_receipt', '${sourceLineId}',
        'concurrency-duplicate-allocation-a'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.allocate_owner_event(
        '${organizationId}', 'security_deposit_receipt', '${sourceLineId}',
        'concurrency-duplicate-allocation-b'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /duplicate_source/i);
    assert.ok(race.secondElapsedMs >= 1_500, `second session waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT count(*) FROM public.owner_event_allocation_sets
      WHERE organization_id = '${organizationId}'
        AND source_type = 'security_deposit_receipt'
        AND source_line_id = '${sourceLineId}';`), "1");
  } finally {
    removePauseTrigger();
  }
});

test("three sessions preserve stable largest-remainder cents on a 50/50 roster", async () => {
  run(`
    INSERT INTO public.people (
      id, organization_id, display_name, legal_name, party_type,
      primary_email, created_by, updated_by
    ) VALUES (
      '${remainderOwnerId}', '${organizationId}', 'Remainder Owner',
      'Remainder Owner', 'individual', 'remainder.owner@example.test',
      '${superAdminId}', '${superAdminId}'
    );
    INSERT INTO public.person_roles (
      organization_id, person_id, role, status, created_by, updated_by
    ) VALUES (
      '${organizationId}', '${remainderOwnerId}', 'owner', 'active',
      '${superAdminId}', '${superAdminId}'
    );
    UPDATE public.property_owners
    SET ended_on = (date_trunc('month', current_date) + interval '1 month')::date,
        updated_by = '${superAdminId}'
    WHERE organization_id = '${organizationId}'
      AND property_id = '${riversidePropertyId}'
      AND person_id = '${riversideOwnerId}'
      AND ended_on IS NULL;
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_label,
      ownership_percent, is_primary, started_on, created_by, updated_by
    ) VALUES
      (
        '${remainderFirstAssignmentId}', '${organizationId}', '${riversidePropertyId}',
        '${riversideOwnerId}', 'Equal owner A', 50.000, true,
        (date_trunc('month', current_date) + interval '1 month')::date,
        '${superAdminId}', '${superAdminId}'
      ),
      (
        '${remainderSecondAssignmentId}', '${organizationId}', '${riversidePropertyId}',
        '${remainderOwnerId}', 'Equal owner B', 50.000, false,
        (date_trunc('month', current_date) + interval '1 month')::date,
        '${superAdminId}', '${superAdminId}'
      );
  `);

  for (const sequence of [1, 2, 3]) {
    run(authenticatedSql(superAdminId, `
      SELECT public.record_lease_deposit_event(
        '${organizationId}', deposit.id, 'received',
        (date_trunc('month', current_date) + interval '1 month')::date,
        0.01, 'CONCURRENCY-REMAINDER-${sequence}'
      )
      FROM public.lease_deposits AS deposit
      JOIN public.leases AS lease
        ON lease.organization_id = deposit.organization_id
       AND lease.id = deposit.lease_id
      WHERE deposit.organization_id = '${organizationId}'
        AND lease.property_id = '${riversidePropertyId}';
    `));
  }
  const sourceIds = run(`SELECT id FROM public.lease_deposit_events
    WHERE organization_id = '${organizationId}'
      AND reference LIKE 'CONCURRENCY-REMAINDER-%'
    ORDER BY reference;`).split(/\r?\n/).filter(Boolean);
  assert.equal(sourceIds.length, 3);

  const sessions = sourceIds.map((sourceId, index) => spawnSession(
    authenticatedSql(financeManagerId, `
      SELECT public.allocate_owner_event(
        '${organizationId}', 'security_deposit_receipt', '${sourceId}',
        'concurrency-remainder-${index + 1}'
      );
    `),
  ));
  const completed = await Promise.all(sessions.map((session) => session.done));
  for (const session of completed) assert.equal(session.status, 0, session.stderr);

  assert.equal(run(`
    SELECT jsonb_build_array(
      count(DISTINCT allocation_set.id),
      count(*) FILTER (
        WHERE owner_allocation.property_owner_id = '${remainderFirstAssignmentId}'
          AND owner_allocation.allocated_gross_signed_amount = 0.01
      ),
      count(*) FILTER (
        WHERE owner_allocation.property_owner_id = '${remainderSecondAssignmentId}'
          AND owner_allocation.allocated_gross_signed_amount = 0.00
      ),
      count(DISTINCT owner_allocation.ownership_roster_hash)
    )
    FROM public.owner_event_allocation_sets AS allocation_set
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    WHERE allocation_set.organization_id = '${organizationId}'
      AND allocation_set.source_line_id IN (${sourceIds.map((id) => `'${id}'`).join(",")});
  `), "[3, 3, 3, 1]");
});

test("two sessions serialize withdrawal capacity and prevent a negative held balance", async () => {
  installPauseTrigger();
  try {
    const firstKey = "concurrency-withdrawal-capacity-a";
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_test_pause_table', 'property_withdrawals', true);
      SELECT set_config('app.owner_balance_test_pause_scope', '${firstKey}', true);
      SELECT public.record_owner_distribution(
        '${organizationId}', '${centralPropertyId}', '${centralOwnerId}',
        'USD', 1600.00, current_date, 'Concurrency capacity A', '${firstKey}'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.record_owner_distribution(
        '${organizationId}', '${centralPropertyId}', '${centralOwnerId}',
        'USD', 800.00, current_date, 'Concurrency capacity B',
        'concurrency-withdrawal-capacity-b'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /insufficient_authoritative_held_cash/i);
    assert.ok(race.secondElapsedMs >= 1_500, `second session waited only ${race.secondElapsedMs}ms`);
    assert.match(run(`BEGIN;
      SELECT set_config('request.jwt.claim.sub', '${superAdminId}', true);
      SELECT app_private.get_owner_available_withdrawal_baseline(
        '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD', current_date
      )->>'available_withdrawal';
      COMMIT;`), /255\.00/);
  } finally {
    removePauseTrigger();
  }
});

test("distribution versus tenant reversal returns the exact committed downstream link", async () => {
  run(authenticatedSql(superAdminId, `
    WITH target AS (
      SELECT invoice.id AS invoice_id, line.id AS line_id
      FROM public.tenant_invoices AS invoice
      JOIN public.tenant_invoice_balances AS balance ON balance.id = invoice.id
      JOIN public.tenant_invoice_lines AS line
        ON line.organization_id = invoice.organization_id
       AND line.invoice_id = invoice.id
       AND line.line_type = 'rent'
      WHERE invoice.organization_id = '${organizationId}'
        AND invoice.property_id = '${gardenPropertyId}'
        AND balance.balance_due >= 100.00
      ORDER BY invoice.billing_period_start, invoice.id, line.id
      LIMIT 1
    ), source AS (
      SELECT id FROM public.financial_reconciliation_sources
      WHERE organization_id = '${organizationId}' AND code = 'OPS-USD'
    )
    SELECT public.record_tenant_invoice_payment(
      '${organizationId}', target.invoice_id, 100.00,
      (date_trunc('month', current_date) + interval '1 month')::date,
      source.id, 'CONCURRENCY-TENANT-REVERSAL',
      jsonb_build_array(jsonb_build_object('lineId', target.line_id, 'amount', 100.00)),
      'concurrency-tenant-reversal-payment'
    )
    FROM target CROSS JOIN source;
  `));
  const paymentId = run(`SELECT id FROM public.tenant_invoice_payments
    WHERE organization_id = '${organizationId}'
      AND reference = 'CONCURRENCY-TENANT-REVERSAL';`);
  assert.match(paymentId, /^[0-9a-f-]{36}$/);
  run(authenticatedSql(financeManagerId, `
    SELECT public.allocate_owner_event(
      '${organizationId}', 'tenant_rent_receipt', allocation.id,
      'concurrency-tenant-source-' || allocation.id::text
    )
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_lines AS line
      ON line.organization_id = allocation.organization_id
     AND line.id = allocation.invoice_line_id
     AND line.line_type = 'rent'
    WHERE allocation.organization_id = '${organizationId}'
      AND allocation.payment_id = '${paymentId}'
      AND allocation.reversal_of_allocation_id IS NULL;
  `));
  const capacityOutput = run(`BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${superAdminId}', true);
    SELECT app_private.get_owner_available_withdrawal_baseline(
      '${organizationId}', '${gardenPropertyId}', '${gardenSuccessorId}',
      'USD', (date_trunc('month', current_date) + interval '1 month')::date
    )->>'available_withdrawal';
    COMMIT;`);
  const dependentAmount = capacityOutput.split(/\r?\n/).at(-1);
  assert.match(dependentAmount, /^\d+\.\d{2}$/);

  installPauseTrigger();
  try {
    const firstKey = "concurrency-dependent-distribution";
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_test_pause_table', 'property_withdrawals', true);
      SELECT set_config('app.owner_balance_test_pause_scope', '${firstKey}', true);
      SELECT public.record_owner_distribution(
        '${organizationId}', '${gardenPropertyId}', '${gardenSuccessorId}',
        'USD', ${dependentAmount},
        (date_trunc('month', current_date) + interval '1 month')::date,
        'Concurrency dependent cash', '${firstKey}'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.reverse_tenant_invoice_payment(
        '${organizationId}', '${paymentId}',
        (date_trunc('month', current_date) + interval '1 month')::date,
        'Concurrency dependent cash reversal',
        'concurrency-dependent-tenant-reversal'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /dependent_owner_cash/i);
    assert.match(race.second.stderr, /owner_distribution/i);
    assert.ok(race.secondElapsedMs >= 1_500, `reversal waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`
      SELECT count(*)
      FROM public.owner_cash_source_consumptions AS consumption
      JOIN public.owner_component_movements AS source_movement
        ON source_movement.id = consumption.source_movement_id
      JOIN public.owner_event_owner_allocations AS source_owner
        ON source_owner.id = source_movement.owner_event_owner_allocation_id
      JOIN public.owner_event_allocation_sets AS source_set
        ON source_set.id = source_owner.allocation_set_id
      JOIN public.owner_component_movements AS consumer_movement
        ON consumer_movement.id = consumption.consumer_movement_id
      JOIN public.owner_event_owner_allocations AS consumer_owner
        ON consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
      JOIN public.owner_event_allocation_sets AS consumer_set
        ON consumer_set.id = consumer_owner.allocation_set_id
      WHERE consumption.organization_id = '${organizationId}'
        AND source_set.source_type = 'tenant_rent_receipt'
        AND source_set.source_id = '${paymentId}'
        AND consumer_set.source_type = 'owner_distribution';
    `), "1");
  } finally {
    removePauseTrigger();
  }
});

test("two sessions serialize next-period generation to one four-component rowset", async () => {
  const monthStart = run(`SELECT (date_trunc('month', current_date) + interval '2 months')::date;`);
  installPauseTrigger();
  try {
    const scope = `${centralOwnerId}:${monthStart}`;
    const first = authenticatedSql(financeManagerId, `
      SELECT set_config('app.owner_balance_test_pause_table', 'owner_balance_periods', true);
      SELECT set_config('app.owner_balance_test_pause_scope', '${scope}', true);
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
        '${monthStart}', 'concurrency-rollforward-generation-a'
      );
    `);
    const second = authenticatedSql(financeManagerId, `
      SELECT public.generate_owner_balance_period(
        '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
        '${monthStart}', 'concurrency-rollforward-generation-b'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 0, race.second.stderr);
    assert.ok(race.secondElapsedMs >= 1_500, `generation waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`
      SELECT jsonb_build_array(count(DISTINCT period.id), count(component.id),
        min(period.status::text), count(DISTINCT component.component))
      FROM public.owner_balance_periods AS period
      JOIN public.owner_balance_period_components AS component
        ON component.owner_balance_period_id = period.id
      WHERE period.organization_id = '${organizationId}'
        AND period.property_id = '${centralPropertyId}'
        AND period.owner_person_id = '${centralOwnerId}'
        AND period.month_start = '${monthStart}';
    `), '[1, 4, "ready", 4]');
  } finally {
    removePauseTrigger();
  }
});

test("two sessions serialize the same transfer component against remaining authority", async () => {
  run(`
    SELECT set_config(
      'app.property_branch_assignment_context',
      (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),
      false
    );
    INSERT INTO public.properties (id, organization_id, branch_id, name, code, property_type)
    VALUES (
      '${transferRacePropertyId}', '${organizationId}', '${branchId}',
      'Transfer race property', 'TRANSFER-RACE', 'Apartment'
    );
    SELECT set_config('app.property_branch_assignment_context', 'off', false);
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES
      ('${transferRaceOwnerId}', '${organizationId}', 'Transfer race predecessor'),
      ('${transferRaceSuccessorId}', '${organizationId}', 'Transfer race successor');
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES
      ('${organizationId}', '${transferRaceOwnerId}', 'owner', 'active'),
      ('${organizationId}', '${transferRaceSuccessorId}', 'owner', 'active');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on, ended_on
    ) VALUES (
      '${transferRaceOwnerAssignmentId}', '${organizationId}', '${transferRacePropertyId}',
      '${transferRaceOwnerId}', 100.000, date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '2 months')::date
    );
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${transferRaceSuccessorAssignmentId}', '${organizationId}', '${transferRacePropertyId}',
      '${transferRaceSuccessorId}', 100.000,
      (date_trunc('month', current_date) + interval '2 months')::date
    );
  `);
  run(authenticatedSql(financeManagerId, `
    SELECT public.record_owner_cash_event(
      '${organizationId}', '${transferRacePropertyId}', '${transferRaceOwnerId}', 'USD',
      'owner_contribution',
      (date_trunc('month', current_date) + interval '1 month')::date, 600.00,
      'Concurrency transfer funding', 'concurrency-transfer-funding'
    );
  `));
  run(`
    SELECT set_config('app.owner_balance_period_write_context', 'checked-rollforward-v1', true);
    INSERT INTO public.owner_balance_periods (
      id, organization_id, property_id, owner_person_id, currency, month_start,
      status, input_watermark, input_hash, generated_at, generated_by
    ) VALUES (
      '${transferRacePeriodId}', '${organizationId}', '${transferRacePropertyId}',
      '${transferRaceOwnerId}', 'USD',
      (date_trunc('month', current_date) + interval '1 month')::date,
      'ready', 'concurrency-transfer-predecessor', repeat('6', 64),
      now(), '${financeManagerId}'
    );
    INSERT INTO public.owner_balance_period_components (
      owner_balance_period_id, organization_id, component,
      opening_amount, movement_amount, closing_amount, created_by
    )
    SELECT
      '${transferRacePeriodId}', '${organizationId}', component,
      0.00,
      CASE component WHEN 'ips_held_owner_cash' THEN 600.00 ELSE 0.00 END,
      CASE component WHEN 'ips_held_owner_cash' THEN 600.00 ELSE 0.00 END,
      '${financeManagerId}'
    FROM pg_catalog.unnest(enum_range(NULL::public.owner_balance_component)) AS component;
  `);
  installPauseTrigger();
  try {
    const firstKey = "concurrency-transfer-held-a";
    const first = authenticatedSql(superAdminId, `
      SELECT set_config('app.owner_balance_test_pause_table', 'owner_component_transfer_instructions', true);
      SELECT set_config('app.owner_balance_test_pause_scope', '${firstKey}', true);
      SELECT public.transfer_owner_balance_component(
        '${organizationId}', '${transferRacePropertyId}', '${transferRaceOwnerId}',
        '${transferRaceSuccessorId}', 'USD',
        (date_trunc('month', current_date) + interval '2 months')::date,
        'ips_held_owner_cash', 600.00, 'Concurrency transfer A',
        'CONCURRENCY-TRANSFER-A', repeat('a', 64), '${firstKey}'
      );
    `);
    const second = authenticatedSql(superAdminId, `
      SELECT public.transfer_owner_balance_component(
        '${organizationId}', '${transferRacePropertyId}', '${transferRaceOwnerId}',
        '${transferRaceSuccessorId}', 'USD',
        (date_trunc('month', current_date) + interval '2 months')::date,
        'ips_held_owner_cash', 600.00, 'Concurrency transfer B',
        'CONCURRENCY-TRANSFER-B', repeat('b', 64),
        'concurrency-transfer-held-b'
      );
    `);
    const race = await raceAfterMarker(first, second);
    assert.equal(race.first.status, 0, race.first.stderr);
    assert.equal(race.second.status, 1, race.second.stderr);
    assert.match(race.second.stderr, /owner_transfer_no_remaining_balance/i);
    assert.ok(race.secondElapsedMs >= 1_500, `transfer waited only ${race.secondElapsedMs}ms`);
    assert.equal(run(`SELECT count(*) FROM public.owner_component_transfer_instructions
      WHERE organization_id = '${organizationId}'
        AND idempotency_key IN ('${firstKey}', 'concurrency-transfer-held-b');`), "1");
  } finally {
    removePauseTrigger();
  }
});
