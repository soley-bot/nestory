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

    first.stderr.on("data", (chunk) => { firstStderr += chunk; });
    first.stdout.on("data", (chunk) => {
      firstStdout += chunk;
      if (!launched && firstStdout.includes("writer_ready")) {
        launched = true;
        secondResult = spawnSync("docker", psqlArgs(container, secondSql), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: false,
        });
      }
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
      effective_date, component, request_kind, proposed_amount, status, reason,
      source_reference, evidence_sha256, payload_hash, submitted_by,
      reviewed_at, reviewed_by
    ) VALUES (
      'a2120000-0000-4000-8000-000000000008', '${ids.organization}',
      '${ids.property}', '${ids.owner}', '${ids.propertyOwner}', 100.000,
      repeat('a', 64), 'USD', '2026-08-01', 'owner_due_to_ips', 'initial',
      0.00, 'approved', 'Correction concurrency seed',
      'IPS cutover correction concurrency seed', repeat('c', 64),
      repeat('d', 64), '${ids.submitter}', now(), '${ids.reviewer}'
    ) ON CONFLICT (id) DO NOTHING;
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

  run(container, `
    SET session_replication_role = replica;
    DELETE FROM public.owner_opening_balance_requests
    WHERE organization_id = '${ids.organization}';
    DELETE FROM public.property_owners WHERE organization_id = '${ids.organization}';
    DELETE FROM public.person_roles WHERE organization_id = '${ids.organization}';
    DELETE FROM public.people WHERE organization_id = '${ids.organization}';
    DELETE FROM public.properties WHERE organization_id = '${ids.organization}';
    DELETE FROM public.financial_reconciliation_sources WHERE organization_id = '${ids.organization}';
    DELETE FROM public.organizations WHERE id = '${ids.organization}';
    DELETE FROM auth.users WHERE id = '${ids.submitter}';
    DELETE FROM auth.users WHERE id = '${ids.reviewer}';
    SET session_replication_role = origin;
  `);
});
