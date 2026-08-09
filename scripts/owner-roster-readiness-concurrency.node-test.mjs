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
  return result.stdout;
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

test("two sessions serialize overlapping owner inserts and updates", async () => {
  const container = databaseContainer();
  run(container, `
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('ac000000-0000-0000-0000-000000000001', 'Concurrency org', 'owner-concurrency')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.properties (id, organization_id, name, code, property_type)
    VALUES ('bc000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'Concurrency property', 'CONC-1', 'Apartment')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.people (id, organization_id, display_name)
    VALUES ('1c000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'Concurrency owner')
    ON CONFLICT (organization_id, id) DO NOTHING;
    DELETE FROM public.property_owners WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
  `);

  const insertRace = await raceAgainstUncommittedWriter(
    container,
    `BEGIN;
     INSERT INTO public.property_owners (id, organization_id, property_id, person_id, ownership_percent, started_on, ended_on)
     VALUES ('0c000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 100, '2026-01-01', '2026-09-01');
     SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
    `INSERT INTO public.property_owners (id, organization_id, property_id, person_id, ownership_percent, started_on, ended_on)
     VALUES ('0c000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 100, '2026-06-01', NULL);`,
  );
  assert.deepEqual(
    [insertRace.first.status, insertRace.second.status].sort(),
    [0, 1],
  );
  assert.match(
    `${insertRace.first.stderr}\n${insertRace.second.stderr}`,
    /conflicting key value violates exclusion constraint/i,
  );

  run(container, `
    DELETE FROM public.property_owners WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
    INSERT INTO public.property_owners (id, organization_id, property_id, person_id, ownership_percent, started_on, ended_on)
    VALUES
      ('0c000000-0000-0000-0000-000000000010', 'ac000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 100, '2026-01-01', '2026-04-01'),
      ('0c000000-0000-0000-0000-000000000011', 'ac000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 100, '2026-07-01', NULL);
  `);

  const updateRace = await raceAgainstUncommittedWriter(
    container,
    `BEGIN;
     UPDATE public.property_owners SET ended_on = '2026-06-01' WHERE id = '0c000000-0000-0000-0000-000000000010';
     SELECT 'writer_ready'; SELECT pg_sleep(1); COMMIT;`,
    `UPDATE public.property_owners SET started_on = '2026-05-01' WHERE id = '0c000000-0000-0000-0000-000000000011';`,
  );
  assert.deepEqual(
    [updateRace.first.status, updateRace.second.status].sort(),
    [0, 1],
  );
  assert.match(
    `${updateRace.first.stderr}\n${updateRace.second.stderr}`,
    /conflicting key value violates exclusion constraint/i,
  );

  run(container, `
    DELETE FROM public.property_owners WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
    DELETE FROM public.people WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
    DELETE FROM public.properties WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
    SET session_replication_role = replica;
    DELETE FROM public.financial_reconciliation_sources WHERE organization_id = 'ac000000-0000-0000-0000-000000000001';
    DELETE FROM public.organizations WHERE id = 'ac000000-0000-0000-0000-000000000001';
    SET session_replication_role = origin;
  `);
});
