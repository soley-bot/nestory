import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const ids = {
  organization: "b22c0000-0000-4000-8000-000000000001",
  organizationTwo: "b22c0000-0000-4000-8000-000000000002",
  property: "b22c0000-0000-4000-8000-000000000003",
  propertyTwo: "b22c0000-0000-4000-8000-000000000004",
  propertyOtherOrg: "b22c0000-0000-4000-8000-000000000005",
  owner: "b22c0000-0000-4000-8000-000000000006",
  propertyOwner: "b22c0000-0000-4000-8000-000000000007",
  financeMember: "b22c0000-0000-4000-8000-000000000010",
  submitterTwo: "b22c0000-0000-4000-8000-000000000011",
  reviewer: "b22c0000-0000-4000-8000-000000000012",
};

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

function psqlArgs(container, sql) {
  return [
    "exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
  ];
}

function run(container, sql) {
  const result = spawnSync("docker", psqlArgs(container, sql), {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function raceAfterMarker(container, firstSql, secondSql, marker) {
  return new Promise((resolve, reject) => {
    const first = spawn("docker", psqlArgs(container, firstSql), {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    let firstStdout = "";
    let firstStderr = "";
    let launched = false;
    let secondResult;
    let secondElapsedMs = 0;

    const maybeLaunch = () => {
      if (!launched && `${firstStdout}\n${firstStderr}`.includes(marker)) {
        launched = true;
        const startedAt = performance.now();
        secondResult = spawnSync("docker", psqlArgs(container, secondSql), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: false,
          timeout: 10_000,
        });
        secondElapsedMs = performance.now() - startedAt;
      }
    };

    first.stderr.on("data", (chunk) => {
      firstStderr += chunk;
      maybeLaunch();
    });
    first.stdout.on("data", (chunk) => {
      firstStdout += chunk;
      maybeLaunch();
    });
    first.on("error", reject);
    first.on("close", (status) => {
      try {
        assert.equal(
          launched,
          true,
          `barrier marker missing: ${firstStdout}\n${firstStderr}`,
        );
        resolve({
          first: { status, stdout: firstStdout, stderr: firstStderr },
          second: secondResult,
          secondElapsedMs,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function authenticatedSubmitSql(actorId, idempotencyKey, predecessor = null) {
  const predecessorSql = predecessor ? `'${predecessor}'::uuid` : "NULL::uuid";
  return `
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    SELECT public.submit_owner_opening_balance(
      '${ids.organization}', '${ids.property}', '${ids.owner}', 'USD',
      '2026-08-01', 'ips_held_owner_cash', 10.00,
      'Concurrency verified opening', 'Concurrency source row', NULL,
      repeat('a', 64), ${predecessorSql}, '${idempotencyKey}'
    ) ->> 'request_id';
  `;
}

function authenticatedReviewSql(actorId, requestId, idempotencyKey) {
  return `
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    SELECT public.review_owner_opening_balance(
      '${ids.organization}', '${requestId}', 'reject',
      'Concurrency rejection evidence', '${idempotencyKey}'
    ) ->> 'request_id';
  `;
}

function setup(container) {
  run(container, `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    SELECT
      '00000000-0000-0000-0000-000000000000', actor_id,
      'authenticated', 'authenticated', label || '@opening-concurrency.test',
      extensions.crypt('opening-concurrency', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    FROM (
      VALUES
        ('${ids.financeMember}'::uuid, 'finance-member'),
        ('${ids.submitterTwo}'::uuid, 'submitter-two'),
        ('${ids.reviewer}'::uuid, 'reviewer')
    ) AS actors(actor_id, label)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, name, slug)
    VALUES
      ('${ids.organization}', 'Opening concurrency', 'opening-concurrency'),
      ('${ids.organizationTwo}', 'Opening concurrency two', 'opening-concurrency-two')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.properties (
      id, organization_id, name, code, property_type
    ) VALUES
      ('${ids.property}', '${ids.organization}', 'Opening concurrency A', 'OCA', 'Apartment'),
      ('${ids.propertyTwo}', '${ids.organization}', 'Opening concurrency B', 'OCB', 'Apartment'),
      ('${ids.propertyOtherOrg}', '${ids.organizationTwo}', 'Opening concurrency C', 'OCC', 'Apartment')
    ON CONFLICT (organization_id, id) DO NOTHING;

    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${ids.owner}', '${ids.organization}', 'Opening concurrency owner')
    ON CONFLICT (organization_id, id) DO NOTHING;

    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${ids.organization}', '${ids.owner}', 'owner', 'active');

    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${ids.propertyOwner}', '${ids.organization}', '${ids.property}',
      '${ids.owner}', 100.000, '2026-01-01'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES
      ('${ids.organization}', '${ids.financeMember}', 'finance_member'),
      ('${ids.organization}', '${ids.submitterTwo}', 'super_admin'),
      ('${ids.organization}', '${ids.reviewer}', 'super_admin')
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role;
  `);
}

function cleanup(container) {
  run(container, `
    BEGIN;
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.activity_logs
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM app_private.financial_idempotency_requests
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.owner_opening_balance_entries
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.owner_opening_balance_requests
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.organization_members
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.property_owners
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.person_roles
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.people
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.properties
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.financial_reconciliation_sources
      WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM public.organizations
      WHERE id IN ('${ids.organization}', '${ids.organizationTwo}');
    DELETE FROM auth.users
      WHERE id IN ('${ids.financeMember}', '${ids.submitterTwo}', '${ids.reviewer}');
    SET LOCAL session_replication_role = origin;
    COMMIT;
  `);

  assert.equal(
    run(container, `
      SELECT jsonb_build_array(
        (SELECT count(*) FROM public.owner_opening_balance_requests
          WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}')),
        (SELECT count(*) FROM public.owner_opening_balance_entries
          WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}')),
        (SELECT count(*) FROM app_private.financial_idempotency_requests
          WHERE organization_id IN ('${ids.organization}', '${ids.organizationTwo}')),
        (SELECT count(*) FROM public.organizations
          WHERE id IN ('${ids.organization}', '${ids.organizationTwo}'))
      );
    `),
    "[0, 0, 0, 0]",
  );
}

test("owner opening locks serialize required scopes without deadlocks", async () => {
  const container = databaseContainer();
  cleanup(container);
  setup(container);

  try {
    const hashCount = run(container, `
      SELECT count(DISTINCT key_hash)
      FROM (
        VALUES
          (hashtextextended(concat_ws(':', 'owner_opening_property_month_v1', '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'), 0)),
          (hashtextextended(concat_ws(':', 'owner_opening_property_month_v1', '${ids.organization}', '${ids.propertyTwo}', 'USD', '2026-08-01'), 0)),
          (hashtextextended(concat_ws(':', 'owner_opening_property_month_v1', '${ids.organization}', '${ids.property}', 'EUR', '2026-08-01'), 0)),
          (hashtextextended(concat_ws(':', 'owner_opening_property_month_v1', '${ids.organization}', '${ids.property}', 'USD', '2026-09-01'), 0))
      ) AS keys(key_hash);
    `);
    assert.equal(hashCount, "4");

    const orderedLocks = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_property_financial_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       DO $barrier$ BEGIN RAISE NOTICE 'financial_first_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       COMMIT;`,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       COMMIT;`,
      "financial_first_ready",
    );
    assert.equal(orderedLocks.first.status, 0, orderedLocks.first.stderr);
    assert.equal(orderedLocks.second.status, 0, orderedLocks.second.stderr);
    assert.ok(orderedLocks.secondElapsedMs >= 900, `${orderedLocks.secondElapsedMs}ms`);
    assert.doesNotMatch(
      `${orderedLocks.first.stderr}\n${orderedLocks.second.stderr}`,
      /deadlock detected/i,
    );

    const sameOrgMonth = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       DO $barrier$ BEGIN RAISE NOTICE 'same_org_month_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       COMMIT;`,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.propertyTwo}', 'USD', '2026-08-01'
       );
       COMMIT;`,
      "same_org_month_ready",
    );
    assert.equal(sameOrgMonth.first.status, 0, sameOrgMonth.first.stderr);
    assert.equal(sameOrgMonth.second.status, 0, sameOrgMonth.second.stderr);
    assert.ok(sameOrgMonth.secondElapsedMs >= 900, `${sameOrgMonth.secondElapsedMs}ms`);

    const independentOrg = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       DO $barrier$ BEGIN RAISE NOTICE 'independent_org_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       COMMIT;`,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organizationTwo}', '${ids.propertyOtherOrg}', 'USD', '2026-08-01'
       );
       COMMIT;`,
      "independent_org_ready",
    );
    assert.equal(independentOrg.first.status, 0, independentOrg.first.stderr);
    assert.equal(independentOrg.second.status, 0, independentOrg.second.stderr);
    assert.ok(independentOrg.secondElapsedMs < 900, `${independentOrg.secondElapsedMs}ms`);

    const independentMonth = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       DO $barrier$ BEGIN RAISE NOTICE 'independent_month_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       COMMIT;`,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-09-01'
       );
       COMMIT;`,
      "independent_month_ready",
    );
    assert.equal(independentMonth.first.status, 0, independentMonth.first.stderr);
    assert.equal(independentMonth.second.status, 0, independentMonth.second.stderr);
    assert.ok(independentMonth.secondElapsedMs < 900, `${independentMonth.secondElapsedMs}ms`);

    const pendingRace = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       DO $barrier$ BEGIN RAISE NOTICE 'pending_request_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedSubmitSql(ids.financeMember, "pending-first-0001")}
       COMMIT;`,
      `BEGIN;
       ${authenticatedSubmitSql(ids.submitterTwo, "pending-second-0001")}
       COMMIT;`,
      "pending_request_ready",
    );
    assert.equal(pendingRace.first.status, 0, pendingRace.first.stderr);
    assert.equal(pendingRace.second.status, 1);
    assert.match(pendingRace.second.stderr, /initial opening request is already submitted/i);
    assert.doesNotMatch(`${pendingRace.first.stderr}\n${pendingRace.second.stderr}`, /deadlock detected/i);
    assert.equal(
      run(container, `
        SELECT count(*) FROM public.owner_opening_balance_requests
        WHERE organization_id = '${ids.organization}'
          AND property_id = '${ids.property}'
          AND owner_person_id = '${ids.owner}'
          AND effective_date = '2026-08-01'
          AND component = 'ips_held_owner_cash'
          AND status = 'submitted';
      `),
      "1",
    );

    const parentRequestId = run(container, `
      SELECT id FROM public.owner_opening_balance_requests
      WHERE organization_id = '${ids.organization}'
        AND property_id = '${ids.property}'
        AND owner_person_id = '${ids.owner}'
        AND effective_date = '2026-08-01'
        AND component = 'ips_held_owner_cash'
        AND status = 'submitted';
    `);
    run(container, `BEGIN;
      ${authenticatedReviewSql(
        ids.reviewer,
        parentRequestId,
        "reject-parent-0001",
      )}
      COMMIT;`);

    const resubmissionRace = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       DO $barrier$ BEGIN RAISE NOTICE 'resubmission_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedSubmitSql(ids.financeMember, "resubmit-first-0001", parentRequestId)}
       COMMIT;`,
      `BEGIN;
       ${authenticatedSubmitSql(
         ids.submitterTwo,
         "resubmit-second-0001",
         parentRequestId,
       )}
       COMMIT;`,
      "resubmission_ready",
    );
    assert.equal(resubmissionRace.first.status, 0, resubmissionRace.first.stderr);
    assert.equal(resubmissionRace.second.status, 1);
    assert.match(resubmissionRace.second.stderr, /rejected predecessor already has a successor/i);
    assert.doesNotMatch(
      `${resubmissionRace.first.stderr}\n${resubmissionRace.second.stderr}`,
      /deadlock detected/i,
    );
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE resubmission_of_request_id = '${parentRequestId}'),
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE organization_id = '${ids.organization}'
              AND status = 'submitted'
              AND property_id = '${ids.property}'
              AND component = 'ips_held_owner_cash'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE organization_id = '${ids.organization}')
        );
      `),
      "[1, 1, 0]",
    );
  } finally {
    cleanup(container);
  }
});
