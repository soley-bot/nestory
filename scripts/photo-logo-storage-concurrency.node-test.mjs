import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const actorId = "00000000-0000-0000-0000-000000000101";
const branchId = "00000000-0000-0000-0000-000000000211";
const propertyId = "10000000-0000-0000-0000-000000000001";

function psqlArgs(container, sql) {
  return [
    "exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
  ];
}

function run(container, sql) {
  const result = spawnSync("docker", psqlArgs(container, sql), {
    cwd: repoRoot, encoding: "utf8", shell: false, timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function authenticatedContext() {
  return `
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
  `;
}

function pauseWriter() {
  return `DO $pause$ BEGIN RAISE NOTICE 'writer_ready'; PERFORM pg_sleep(1); END $pause$;`;
}

function race(container, firstSql, secondSql) {
  return new Promise((resolve, reject) => {
    const first = spawn("docker", psqlArgs(container, firstSql), {
      cwd: repoRoot, shell: false,
    });
    let stdout = "";
    let stderr = "";
    let second;
    function launchSecond() {
      if (!second && `${stdout}${stderr}`.includes("writer_ready")) {
        second = spawnSync("docker", psqlArgs(container, secondSql), {
          cwd: repoRoot, encoding: "utf8", shell: false, timeout: 10_000,
        });
      }
    }
    first.stdout.on("data", (chunk) => { stdout += chunk; launchSecond(); });
    first.stderr.on("data", (chunk) => { stderr += chunk; launchSecond(); });
    first.on("error", reject);
    first.on("close", (status) => {
      if (!second) reject(new Error(`Writer did not reach its lock: ${stderr}`));
      else resolve({ first: { status, stdout, stderr }, second });
    });
  });
}

function deleteObject(bucket, storagePath) {
  return `
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
    WHERE bucket_id = '${bucket}' AND name = '${storagePath}';
  `;
}

function registrationCall(kind, storagePath) {
  return kind === "logo"
    ? `SELECT public.update_organization_logo('${organizationId}', '${storagePath}');`
    : `SELECT public.create_asset_photo(
        '${organizationId}', '${propertyId}', NULL, 'race.png', '${storagePath}',
        'image/png', 1024, NULL, false, NULL
      );`;
}

function registrationCount(kind, storagePath) {
  return kind === "logo"
    ? `(SELECT count(*) FROM public.organizations WHERE id = '${organizationId}' AND logo_storage_path = '${storagePath}')`
    : `(SELECT count(*) FROM public.asset_photos WHERE organization_id = '${organizationId}' AND storage_path = '${storagePath}')`;
}

for (const kind of ["logo", "photo"]) {
  test(`${kind} registration and deletion serialize in both start orders`, async () => {
    assert.equal(process.env.CI, "true", "Run only against the disposable CI fixture database");
    const container = findLocalDatabaseContainer(repoRoot);
    assert.equal(run(container, `
      SELECT CASE WHEN current_setting('app.settings.jwt_secret', true) =
        'super-secret-jwt-token-with-at-least-32-characters-long'
        AND EXISTS (SELECT 1 FROM auth.users WHERE id = '${actorId}' AND email = 'nestory@gmail.com')
        THEN 'local-fixture' ELSE 'wrong-database' END;
    `), "local-fixture");
    if (kind === "logo") {
      assert.equal(run(container, `SELECT logo_storage_path IS NULL FROM public.organizations WHERE id = '${organizationId}';`), "t");
    }
    const bucket = kind === "logo" ? "organization-assets" : "nestory-photos";
    const prefix = kind === "logo"
      ? `${organizationId}/logos`
      : `${organizationId}/branches/${branchId}/photos/properties/${propertyId}`;
    const paths = Array.from({ length: kind === "logo" ? 3 : 2 }, () => `${prefix}/${randomUUID()}.png`);

    try {
      for (const storagePath of paths) {
        run(container, `
          INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
          VALUES ('${bucket}', '${storagePath}', '${actorId}', '{"mimetype":"image/png","size":1024}');
        `);
      }
      const registeredFirst = await race(
        container,
        `BEGIN; ${authenticatedContext()} ${registrationCall(kind, paths[0])} ${pauseWriter()} COMMIT;`,
        `BEGIN; ${authenticatedContext()} ${deleteObject(bucket, paths[0])} COMMIT;`,
      );
      assert.equal(registeredFirst.first.status, 0, registeredFirst.first.stderr);
      assert.notEqual(registeredFirst.second.status, 0);
      assert.match(registeredFirst.second.stderr, /bytes cannot be removed or replaced/);
      assert.doesNotMatch(registeredFirst.second.stderr, /deadlock detected/);
      assert.equal(run(container, `
        SELECT jsonb_build_array(${registrationCount(kind, paths[0])},
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${paths[0]}'));
      `), "[1, 1]");

      if (kind === "logo") {
        run(container, `BEGIN; ${authenticatedContext()} SELECT public.update_organization_logo('${organizationId}', NULL); COMMIT;`);
      }
      const deletedFirst = await race(
        container,
        `BEGIN; ${authenticatedContext()} ${deleteObject(bucket, paths[1])} ${pauseWriter()} COMMIT;`,
        `BEGIN; ${authenticatedContext()} ${registrationCall(kind, paths[1])} COMMIT;`,
      );
      assert.equal(deletedFirst.first.status, 0, deletedFirst.first.stderr);
      assert.notEqual(deletedFirst.second.status, 0);
      assert.match(deletedFirst.second.stderr, /object was not found/);
      assert.doesNotMatch(deletedFirst.second.stderr, /deadlock detected/);
      assert.equal(run(container, `
        SELECT jsonb_build_array(${registrationCount(kind, paths[1])},
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name = '${paths[1]}'));
      `), "[0, 0]");

      if (kind === "logo") {
        const batchDeletion = await race(
          container,
          `BEGIN; ${authenticatedContext()} ${deleteObject(bucket, paths[0])} ${pauseWriter()} ${deleteObject(bucket, paths[2])} COMMIT;`,
          `BEGIN; ${authenticatedContext()} ${registrationCall(kind, paths[2])} COMMIT;`,
        );
        assert.equal(batchDeletion.second.status, 0, batchDeletion.second.stderr);
        assert.notEqual(batchDeletion.first.status, 0);
        assert.match(batchDeletion.first.stderr, /Selected company logo bytes cannot be removed or replaced/);
        assert.doesNotMatch(batchDeletion.first.stderr, /deadlock detected/);
        assert.equal(run(container, `
          SELECT jsonb_build_array(${registrationCount(kind, paths[2])},
            (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name IN ('${paths[0]}','${paths[2]}')));
        `), "[1, 2]");
      }
    } finally {
      const exactPaths = paths.map((storagePath) => `'${storagePath}'`).join(",");
      run(container, `
        BEGIN;
        ${authenticatedContext()}
        ${kind === "logo" ? `SELECT public.update_organization_logo('${organizationId}', NULL);` : ""}
        RESET ROLE;
        DELETE FROM public.activity_logs
        WHERE organization_id = '${organizationId}' AND (
          previous_values ->> 'logo_storage_path' IN (${exactPaths})
          OR new_values ->> 'logo_storage_path' IN (${exactPaths})
          OR new_values ->> 'photo_id' IN (SELECT id::text FROM public.asset_photos WHERE storage_path IN (${exactPaths}))
        );
        DELETE FROM public.asset_photos WHERE storage_path IN (${exactPaths});
        ${authenticatedContext()}
        SELECT set_config('storage.allow_delete_query', 'true', true);
        DELETE FROM storage.objects WHERE bucket_id = '${bucket}' AND name IN (${exactPaths});
        COMMIT;
      `);
      assert.equal(run(container, `
        SELECT jsonb_build_array(
          (SELECT count(*) FROM storage.objects WHERE bucket_id = '${bucket}' AND name IN (${exactPaths})),
          (SELECT count(*) FROM public.asset_photos WHERE storage_path IN (${exactPaths}))
        );
      `), "[0, 0]");
    }
  });
}
