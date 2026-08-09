import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

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

function cleanupOwnerOpeningTestOrganization(container, organizationId, actorIds) {
  run(container, `
    BEGIN;
    ALTER TABLE public.owner_opening_balance_entries
      DISABLE TRIGGER guard_owner_opening_balance_entry_immutable;
    ALTER TABLE public.owner_opening_balance_requests
      DISABLE TRIGGER guard_owner_opening_balance_request_mutation;
    DELETE FROM public.owner_opening_balance_entries
    WHERE organization_id = '${organizationId}'
      AND entry_kind <> 'opening';
    DELETE FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}'
      AND request_kind = 'correction';
    DELETE FROM public.owner_opening_balance_entries
    WHERE organization_id = '${organizationId}';
    DELETE FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}';
    ALTER TABLE public.owner_opening_balance_requests
      ENABLE TRIGGER guard_owner_opening_balance_request_mutation;
    ALTER TABLE public.owner_opening_balance_entries
      ENABLE TRIGGER guard_owner_opening_balance_entry_immutable;
    DELETE FROM public.property_owners WHERE organization_id = '${organizationId}';
    DELETE FROM public.person_roles WHERE organization_id = '${organizationId}';
    DELETE FROM public.people WHERE organization_id = '${organizationId}';
    DELETE FROM public.properties WHERE organization_id = '${organizationId}';
    ALTER TABLE public.financial_reconciliation_sources
      DISABLE TRIGGER enforce_financial_reconciliation_source_mutation;
    DELETE FROM public.financial_reconciliation_sources
    WHERE organization_id = '${organizationId}';
    ALTER TABLE public.financial_reconciliation_sources
      ENABLE TRIGGER enforce_financial_reconciliation_source_mutation;
    DELETE FROM public.organizations WHERE id = '${organizationId}';
    DELETE FROM auth.users WHERE id IN (${actorIds.map((id) => `'${id}'`).join(", ")});
    COMMIT;
  `);

  assert.equal(
    run(container, `
      SELECT jsonb_build_array(
        (SELECT count(*) FROM public.owner_opening_balance_requests
         WHERE organization_id = '${organizationId}'),
        (SELECT count(*) FROM public.owner_opening_balance_entries
         WHERE organization_id = '${organizationId}'),
        (SELECT count(*) FROM public.owner_opening_balance_entries AS entry
         WHERE entry.organization_id = '${organizationId}'
           AND NOT EXISTS (
             SELECT 1
             FROM public.owner_opening_balance_requests AS request
             WHERE request.id = entry.request_id
           ))
      )
    `),
    "[0, 0, 0]",
    "isolated cleanup must leave no requests, entries, or orphan entries",
  );
}

function raceAgainstUncommittedWriter(container, firstSql, secondSql) {
  return new Promise((resolve, reject) => {
    const first = spawn("docker", psqlArgs(container, firstSql), {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    let firstStdout = "";
    let firstStderr = "";
    let secondResult;
    let launched = false;

    function launchSecondWhenReady(output) {
      if (!launched && output.includes("writer_ready")) {
        launched = true;
        secondResult = spawnSync("docker", psqlArgs(container, secondSql), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: false,
        });
      }
    }

    first.stderr.on("data", (chunk) => {
      firstStderr += chunk;
      launchSecondWhenReady(firstStderr);
    });
    first.stdout.on("data", (chunk) => {
      firstStdout += chunk;
      launchSecondWhenReady(firstStdout);
    });
    first.on("error", reject);
    first.on("close", (status) => {
      try {
        assert.equal(
          launched,
          true,
          `writer marker missing: ${firstStdout}\n${firstStderr}`,
        );
        resolve({
          first: { status, stdout: firstStdout, stderr: firstStderr },
          second: secondResult,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

const ids = {
  organization: "a2120000-0000-4000-8000-000000000001",
  property: "a2120000-0000-4000-8000-000000000002",
  owner: "a2120000-0000-4000-8000-000000000003",
  propertyOwner: "a2120000-0000-4000-8000-000000000004",
  submitter: "a2120000-0000-4000-8000-000000000005",
  correctionTarget: "a2120000-0000-4000-8000-000000000006",
  reviewer: "a2120000-0000-4000-8000-000000000007",
};

const staleRaceIds = {
  organization: "a2130000-0000-4000-8000-000000000001",
  property: "a2130000-0000-4000-8000-000000000002",
  owner: "a2130000-0000-4000-8000-000000000003",
  propertyOwner: "a2130000-0000-4000-8000-000000000004",
  submitter: "a2130000-0000-4000-8000-000000000005",
  reviewer: "a2130000-0000-4000-8000-000000000006",
  approvalFirstOpeningRequest: "a2130000-0000-4000-8000-000000000011",
  approvalFirstTarget: "a2130000-0000-4000-8000-000000000012",
  approvalFirstCorrectionA: "a2130000-0000-4000-8000-000000000013",
  approvalFirstCorrectionB: "a2130000-0000-4000-8000-000000000014",
  approvalFirstReversal: "a2130000-0000-4000-8000-000000000015",
  approvalFirstReplacement: "a2130000-0000-4000-8000-000000000016",
  submissionFirstOpeningRequest: "a2130000-0000-4000-8000-000000000021",
  submissionFirstTarget: "a2130000-0000-4000-8000-000000000022",
  submissionFirstCorrectionA: "a2130000-0000-4000-8000-000000000023",
  submissionFirstCorrectionB: "a2130000-0000-4000-8000-000000000024",
  submissionFirstReversal: "a2130000-0000-4000-8000-000000000025",
  submissionFirstReplacement: "a2130000-0000-4000-8000-000000000026",
};

function requestInsert({ id, component, kind, correctionTarget = null }) {
  return `
    INSERT INTO public.owner_opening_balance_requests (
      id, organization_id, property_id, owner_person_id, property_owner_id,
      ownership_percent_snapshot, ownership_roster_hash, currency,
      effective_date, component, request_kind, proposed_amount,
      correction_of_entry_id, reason, source_reference, evidence_sha256,
      payload_hash, submitted_by
    ) VALUES (
      '${id}', '${ids.organization}', '${ids.property}', '${ids.owner}',
      '${ids.propertyOwner}', 100.000, repeat('a', 64), 'USD',
      '2026-08-01', '${component}', '${kind}', 0.00,
      ${correctionTarget ? `'${correctionTarget}'` : "NULL"},
      'Concurrency authority evidence', 'IPS cutover manifest concurrency',
      repeat('b', 64), repeat('${id.slice(-1)}', 64), '${ids.submitter}'
    )`;
}

test("two sessions enforce one submitted initial key and one submitted correction target", async () => {
  const container = databaseContainer();

  run(container, `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', '${ids.submitter}',
      'authenticated', 'authenticated', 'owner-opening-concurrency@example.test',
      extensions.crypt('owner-opening-concurrency', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', '${ids.reviewer}',
      'authenticated', 'authenticated', 'owner-opening-reviewer@example.test',
      extensions.crypt('owner-opening-concurrency', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    ) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${ids.organization}', 'Owner opening concurrency', 'owner-opening-concurrency')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES ('${ids.property}', '${ids.organization}', 'Concurrency property', 'OPEN-CONC', 'Apartment')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${ids.owner}', '${ids.organization}', 'Concurrency owner')
    ON CONFLICT (organization_id, id) DO NOTHING;
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${ids.organization}', '${ids.owner}', 'owner', 'active')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${ids.propertyOwner}', '${ids.organization}', '${ids.property}',
      '${ids.owner}', 100.000, '2026-08-01'
    ) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.owner_opening_balance_requests (
      id, organization_id, property_id, owner_person_id, property_owner_id,
      ownership_percent_snapshot, ownership_roster_hash, currency,
      effective_date, component, request_kind, proposed_amount, reason,
      source_reference, evidence_sha256, payload_hash, submitted_by
    ) VALUES (
      'a2120000-0000-4000-8000-000000000008', '${ids.organization}',
      '${ids.property}', '${ids.owner}', '${ids.propertyOwner}', 100.000,
      repeat('a', 64), 'USD', '2026-08-01', 'owner_due_to_ips', 'initial',
      0.00, 'Correction concurrency seed',
      'IPS cutover correction concurrency seed', repeat('c', 64),
      repeat('d', 64), '${ids.submitter}'
    ) ON CONFLICT (id) DO NOTHING;
    SELECT set_config(
      'app.owner_opening_request_review_context',
      'checked-review-v1',
      true
    );
    UPDATE public.owner_opening_balance_requests
    SET status = 'approved', reviewed_at = now(), reviewed_by = '${ids.reviewer}'
    WHERE id = 'a2120000-0000-4000-8000-000000000008';
    INSERT INTO public.owner_opening_balance_entries (
      id, request_id, organization_id, property_id, owner_person_id,
      property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
      currency, effective_date, component, entry_kind, signed_amount, created_by
    ) VALUES (
      '${ids.correctionTarget}', 'a2120000-0000-4000-8000-000000000008',
      '${ids.organization}', '${ids.property}', '${ids.owner}',
      '${ids.propertyOwner}', 100.000, repeat('a', 64), 'USD', '2026-08-01',
      'owner_due_to_ips', 'opening', 0.00, '${ids.reviewer}'
    ) ON CONFLICT (id) DO NOTHING;
  `);

  const initialRace = await raceAgainstUncommittedWriter(
    container,
    `BEGIN; ${requestInsert({
      id: "a2120000-0000-4000-8000-000000000011",
      component: "ips_held_owner_cash",
      kind: "initial",
    })}; SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
    `${requestInsert({
      id: "a2120000-0000-4000-8000-000000000012",
      component: "ips_held_owner_cash",
      kind: "initial",
    })};`,
  );
  assert.deepEqual(
    [initialRace.first.status, initialRace.second.status].sort(),
    [0, 1],
  );
  assert.match(
    `${initialRace.first.stderr}\n${initialRace.second.stderr}`,
    /owner_opening_balance_requests_submitted_initial_uidx/i,
  );
  assert.equal(
    run(container, `
      SELECT count(*)
      FROM public.owner_opening_balance_requests
      WHERE organization_id = '${ids.organization}'
        AND component = 'ips_held_owner_cash'
        AND status = 'submitted'
    `),
    "1",
  );

  const correctionRace = await raceAgainstUncommittedWriter(
    container,
    `BEGIN; ${requestInsert({
      id: "a2120000-0000-4000-8000-000000000021",
      component: "owner_due_to_ips",
      kind: "correction",
      correctionTarget: ids.correctionTarget,
    })}; SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
    `${requestInsert({
      id: "a2120000-0000-4000-8000-000000000022",
      component: "owner_due_to_ips",
      kind: "correction",
      correctionTarget: ids.correctionTarget,
    })};`,
  );
  assert.deepEqual(
    [correctionRace.first.status, correctionRace.second.status].sort(),
    [0, 1],
  );
  assert.match(
    `${correctionRace.first.stderr}\n${correctionRace.second.stderr}`,
    /owner_opening_balance_requests_submitted_correction_uidx/i,
  );
  assert.equal(
    run(container, `
      SELECT count(*)
      FROM public.owner_opening_balance_requests
      WHERE correction_of_entry_id = '${ids.correctionTarget}'
        AND status = 'submitted'
    `),
    "1",
  );

  cleanupOwnerOpeningTestOrganization(
    container,
    ids.organization,
    [ids.submitter, ids.reviewer],
  );
});

test("valid correction approval and new submission use one deadlock-free target-first order", async () => {
  const container = databaseContainer();
  const race = staleRaceIds;

  const correctionInsert = ({ id, target, component, amount, hash }) => `
    INSERT INTO public.owner_opening_balance_requests (
      id, organization_id, property_id, owner_person_id, property_owner_id,
      ownership_percent_snapshot, ownership_roster_hash, currency,
      effective_date, component, request_kind, proposed_amount,
      correction_of_entry_id, reason, source_reference, evidence_sha256,
      payload_hash, submitted_by
    ) VALUES (
      '${id}', '${race.organization}', '${race.property}', '${race.owner}',
      '${race.propertyOwner}', 100.000, repeat('a', 64), 'USD', '2026-08-01',
      '${component}', 'correction', ${amount}, '${target}',
      'Concurrent correction evidence', 'IPS cutover correction race',
      repeat('${hash}', 64), repeat('${hash}', 64), '${race.submitter}'
    )`;

  const approvalTransaction = ({
    request,
    target,
    reversal,
    replacement,
    component,
    originalAmount,
    replacementAmount,
    markAfterUpdate = false,
  }) => `
    BEGIN;
    SET LOCAL statement_timeout = '8s';
    SELECT set_config(
      'app.owner_opening_request_review_context',
      'checked-review-v1',
      true
    );
    UPDATE public.owner_opening_balance_requests
    SET status = 'approved', reviewed_at = now(), reviewed_by = '${race.reviewer}'
    WHERE id = '${request}';
    ${markAfterUpdate ? "SELECT 'writer_ready'; SELECT pg_sleep(1);" : ""}
    INSERT INTO public.owner_opening_balance_entries (
      id, request_id, organization_id, property_id, owner_person_id,
      property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
      currency, effective_date, component, entry_kind, signed_amount,
      reversal_of_entry_id, created_by
    ) VALUES (
      '${reversal}', '${request}', '${race.organization}', '${race.property}',
      '${race.owner}', '${race.propertyOwner}', 100.000, repeat('a', 64),
      'USD', '2026-08-01', '${component}', 'correction_reversal',
      -${originalAmount}, '${target}', '${race.reviewer}'
    );
    INSERT INTO public.owner_opening_balance_entries (
      id, request_id, organization_id, property_id, owner_person_id,
      property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
      currency, effective_date, component, entry_kind, signed_amount, created_by
    ) VALUES (
      '${replacement}', '${request}', '${race.organization}', '${race.property}',
      '${race.owner}', '${race.propertyOwner}', 100.000, repeat('a', 64),
      'USD', '2026-08-01', '${component}', 'correction_replacement',
      ${replacementAmount}, '${race.reviewer}'
    );
    COMMIT;`;

  run(container, `
    BEGIN;
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', '${race.submitter}',
      'authenticated', 'authenticated', 'owner-opening-race-submit@example.test',
      extensions.crypt('owner-opening-race', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', '${race.reviewer}',
      'authenticated', 'authenticated', 'owner-opening-race-review@example.test',
      extensions.crypt('owner-opening-race', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    );
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${race.organization}', 'Owner opening approval race', 'owner-opening-approval-race');
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES ('${race.property}', '${race.organization}', 'Approval race property', 'OPEN-RACE', 'Apartment');
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${race.owner}', '${race.organization}', 'Approval race owner');
    INSERT INTO public.person_roles (organization_id, person_id, role, status)
    VALUES ('${race.organization}', '${race.owner}', 'owner', 'active');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${race.propertyOwner}', '${race.organization}', '${race.property}',
      '${race.owner}', 100.000, '2026-08-01'
    );
    INSERT INTO public.owner_opening_balance_requests (
      id, organization_id, property_id, owner_person_id, property_owner_id,
      ownership_percent_snapshot, ownership_roster_hash, currency,
      effective_date, component, request_kind, proposed_amount, reason,
      source_reference, evidence_sha256, payload_hash, submitted_by
    ) VALUES
    (
      '${race.approvalFirstOpeningRequest}', '${race.organization}',
      '${race.property}', '${race.owner}', '${race.propertyOwner}', 100.000,
      repeat('a', 64), 'USD', '2026-08-01', 'ips_due_to_owner', 'initial',
      10.00, 'Approval-first opening', 'IPS cutover approval-first source',
      repeat('1', 64), repeat('2', 64), '${race.submitter}'
    ),
    (
      '${race.submissionFirstOpeningRequest}', '${race.organization}',
      '${race.property}', '${race.owner}', '${race.propertyOwner}', 100.000,
      repeat('a', 64), 'USD', '2026-08-01', 'security_deposit_custody', 'initial',
      20.00, 'Submission-first opening', 'IPS cutover submission-first source',
      repeat('3', 64), repeat('4', 64), '${race.submitter}'
    );
    SELECT set_config(
      'app.owner_opening_request_review_context',
      'checked-review-v1',
      true
    );
    UPDATE public.owner_opening_balance_requests
    SET status = 'approved', reviewed_at = now(), reviewed_by = '${race.reviewer}'
    WHERE id IN (
      '${race.approvalFirstOpeningRequest}',
      '${race.submissionFirstOpeningRequest}'
    );
    INSERT INTO public.owner_opening_balance_entries (
      id, request_id, organization_id, property_id, owner_person_id,
      property_owner_id, ownership_percent_snapshot, ownership_roster_hash,
      currency, effective_date, component, entry_kind, signed_amount, created_by
    ) VALUES
    (
      '${race.approvalFirstTarget}', '${race.approvalFirstOpeningRequest}',
      '${race.organization}', '${race.property}', '${race.owner}',
      '${race.propertyOwner}', 100.000, repeat('a', 64), 'USD', '2026-08-01',
      'ips_due_to_owner', 'opening', 10.00, '${race.reviewer}'
    ),
    (
      '${race.submissionFirstTarget}', '${race.submissionFirstOpeningRequest}',
      '${race.organization}', '${race.property}', '${race.owner}',
      '${race.propertyOwner}', 100.000, repeat('a', 64), 'USD', '2026-08-01',
      'security_deposit_custody', 'opening', 20.00, '${race.reviewer}'
    );
    ${correctionInsert({
      id: race.approvalFirstCorrectionA,
      target: race.approvalFirstTarget,
      component: "ips_due_to_owner",
      amount: "7.00",
      hash: "5",
    })};
    ${correctionInsert({
      id: race.submissionFirstCorrectionA,
      target: race.submissionFirstTarget,
      component: "security_deposit_custody",
      amount: "17.00",
      hash: "6",
    })};
    COMMIT;
  `);

  try {
    const approvalFirst = await raceAgainstUncommittedWriter(
      container,
      approvalTransaction({
        request: race.approvalFirstCorrectionA,
        target: race.approvalFirstTarget,
        reversal: race.approvalFirstReversal,
        replacement: race.approvalFirstReplacement,
        component: "ips_due_to_owner",
        originalAmount: "10.00",
        replacementAmount: "7.00",
        markAfterUpdate: true,
      }),
      correctionInsert({
        id: race.approvalFirstCorrectionB,
        target: race.approvalFirstTarget,
        component: "ips_due_to_owner",
        amount: "6.00",
        hash: "7",
      }),
    );
    const approvalFirstErrors =
      `${approvalFirst.first.stderr}\n${approvalFirst.second.stderr}`;
    assert.doesNotMatch(approvalFirstErrors, /deadlock detected/i);
    assert.deepEqual(
      [approvalFirst.first.status, approvalFirst.second.status],
      [0, 1],
    );
    assert.match(approvalFirst.second.stderr, /correction target is stale/i);
    assert.equal(
      run(container, `
        SELECT concat_ws('|',
          count(*) FILTER (WHERE request.status = 'submitted'),
          max(request.status) FILTER (WHERE request.id = '${race.approvalFirstCorrectionA}'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
           WHERE request_id = '${race.approvalFirstCorrectionA}'),
          (SELECT current_amount::text
           FROM public.owner_opening_balance_known_authority_v1
           WHERE organization_id = '${race.organization}'
             AND component = 'ips_due_to_owner')
        )
        FROM public.owner_opening_balance_requests AS request
        WHERE request.correction_of_entry_id = '${race.approvalFirstTarget}'
      `),
      "0|approved|2|7.00",
    );

    run(container, `
      CREATE OR REPLACE FUNCTION app_private.pause_owner_opening_submission_test()
      RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
      BEGIN
        IF NEW.id = '${race.submissionFirstCorrectionB}' THEN
          RAISE NOTICE 'writer_ready';
          PERFORM pg_sleep(1);
        END IF;
        RETURN NEW;
      END;
      $$;
      REVOKE ALL ON FUNCTION app_private.pause_owner_opening_submission_test()
        FROM PUBLIC, anon, authenticated, service_role;
      CREATE TRIGGER guard_owner_opening_balance_correction_target_zz_test_pause
        BEFORE INSERT ON public.owner_opening_balance_requests
        FOR EACH ROW
        EXECUTE FUNCTION app_private.pause_owner_opening_submission_test();
    `);

    const submissionFirst = await raceAgainstUncommittedWriter(
      container,
      correctionInsert({
        id: race.submissionFirstCorrectionB,
        target: race.submissionFirstTarget,
        component: "security_deposit_custody",
        amount: "16.00",
        hash: "8",
      }),
      approvalTransaction({
        request: race.submissionFirstCorrectionA,
        target: race.submissionFirstTarget,
        reversal: race.submissionFirstReversal,
        replacement: race.submissionFirstReplacement,
        component: "security_deposit_custody",
        originalAmount: "20.00",
        replacementAmount: "17.00",
      }),
    );
    const submissionFirstErrors =
      `${submissionFirst.first.stderr}\n${submissionFirst.second.stderr}`;
    assert.doesNotMatch(submissionFirstErrors, /deadlock detected/i);
    assert.deepEqual(
      [submissionFirst.first.status, submissionFirst.second.status],
      [1, 0],
    );
    assert.match(
      submissionFirst.first.stderr,
      /owner_opening_balance_requests_submitted_correction_uidx/i,
    );
    assert.equal(
      run(container, `
        SELECT concat_ws('|',
          count(*) FILTER (WHERE request.status = 'submitted'),
          max(request.status) FILTER (WHERE request.id = '${race.submissionFirstCorrectionA}'),
          (SELECT count(*) FROM public.owner_opening_balance_entries
           WHERE request_id = '${race.submissionFirstCorrectionA}'),
          (SELECT current_amount::text
           FROM public.owner_opening_balance_known_authority_v1
           WHERE organization_id = '${race.organization}'
             AND component = 'security_deposit_custody')
        )
        FROM public.owner_opening_balance_requests AS request
        WHERE request.correction_of_entry_id = '${race.submissionFirstTarget}'
      `),
      "0|approved|2|17.00",
    );
  } finally {
    run(container, `
      DROP TRIGGER IF EXISTS guard_owner_opening_balance_correction_target_zz_test_pause
        ON public.owner_opening_balance_requests;
      DROP FUNCTION IF EXISTS app_private.pause_owner_opening_submission_test();
    `);
    cleanupOwnerOpeningTestOrganization(
      container,
      race.organization,
      [race.submitter, race.reviewer],
    );
  }
});
