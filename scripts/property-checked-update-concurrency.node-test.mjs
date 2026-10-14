import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

// CI uses its verified configured local stack. Developer runs require an explicit
// isolated readiness stack, even when another shared local database is running.
let container = process.env.PROPERTY_CONCURRENCY_DB_CONTAINER;
if (process.env.CI === "true") {
  const configured = findLocalDatabaseContainer(resolve(import.meta.dirname, ".."));
  assert.ok(!container || container === configured, "Property test database must match the verified local CI configuration.");
  container = configured;
} else {
  assert.match(container ?? "", /^supabase_db_nestory-ips-readiness-[a-z0-9-]+$/,
    "Set PROPERTY_CONCURRENCY_DB_CONTAINER to the isolated readiness database container.");
}
const ids = Object.fromEntries(["org", "actor", "branch", "property", "ownerA", "ownerB"].map((key) => [key, randomUUID()]));
// PostgreSQL truncates application_name at 63 bytes. Preserve the distinct
// contender suffix so lock observation and teardown identify exact sessions.
const prefix = `prop-${randomUUID()}`;
const sessions = [];
const args = ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];

function run(sql) {
  const result = spawnSync("docker", args, { input: sql, encoding: "utf8", shell: false, timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function begin(name) {
  return `BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='25s';
    SET LOCAL application_name='${name}';
    SELECT set_config('request.jwt.claim.sub','${ids.actor}',true); SET LOCAL ROLE authenticated;`;
}
function save(name, version, owner = null) {
  const ownership = owner ? `'${owner}','2026-01-01',100` : "NULL,NULL,NULL";
  return `SELECT public.update_property_details_checked('${ids.property}','${ids.org}','${version}',
    '${name}','CONCURRENCY','House',NULL,NULL,'active',NULL,NULL,NULL,${ownership});`;
}
function version() { return run(`SELECT edit_version FROM public.properties WHERE id='${ids.property}';`); }
function activityCount() { return Number(run(`SELECT count(*) FROM public.activity_logs WHERE entity_id='${ids.property}' AND action='property_updated';`)); }
function start(name, sql) {
  assert.ok(Buffer.byteLength(name, "utf8") <= 63, "Concurrency session name exceeds PostgreSQL's limit.");
  const child = spawn("docker", args, { shell: false });
  const session = { child, name, stdout: "", stderr: "", closed: false };
  session.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { session.closed = true; resolve({ status, stdout: session.stdout, stderr: session.stderr }); });
  });
  child.stdout.on("data", (chunk) => { session.stdout += chunk; });
  child.stderr.on("data", (chunk) => { session.stderr += chunk; });
  sessions.push(session);
  child.stdin.write(begin(name) + sql + "\n");
  return session;
}
async function until(predicate, message, observed) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    assert.ok(!observed?.closed, `${message}: ${observed?.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(message);
}
async function race(firstSql, secondSql, label) {
  const first = start(`${prefix}-${label}-first`, firstSql + "SELECT 'LOCK_HELD';");
  await until(() => first.stdout.includes("LOCK_HELD"), "first transaction did not hold its result", first);
  const second = start(`${prefix}-${label}-second`, secondSql + "COMMIT;");
  second.child.stdin.end();
  await until(() => run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${second.name}' AND wait_event_type='Lock');`) === "t",
    "second transaction did not wait for the first property lock", second);
  first.child.stdin.end("COMMIT;\n");
  const results = await Promise.all([first.done, second.done]);
  assert.equal(results[0].status, 0, results[0].stderr);
  return results[1];
}

test("checked Property edits serialize concurrent editors, identical retries, ownership changes and rollback recovery", async () => {
  const failures = [];
  try {
    run(`INSERT INTO auth.users(id,email) VALUES('${ids.actor}','${ids.actor}@example.test');
      INSERT INTO public.organizations(id,name,slug) VALUES('${ids.org}','Synthetic property concurrency','${ids.org}');
      INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES('${ids.branch}','${ids.org}','Test','TEST');
      INSERT INTO public.organization_members(organization_id,user_id,role) VALUES('${ids.org}','${ids.actor}','super_admin');
      INSERT INTO public.properties(id,organization_id,name,code,property_type)
        VALUES('${ids.property}','${ids.org}','Initial','CONCURRENCY','House');
      SELECT set_config('request.jwt.claim.sub','${ids.actor}',false);
      SELECT public.assign_property_branch('${ids.org}','${ids.property}','${ids.branch}');
      INSERT INTO public.people(id,organization_id,display_name)
        VALUES('${ids.ownerA}','${ids.org}','Owner A'),('${ids.ownerB}','${ids.org}','Owner B');`);

    const originalVersion = version();
    const baselineCount = activityCount();
    const loser = await race(save("Editor one", originalVersion), save("Editor two", originalVersion), "different");
    assert.notEqual(loser.status, 0);
    assert.match(loser.stderr, /40001.*Property changed since this editor was opened/);
    assert.equal(run(`SELECT name FROM public.properties WHERE id='${ids.property}';`), "Editor one");
    assert.equal(activityCount(), baselineCount + 1);
    const savedVersion = version();
    const replay = run(begin(`${prefix}-replay`) + save("Editor one", originalVersion) + "COMMIT;");
    assert.match(replay, /"changed": false/);
    assert.equal(version(), savedVersion);
    assert.equal(activityCount(), baselineCount + 1);

    const duplicate = await race(save("Same desired edit", savedVersion), save("Same desired edit", savedVersion), "identical");
    assert.equal(duplicate.status, 0, duplicate.stderr);
    assert.match(duplicate.stdout, /"changed": false/);
    assert.equal(activityCount(), baselineCount + 2);

    const beforeRollback = version();
    run(begin(`${prefix}-rollback`) + save("Rolled back", beforeRollback) + "ROLLBACK;");
    assert.equal(version(), beforeRollback);
    assert.match(run(begin(`${prefix}-after-rollback`) + save("Recovered", beforeRollback) + "COMMIT;"), /"changed": true/);

    const ownerVersion = version();
    const ownerLoser = await race(save("Recovered", ownerVersion, ids.ownerA), save("Recovered", ownerVersion, ids.ownerB), "owners");
    assert.notEqual(ownerLoser.status, 0);
    assert.match(ownerLoser.stderr, /40001.*Property changed since this editor was opened/);
    assert.equal(run(`SELECT person_id FROM public.property_owners WHERE property_id='${ids.property}' AND ended_on IS NULL AND archived_at IS NULL AND is_primary;`), ids.ownerA);
    assert.match(run(begin(`${prefix}-owner-retry`) + save("Recovered", ownerVersion, ids.ownerA) + "COMMIT;"), /"changed": false/);
    assert.equal(activityCount(), baselineCount + 4);
  } catch (error) {
    failures.push(error);
  } finally {
    // Terminate only this run's sessions before removing only its synthetic rows.
    for (const session of sessions.filter((entry) => !entry.closed)) {
      try {
        run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='${session.name}';`);
        session.child.stdin.end();
        await session.done;
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      // Organization creation seeds restricted finance records. Remove only
      // this run's records, then restore FK/cascade behavior for the org itself.
      run(`BEGIN;
        SET LOCAL session_replication_role = replica;
        DELETE FROM app_private.finance_account_activity_authority_history WHERE organization_id='${ids.org}';
        DELETE FROM app_private.finance_account_generated_categories WHERE organization_id='${ids.org}';
        DELETE FROM public.finance_account_category_links WHERE organization_id='${ids.org}';
        DELETE FROM public.finance_account_source_links WHERE organization_id='${ids.org}';
        DELETE FROM app_private.finance_account_internal_sources WHERE organization_id='${ids.org}';
        DELETE FROM public.finance_account_roles WHERE organization_id='${ids.org}';
        DELETE FROM public.finance_accounts WHERE organization_id='${ids.org}';
        DELETE FROM public.finance_categories WHERE organization_id='${ids.org}';
        DELETE FROM public.financial_reconciliation_sources WHERE organization_id='${ids.org}';
        SET LOCAL session_replication_role = origin;
        DELETE FROM public.organizations WHERE id='${ids.org}';
        DELETE FROM auth.users WHERE id='${ids.actor}';
        COMMIT;`);
      assert.equal(run(`SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id='${ids.org}')
        OR EXISTS(SELECT 1 FROM auth.users WHERE id='${ids.actor}');`), "f", "Synthetic concurrency fixtures survived cleanup.");
    } catch (error) {
      failures.push(new Error(`Cleanup failed for synthetic property organization ${ids.org}.`, { cause: error }));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Property concurrency proof and teardown failed; original failure is first.");
});
