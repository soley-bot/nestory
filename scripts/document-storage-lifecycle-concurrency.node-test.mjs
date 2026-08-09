import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const bucket = "nestory-documents";

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

function race(container, firstSql, secondSql) {
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

function ids(prefix) {
  return {
    actor: `${prefix}0000-0000-4000-8000-000000000001`,
    organization: `${prefix}0000-0000-4000-8000-000000000002`,
    property: `${prefix}0000-0000-4000-8000-000000000003`,
    document: `${prefix}0000-0000-4000-8000-000000000004`,
  };
}

function objectPath(state) {
  return `${state.organization}/documents/race.pdf`;
}

function setupSql(state, slug, withLegacyDocument) {
  return `
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', '${state.actor}',
      'authenticated', 'authenticated', '${slug}@example.test',
      extensions.crypt('document-storage-race', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}', now(), now()
    );
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('${state.organization}', 'Document Storage lifecycle race', '${slug}');
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES ('${state.organization}', '${state.actor}', 'super_admin');
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES ('${state.property}', '${state.organization}', 'Race property', '${slug}', 'Apartment');
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('${bucket}', '${objectPath(state)}');
    ${withLegacyDocument ? `
      INSERT INTO public.documents (
        id, organization_id, property_id, category, file_name, storage_path,
        mime_type, size_bytes, uploaded_by
      ) VALUES (
        '${state.document}', '${state.organization}', '${state.property}',
        'legacy evidence', 'race.pdf', '${objectPath(state)}',
        'application/pdf', 10, '${state.actor}'
      );
    ` : ""}
  `;
}

function authenticatedContext(state) {
  return `
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${state.actor}', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
  `;
}

function createCall(state, pause) {
  return `
    ${authenticatedContext(state)}
    ${pause ? "SELECT set_config('app.test_pause_document_write', 'on', true);" : ""}
    SELECT public.create_document(
      '${state.organization}', 'owner_opening_balance_evidence', 'race.pdf',
      '${objectPath(state)}', 'application/pdf', 10, repeat('a', 64),
      '${state.property}'
    );
  `;
}

function fingerprintCall(state, pause) {
  return `
    ${authenticatedContext(state)}
    ${pause ? "SELECT set_config('app.test_pause_document_write', 'on', true);" : ""}
    SELECT public.fingerprint_document_content(
      '${state.document}', '${state.organization}', repeat('b', 64)
    );
  `;
}

function deleteObject(state) {
  return `
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
    WHERE bucket_id = '${bucket}' AND name = '${objectPath(state)}';
  `;
}

function installPauseTrigger(container) {
  run(container, `
    CREATE OR REPLACE FUNCTION app_private.test_pause_document_storage_race()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $function$
    BEGIN
      IF current_setting('app.test_pause_document_write', true) = 'on' THEN
        RAISE NOTICE 'writer_ready';
        PERFORM pg_sleep(1);
      END IF;
      RETURN NEW;
    END;
    $function$;
    ALTER FUNCTION app_private.test_pause_document_storage_race() OWNER TO postgres;
    REVOKE ALL ON FUNCTION app_private.test_pause_document_storage_race()
      FROM PUBLIC, anon, authenticated, service_role;
    CREATE TRIGGER test_pause_document_storage_race
      BEFORE INSERT OR UPDATE OF content_sha256 ON public.documents
      FOR EACH ROW
      EXECUTE FUNCTION app_private.test_pause_document_storage_race();
  `);
}

function removePauseTrigger(container) {
  run(container, `
    DROP TRIGGER IF EXISTS test_pause_document_storage_race ON public.documents;
    DROP FUNCTION IF EXISTS app_private.test_pause_document_storage_race();
  `);
}

function cleanup(container, state) {
  run(container, `
    BEGIN;
    LOCK TABLE public.documents IN ACCESS EXCLUSIVE MODE;
    ALTER TABLE public.documents DISABLE TRIGGER guard_document_content_fingerprint;
    DELETE FROM public.documents WHERE organization_id = '${state.organization}';
    ALTER TABLE public.documents ENABLE TRIGGER guard_document_content_fingerprint;
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
    WHERE bucket_id = '${bucket}' AND name = '${objectPath(state)}';
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
        (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${objectPath(state)}'),
        (SELECT count(*) FROM public.organizations WHERE id = '${state.organization}'),
        (SELECT count(*) FROM auth.users WHERE id = '${state.actor}')
      )
    `),
    "[0, 0, 0, 0]",
    "Storage lifecycle race cleanup must leave no synthetic rows or objects",
  );
}

test("create serializes with Storage deletion in both start orders", async () => {
  const container = databaseContainer();
  const states = {
    createFirst: ids("a23a"),
    createDeleteFirst: ids("a23b"),
  };

  installPauseTrigger(container);
  try {
    run(container, setupSql(states.createFirst, "storage-create-first", false));
    const createFirst = await race(
      container,
      `BEGIN; ${createCall(states.createFirst, true)} COMMIT;`,
      `BEGIN; ${deleteObject(states.createFirst)} COMMIT;`,
    );

    run(container, setupSql(states.createDeleteFirst, "storage-create-delete-first", false));
    const createDeleteFirst = await race(
      container,
      `BEGIN; ${deleteObject(states.createDeleteFirst)} SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
      `BEGIN; ${createCall(states.createDeleteFirst, false)} COMMIT;`,
    );
    assert.deepEqual(
      [createFirst.second.status !== 0, createDeleteFirst.second.status !== 0],
      [true, true],
      "both create-first and delete-first races must have one stable loser",
    );
    assert.equal(createFirst.first.status, 0, createFirst.first.stderr);
    assert.match(createFirst.second.stderr, /immutable/);
    assert.doesNotMatch(createFirst.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.documents WHERE organization_id = '${states.createFirst.organization}' AND content_sha256 IS NOT NULL),
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${objectPath(states.createFirst)}')
        )
      `),
      "[1, 1]",
    );
    assert.equal(createDeleteFirst.first.status, 0, createDeleteFirst.first.stderr);
    assert.match(createDeleteFirst.second.stderr, /Storage object does not exist/);
    assert.doesNotMatch(createDeleteFirst.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.documents WHERE organization_id = '${states.createDeleteFirst.organization}'),
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${objectPath(states.createDeleteFirst)}')
        )
      `),
      "[0, 0]",
    );

  } finally {
    try {
      removePauseTrigger(container);
    } finally {
      for (const state of Object.values(states)) {
        try {
          cleanup(container, state);
        } catch {
          // Preserve the original assertion if setup did not create this state.
        }
      }
    }
  }
});

test("fingerprint serializes with Storage deletion in both start orders", async () => {
  const container = databaseContainer();
  const states = {
    fingerprintFirst: ids("a23c"),
    fingerprintDeleteFirst: ids("a23d"),
  };

  installPauseTrigger(container);
  try {
    run(container, setupSql(states.fingerprintFirst, "storage-fingerprint-first", true));
    const fingerprintFirst = await race(
      container,
      `BEGIN; ${fingerprintCall(states.fingerprintFirst, true)} COMMIT;`,
      `BEGIN; ${deleteObject(states.fingerprintFirst)} COMMIT;`,
    );

    run(container, setupSql(states.fingerprintDeleteFirst, "storage-fingerprint-delete-first", true));
    const fingerprintDeleteFirst = await race(
      container,
      `BEGIN; ${deleteObject(states.fingerprintDeleteFirst)} SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
      `BEGIN; ${fingerprintCall(states.fingerprintDeleteFirst, false)} COMMIT;`,
    );
    assert.deepEqual(
      [fingerprintFirst.second.status !== 0, fingerprintDeleteFirst.second.status !== 0],
      [true, true],
      "both fingerprint-first and delete-first races must have one stable loser",
    );
    assert.equal(fingerprintFirst.first.status, 0, fingerprintFirst.first.stderr);
    assert.match(fingerprintFirst.second.stderr, /immutable/);
    assert.doesNotMatch(fingerprintFirst.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.documents WHERE id = '${states.fingerprintFirst.document}' AND content_sha256 IS NOT NULL),
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${objectPath(states.fingerprintFirst)}')
        )
      `),
      "[1, 1]",
    );
    assert.equal(fingerprintDeleteFirst.first.status, 0, fingerprintDeleteFirst.first.stderr);
    assert.match(fingerprintDeleteFirst.second.stderr, /Storage object does not exist/);
    assert.doesNotMatch(fingerprintDeleteFirst.second.stderr, /deadlock detected/);
    assert.equal(
      run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM public.documents WHERE id = '${states.fingerprintDeleteFirst.document}' AND content_sha256 IS NOT NULL),
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${objectPath(states.fingerprintDeleteFirst)}')
        )
      `),
      "[0, 0]",
    );
  } finally {
    try {
      removePauseTrigger(container);
    } finally {
      for (const state of Object.values(states)) {
        try {
          cleanup(container, state);
        } catch {
          // Preserve the original assertion if setup did not create this state.
        }
      }
    }
  }
});
