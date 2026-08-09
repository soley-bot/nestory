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
  replacementOwner: "b22c0000-0000-4000-8000-000000000008",
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

function authenticatedReviewSql(
  actorId,
  requestId,
  idempotencyKey,
  decision = "reject",
) {
  return `
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    SELECT public.review_owner_opening_balance(
      '${ids.organization}', '${requestId}', '${decision}',
      'Concurrency ${decision} evidence', '${idempotencyKey}'
    ) ->> 'request_id';
  `;
}

function authenticatedCorrectionSql(
  actorId,
  entryId,
  amount,
  idempotencyKey,
) {
  return `
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    SELECT public.submit_owner_opening_balance_correction(
      '${ids.organization}', '${entryId}', ${amount},
      'Concurrency correction evidence', 'Concurrency correction source',
      NULL, repeat('b', 64), NULL, '${idempotencyKey}'
    ) ->> 'request_id';
  `;
}

function authenticatedRosterMutationSql(actorId, mutationKind) {
  if (mutationKind === "service_role_remove_owner_role") {
    return `
      SET LOCAL ROLE service_role;
      UPDATE public.person_roles
      SET status = 'inactive', archived_at = now()
      WHERE organization_id = '${ids.organization}'
        AND person_id = '${ids.owner}'
        AND role = 'owner';
    `;
  }

  const mutationSql = {
    archive_person: `SELECT public.archive_person('${ids.organization}', '${ids.owner}');`,
    remove_owner_role: `SELECT public.update_person(
      '${ids.owner}', '${ids.organization}', 'Opening concurrency owner', NULL,
      'individual', NULL, NULL, NULL, NULL, ARRAY['vendor']::text[]
    );`,
    direct_remove_owner_role: `UPDATE public.person_roles
      SET status = 'inactive', archived_at = now(), updated_by = '${actorId}'
      WHERE organization_id = '${ids.organization}'
        AND person_id = '${ids.owner}'
        AND role = 'owner';`,
    change_ownership_percent: `SELECT public.update_property(
      '${ids.property}', '${ids.organization}', 'Opening concurrency A', 'OCA',
      'Apartment', NULL, NULL, 'active', NULL, NULL,
      '${ids.owner}', '2026-01-01', 90.000
    );`,
    transfer_owner: `SELECT public.update_property(
      '${ids.property}', '${ids.organization}', 'Opening concurrency A', 'OCA',
      'Apartment', NULL, NULL, 'active', NULL, NULL,
      '${ids.replacementOwner}', '2026-08-01', 100.000
    );`,
    archive_property: `SELECT public.archive_property('${ids.property}', '${ids.organization}');`,
    direct_archive_property: `UPDATE public.properties
      SET archived_at = now(), archived_by = '${actorId}', updated_by = '${actorId}'
      WHERE organization_id = '${ids.organization}'
        AND id = '${ids.property}';`,
  }[mutationKind];
  assert.ok(mutationSql, `Unsupported roster mutation: ${mutationKind}`);

  return `
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${mutationSql}
  `;
}

function prepareRosterRaceApproval(container, requestKind, suffix) {
  run(container, `BEGIN;
    ${authenticatedSubmitSql(ids.financeMember, `roster-${suffix}-initial-submit`)}
    COMMIT;`);
  const initialRequestId = run(container, `
    SELECT id FROM public.owner_opening_balance_requests
    WHERE organization_id = '${ids.organization}'
      AND request_kind = 'initial'
      AND status = 'submitted';
  `);

  if (requestKind === "initial") {
    return { requestId: initialRequestId, expectedEntryCount: 1 };
  }

  run(container, `BEGIN;
    ${authenticatedReviewSql(
      ids.reviewer,
      initialRequestId,
      `roster-${suffix}-initial-approve`,
      "approve",
    )}
    COMMIT;`);
  const openingEntryId = run(container, `
    SELECT id FROM public.owner_opening_balance_entries
    WHERE request_id = '${initialRequestId}' AND entry_kind = 'opening';
  `);
  run(container, `BEGIN;
    ${authenticatedCorrectionSql(
      ids.financeMember,
      openingEntryId,
      "12.00",
      `roster-${suffix}-correction-submit`,
    )}
    COMMIT;`);
  const correctionRequestId = run(container, `
    SELECT id FROM public.owner_opening_balance_requests
    WHERE correction_of_entry_id = '${openingEntryId}' AND status = 'submitted';
  `);
  return { requestId: correctionRequestId, expectedEntryCount: 2 };
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
    VALUES
      ('${ids.owner}', '${ids.organization}', 'Opening concurrency owner'),
      ('${ids.replacementOwner}', '${ids.organization}', 'Replacement concurrency owner')
    ON CONFLICT (organization_id, id) DO NOTHING;

    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES
      ('${ids.organization}', '${ids.owner}', 'owner', 'active'),
      ('${ids.organization}', '${ids.replacementOwner}', 'owner', 'active');

    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, is_primary,
      ownership_percent, started_on
    ) VALUES (
      '${ids.propertyOwner}', '${ids.organization}', '${ids.property}',
      '${ids.owner}', true, 100.000, '2026-01-01'
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

test("owner opening approvals commit complete entry chains under races", async () => {
  const container = databaseContainer();
  cleanup(container);
  setup(container);

  try {
    run(container, `BEGIN;
      ${authenticatedSubmitSql(ids.financeMember, "approval-race-submit-0001")}
      COMMIT;`);
    const initialRequestId = run(container, `
      SELECT id
      FROM public.owner_opening_balance_requests
      WHERE organization_id = '${ids.organization}'
        AND component = 'ips_held_owner_cash'
        AND request_kind = 'initial'
        AND status = 'submitted';
    `);

    const initialApprovalRace = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       DO $barrier$ BEGIN RAISE NOTICE 'initial_approval_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedReviewSql(
         ids.reviewer,
         initialRequestId,
         "initial-approval-race-first",
         "approve",
       )}
       COMMIT;`,
      `BEGIN;
       ${authenticatedReviewSql(
         ids.submitterTwo,
         initialRequestId,
         "initial-approval-race-second",
         "approve",
       )}
       COMMIT;`,
      "initial_approval_ready",
    );
    assert.equal(initialApprovalRace.first.status, 0, initialApprovalRace.first.stderr);
    assert.equal(initialApprovalRace.second.status, 1);
    assert.match(initialApprovalRace.second.stderr, /only a submitted owner opening request/i);
    assert.doesNotMatch(
      `${initialApprovalRace.first.stderr}\n${initialApprovalRace.second.stderr}`,
      /deadlock detected/i,
    );
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE id = '${initialRequestId}' AND status = 'approved'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE request_id = '${initialRequestId}' AND entry_kind = 'opening')
        );
      `),
      "[1, 1]",
    );

    let currentEntryId = run(container, `
      SELECT id
      FROM public.owner_opening_balance_entries
      WHERE request_id = '${initialRequestId}' AND entry_kind = 'opening';
    `);
    run(container, `BEGIN;
      ${authenticatedCorrectionSql(
        ids.financeMember,
        currentEntryId,
        "15.00",
        "correction-approval-race-submit-0001",
      )}
      COMMIT;`);
    let correctionRequestId = run(container, `
      SELECT id
      FROM public.owner_opening_balance_requests
      WHERE correction_of_entry_id = '${currentEntryId}' AND status = 'submitted';
    `);

    const correctionApprovalRace = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       DO $barrier$ BEGIN RAISE NOTICE 'correction_approval_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedReviewSql(
         ids.reviewer,
         correctionRequestId,
         "correction-approval-race-first",
         "approve",
       )}
       COMMIT;`,
      `BEGIN;
       ${authenticatedReviewSql(
         ids.submitterTwo,
         correctionRequestId,
         "correction-approval-race-second",
         "approve",
       )}
       COMMIT;`,
      "correction_approval_ready",
    );
    assert.equal(correctionApprovalRace.first.status, 0, correctionApprovalRace.first.stderr);
    assert.equal(correctionApprovalRace.second.status, 1);
    assert.match(
      correctionApprovalRace.second.stderr,
      /only a submitted owner opening request|correction target is stale/i,
    );
    assert.doesNotMatch(
      `${correctionApprovalRace.first.stderr}\n${correctionApprovalRace.second.stderr}`,
      /deadlock detected/i,
    );
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE id = '${correctionRequestId}' AND status = 'approved'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE request_id = '${correctionRequestId}'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE request_id = '${correctionRequestId}'
              AND entry_kind = 'correction_reversal'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE request_id = '${correctionRequestId}'
              AND entry_kind = 'correction_replacement')
        );
      `),
      "[1, 2, 1, 1]",
    );

    currentEntryId = run(container, `
      SELECT id FROM public.owner_opening_balance_entries
      WHERE request_id = '${correctionRequestId}'
        AND entry_kind = 'correction_replacement';
    `);
    run(container, `BEGIN;
      ${authenticatedCorrectionSql(
        ids.financeMember,
        currentEntryId,
        "18.00",
        "approval-first-submit-0001",
      )}
      COMMIT;`);
    correctionRequestId = run(container, `
      SELECT id FROM public.owner_opening_balance_requests
      WHERE correction_of_entry_id = '${currentEntryId}' AND status = 'submitted';
    `);

    const approvalFirst = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       DO $barrier$ BEGIN RAISE NOTICE 'approval_first_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedReviewSql(
         ids.reviewer,
         correctionRequestId,
         "approval-first-review-0001",
         "approve",
       )}
       COMMIT;`,
      `BEGIN;
       ${authenticatedCorrectionSql(
         ids.submitterTwo,
         currentEntryId,
         "19.00",
         "approval-first-competing-submit",
       )}
       COMMIT;`,
      "approval_first_ready",
    );
    assert.equal(approvalFirst.first.status, 0, approvalFirst.first.stderr);
    assert.equal(approvalFirst.second.status, 1);
    assert.match(approvalFirst.second.stderr, /correction target is stale/i);
    assert.doesNotMatch(
      `${approvalFirst.first.stderr}\n${approvalFirst.second.stderr}`,
      /deadlock detected/i,
    );

    currentEntryId = run(container, `
      SELECT id FROM public.owner_opening_balance_entries
      WHERE request_id = '${correctionRequestId}'
        AND entry_kind = 'correction_replacement';
    `);
    run(container, `BEGIN;
      ${authenticatedCorrectionSql(
        ids.financeMember,
        currentEntryId,
        "21.00",
        "submission-first-submit-0001",
      )}
      COMMIT;`);
    correctionRequestId = run(container, `
      SELECT id FROM public.owner_opening_balance_requests
      WHERE correction_of_entry_id = '${currentEntryId}' AND status = 'submitted';
    `);

    const submissionFirst = await raceAfterMarker(
      container,
      `BEGIN;
       SELECT app_private.lock_owner_opening_property_month(
         '${ids.organization}', '${ids.property}', 'USD', '2026-08-01'
       );
       SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':',
         'owner_opening_authority_v1', '${ids.organization}', '${ids.property}',
         '${ids.owner}', 'USD', '2026-08-01', 'ips_held_owner_cash'), 0));
       SELECT id FROM public.owner_opening_balance_entries
         WHERE id = '${currentEntryId}' FOR UPDATE;
       DO $barrier$ BEGIN RAISE NOTICE 'submission_first_ready'; END $barrier$;
       SELECT pg_sleep(1.2);
       ${authenticatedCorrectionSql(
         ids.submitterTwo,
         currentEntryId,
         "22.00",
         "submission-first-competing-submit",
       )}
       COMMIT;`,
      `BEGIN;
       ${authenticatedReviewSql(
         ids.reviewer,
         correctionRequestId,
         "submission-first-review-0001",
         "approve",
       )}
       COMMIT;`,
      "submission_first_ready",
    );
    assert.equal(submissionFirst.first.status, 1);
    assert.match(submissionFirst.first.stderr, /correction request is already submitted/i);
    assert.equal(submissionFirst.second.status, 0, submissionFirst.second.stderr);
    assert.doesNotMatch(
      `${submissionFirst.first.stderr}\n${submissionFirst.second.stderr}`,
      /deadlock detected/i,
    );

    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE organization_id = '${ids.organization}' AND status = 'submitted'),
          (SELECT count(*) FROM public.owner_opening_balance_requests
            WHERE organization_id = '${ids.organization}' AND status = 'approved'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
            WHERE organization_id = '${ids.organization}'),
          (SELECT count(*) FROM public.owner_opening_balance_requests AS request
            WHERE request.organization_id = '${ids.organization}'
              AND request.status = 'approved'
              AND request.request_kind = 'correction'
              AND 2 <> (SELECT count(*) FROM public.owner_opening_balance_entries AS entry
                WHERE entry.request_id = request.id))
        );
      `),
      "[0, 4, 7, 0]",
    );
  } finally {
    cleanup(container);
  }
});

test("owner opening approval serializes every current-roster mutation", async () => {
  const container = databaseContainer();
  const requestKinds = ["initial", "correction"];
  const mutationKinds = [
    "archive_person",
    "remove_owner_role",
    "direct_remove_owner_role",
    "service_role_remove_owner_role",
    "change_ownership_percent",
    "transfer_owner",
    "archive_property",
    "direct_archive_property",
  ];
  const startOrders = ["mutation_first", "approval_first"];

  cleanup(container);
  try {
    for (const requestKind of requestKinds) {
      for (const mutationKind of mutationKinds) {
        for (const startOrder of startOrders) {
          cleanup(container);
          setup(container);
          const suffix = `${requestKind}-${mutationKind}-${startOrder}`;
          const { requestId, expectedEntryCount } = prepareRosterRaceApproval(
            container,
            requestKind,
            suffix,
          );
          const reviewSql = authenticatedReviewSql(
            ids.reviewer,
            requestId,
            `roster-${suffix}-review`,
            "approve",
          );
          const mutationSql = authenticatedRosterMutationSql(
            ids.submitterTwo,
            mutationKind,
          );
          const firstSql = startOrder === "mutation_first"
            ? `BEGIN;
               ${mutationSql}
               DO $barrier$ BEGIN RAISE NOTICE 'roster_mutation_ready'; END $barrier$;
               SELECT pg_sleep(0.8);
               COMMIT;`
            : `BEGIN;
               ${reviewSql}
               DO $barrier$ BEGIN RAISE NOTICE 'roster_approval_ready'; END $barrier$;
               SELECT pg_sleep(0.8);
               COMMIT;`;
          const secondSql = startOrder === "mutation_first"
            ? `BEGIN; ${reviewSql} COMMIT;`
            : `BEGIN; ${mutationSql} COMMIT;`;
          const marker = startOrder === "mutation_first"
            ? "roster_mutation_ready"
            : "roster_approval_ready";

          const race = await raceAfterMarker(
            container,
            firstSql,
            secondSql,
            marker,
          );
          assert.equal(
            race.first.status,
            0,
            `${suffix}: ${race.first.stderr}`,
          );
          assert.ok(
            race.secondElapsedMs >= 500,
            `${suffix}: mutation boundary did not wait (${race.secondElapsedMs}ms)`,
          );
          assert.doesNotMatch(
            `${race.first.stderr}\n${race.second.stderr}`,
            /deadlock detected/i,
            suffix,
          );

          if (startOrder === "mutation_first") {
            assert.equal(
              race.second.status,
              1,
              `${suffix}: stale approval unexpectedly committed`,
            );
            assert.match(
              race.second.stderr,
              /owner_roster_property_not_found|owner_roster_missing|owner_share_total_not_100|owner_person_inactive|ownership_roster_changed/i,
              suffix,
            );
            assert.equal(
              run(container, `
                SELECT jsonb_build_array(
                  (SELECT count(*) FROM public.owner_opening_balance_requests
                    WHERE id = '${requestId}' AND status = 'submitted'),
                  (SELECT count(*) FROM public.owner_opening_balance_entries
                    WHERE request_id = '${requestId}')
                );
              `),
              "[1, 0]",
              suffix,
            );
          } else {
            assert.equal(
              race.second.status,
              0,
              `${suffix}: ${race.second.stderr}`,
            );
            assert.equal(
              run(container, `
                SELECT jsonb_build_array(
                  (SELECT count(*) FROM public.owner_opening_balance_requests
                    WHERE id = '${requestId}' AND status = 'approved'),
                  (SELECT count(*) FROM public.owner_opening_balance_entries
                    WHERE request_id = '${requestId}')
                );
              `),
              `[1, ${expectedEntryCount}]`,
              suffix,
            );
          }
        }
      }
    }
  } finally {
    cleanup(container);
  }
});
