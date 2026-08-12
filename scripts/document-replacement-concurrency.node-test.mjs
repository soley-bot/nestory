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

function raceAgainstHeldDocumentLock(container, firstSql, secondSql) {
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

    function launchSecond(output) {
      if (!launched && output.includes("writer_ready")) {
        launched = true;
        secondResult = spawnSync("docker", psqlArgs(container, secondSql), {
          cwd: repoRoot,
          encoding: "utf8",
          shell: false,
        });
      }
    }

    first.stdout.on("data", (chunk) => {
      firstStdout += chunk;
      launchSecond(firstStdout);
    });
    first.stderr.on("data", (chunk) => {
      firstStderr += chunk;
      launchSecond(firstStderr);
    });
    first.on("error", reject);
    first.on("close", (status) => {
      try {
        assert.equal(launched, true, `writer marker missing: ${firstStdout}\n${firstStderr}`);
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

function ids(prefix) {
  return {
    organization: `${prefix}0000-0000-4000-8000-000000000001`,
    property: `${prefix}0000-0000-4000-8000-000000000002`,
    owner: `${prefix}0000-0000-4000-8000-000000000003`,
    propertyOwner: `${prefix}0000-0000-4000-8000-000000000004`,
    actor: `${prefix}0000-0000-4000-8000-000000000005`,
    sourceDocument: `${prefix}0000-0000-4000-8000-000000000006`,
    request: `${prefix}0000-0000-4000-8000-000000000007`,
  };
}

function setupSql(state, slug) {
  const sourcePath = `${state.organization}/documents/source.pdf`;
  const replacementPath = `${state.organization}/documents/replacement.pdf`;
  return `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', '${state.actor}',
      'authenticated', 'authenticated', '${slug}@example.test',
      extensions.crypt('document-race', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    );
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${state.organization}', 'Document replacement race', '${slug}');
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES ('${state.organization}', '${state.actor}', 'super_admin');
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES ('${state.property}', '${state.organization}', 'Race property', '${slug}', 'Apartment');
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('${state.owner}', '${state.organization}', 'Race owner');
    INSERT INTO public.property_owners (
      id, organization_id, property_id, person_id, ownership_percent, started_on
    ) VALUES (
      '${state.propertyOwner}', '${state.organization}', '${state.property}',
      '${state.owner}', 100.000, '2026-08-01'
    );
    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('nestory-documents', '${sourcePath}'),
      ('nestory-documents', '${replacementPath}');
    SELECT set_config('app.document_content_write_context', 'checked-v1', true);
    INSERT INTO public.documents (
      id, organization_id, property_id, category, file_name, storage_path,
      mime_type, size_bytes, content_sha256, uploaded_by
    ) VALUES (
      '${state.sourceDocument}', '${state.organization}', '${state.property}',
      'owner_opening_balance_evidence', 'source.pdf', '${sourcePath}',
      'application/pdf', 10, repeat('a', 64), '${state.actor}'
    );
    SELECT set_config('app.document_content_write_context', 'off', true);
  `;
}

function referenceInsert(state) {
  return `
    INSERT INTO public.owner_opening_balance_requests (
      id, organization_id, property_id, owner_person_id, property_owner_id,
      ownership_percent_snapshot, ownership_roster_hash, currency,
      effective_date, component, request_kind, proposed_amount, status, reason,
      supporting_document_id, evidence_sha256, payload_hash, submitted_by
    ) VALUES (
      '${state.request}', '${state.organization}', '${state.property}',
      '${state.owner}', '${state.propertyOwner}', 100.000, repeat('b', 64),
      'USD', '2026-08-01', 'ips_held_owner_cash', 'initial', 0.00,
      'submitted', 'Concurrent opening evidence', '${state.sourceDocument}',
      repeat('a', 64), repeat('c', 64), '${state.actor}'
    );
  `;
}

function replacementCall(state) {
  const replacementPath = `${state.organization}/documents/replacement.pdf`;
  return `
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${state.actor}', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
    SELECT public.replace_document(
      '${state.sourceDocument}', '${state.organization}',
      'owner_opening_balance_evidence', 'replacement.pdf', '${replacementPath}',
      'application/pdf', 11, repeat('d', 64), '${state.property}'
    );
  `;
}

function cleanup(container, state) {
  run(container, `
    BEGIN;
    ALTER TABLE public.owner_opening_balance_requests
      DISABLE TRIGGER guard_owner_opening_balance_request_mutation;
    DELETE FROM public.owner_opening_balance_requests
    WHERE organization_id = '${state.organization}';
    ALTER TABLE public.owner_opening_balance_requests
      ENABLE TRIGGER guard_owner_opening_balance_request_mutation;
    ALTER TABLE public.documents
      DISABLE TRIGGER guard_document_content_fingerprint;
    DELETE FROM public.documents WHERE organization_id = '${state.organization}';
    ALTER TABLE public.documents
      ENABLE TRIGGER guard_document_content_fingerprint;
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
    WHERE bucket_id = 'nestory-documents'
      AND name LIKE '${state.organization}/%';
    DELETE FROM public.property_owners WHERE organization_id = '${state.organization}';
    DELETE FROM public.people WHERE organization_id = '${state.organization}';
    DELETE FROM public.properties WHERE organization_id = '${state.organization}';
    ALTER TABLE public.financial_reconciliation_sources
      DISABLE TRIGGER enforce_financial_reconciliation_source_mutation;
    DELETE FROM public.financial_reconciliation_sources
    WHERE organization_id = '${state.organization}';
    ALTER TABLE public.financial_reconciliation_sources
      ENABLE TRIGGER enforce_financial_reconciliation_source_mutation;
    DELETE FROM public.organizations WHERE id = '${state.organization}';
    DELETE FROM auth.users WHERE id = '${state.actor}';
    COMMIT;
  `);

  assert.equal(
    run(container, `
      SELECT jsonb_build_array(
        (SELECT count(*) FROM public.documents WHERE organization_id = '${state.organization}'),
        (SELECT count(*) FROM public.owner_opening_balance_requests WHERE organization_id = '${state.organization}'),
        (SELECT count(*) FROM storage.objects WHERE name LIKE '${state.organization}/%')
      )
    `),
    "[0, 0, 0]",
    "isolated document race cleanup must leave no rows or objects",
  );
}

test("document replacement and opening reference serialize in both start orders", async () => {
  const container = databaseContainer();
  const referenceFirst = ids("a22a");
  const replacementFirst = ids("a22b");

  try {
    run(container, setupSql(referenceFirst, "document-race-reference-first"));
    const firstRace = await raceAgainstHeldDocumentLock(
      container,
      `BEGIN; ${referenceInsert(referenceFirst)} SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
      `BEGIN; ${replacementCall(referenceFirst)} COMMIT;`,
    );
    assert.equal(firstRace.first.status, 0, firstRace.first.stderr);
    assert.notEqual(firstRace.second.status, 0, firstRace.second.stderr);
    assert.match(firstRace.second.stderr, /immutable while referenced/);
    assert.doesNotMatch(firstRace.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests WHERE id = '${referenceFirst.request}'),
          (SELECT count(*) FROM public.documents WHERE id = '${referenceFirst.sourceDocument}' AND archived_at IS NULL),
          (SELECT count(*) FROM public.documents WHERE storage_path = '${referenceFirst.organization}/documents/replacement.pdf')
        )
      `),
      "[1, 1, 0]",
    );

    run(container, setupSql(replacementFirst, "document-race-replacement-first"));
    const secondRace = await raceAgainstHeldDocumentLock(
      container,
      `BEGIN; ${replacementCall(replacementFirst)} SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
      `BEGIN; ${referenceInsert(replacementFirst)} COMMIT;`,
    );
    assert.equal(secondRace.first.status, 0, secondRace.first.stderr);
    assert.notEqual(secondRace.second.status, 0, secondRace.second.stderr);
    assert.match(secondRace.second.stderr, /Opening evidence document is not eligible/);
    assert.doesNotMatch(secondRace.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.owner_opening_balance_requests WHERE id = '${replacementFirst.request}'),
          (SELECT count(*) FROM public.documents WHERE id = '${replacementFirst.sourceDocument}' AND archived_at IS NOT NULL),
          (SELECT count(*) FROM public.documents WHERE storage_path = '${replacementFirst.organization}/documents/replacement.pdf' AND archived_at IS NULL)
        )
      `),
      "[0, 1, 1]",
    );
  } finally {
    for (const state of [referenceFirst, replacementFirst]) {
      try {
        cleanup(container, state);
      } catch {
        // Preserve the original assertion when setup failed before rows existed.
      }
    }
  }
});
