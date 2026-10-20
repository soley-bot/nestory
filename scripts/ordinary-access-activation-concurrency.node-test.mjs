import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { propertyConcurrencyTarget } from "./property-concurrency-target.mjs";

// Reuse the verified local concurrency target: configured CI stack, or an
// explicitly selected isolated readiness stack. It pins the Docker endpoint and
// full container identity for discovery, every query, workers and cleanup.
function execute(command, args, input, { worker = false, ...options } = {}) {
  if (worker) {
    return spawn(command, args, {
      ...options,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  const result = spawnSync(command, args, {
    ...options,
    input,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const database = await propertyConcurrencyTarget({
  config: readFileSync(resolve(import.meta.dirname, "../supabase/config.toml"), "utf8"),
  execute,
});
const run = (sql) => database.run(sql);
const auditAction = "organization_ordinary_access_enabled";

function actorTransaction(fixture, actor) {
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
    SET LOCAL statement_timeout='20s';
    SET LOCAL idle_in_transaction_session_timeout='25s';
    SELECT set_config('request.jwt.claim.sub','${fixture[actor]}',true);
    SELECT set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;`;
}

function preview(fixture, actor = "actor") {
  const output = run(
    actorTransaction(fixture, actor) +
    `SELECT 'PREVIEW:' || public.get_organization_ordinary_access_activation('${fixture.org}')::text;
    COMMIT;`,
  );
  const result = taggedJson(output, "PREVIEW:");
  assert.equal(result.organization_id, fixture.org);
  assert.ok(Number.isSafeInteger(result.authorization_version));
  assert.match(result.impact_fingerprint, /^[a-f0-9]{64}$/);
  return result;
}

function activate(fixture, reviewed) {
  assert.ok(Number.isSafeInteger(reviewed.authorization_version));
  assert.match(reviewed.impact_fingerprint, /^[a-f0-9]{64}$/);
  return `SELECT 'ACTIVATION:' || public.activate_organization_ordinary_access(
    '${fixture.org}',${reviewed.authorization_version},'${reviewed.impact_fingerprint}',true
  )::text;`;
}

function taggedJson(output, tag) {
  const lines = output.split(/\r?\n/).filter((line) => line.startsWith(tag));
  assert.equal(lines.length, 1, `Expected one ${tag} result; received ${output}`);
  return JSON.parse(lines[0].slice(tag.length));
}

function storedState(fixture) {
  return JSON.parse(run(`SELECT jsonb_build_object(
    'enabled', state.ordinary_access_enabled,
    'version', state.version,
    'activation_audits', (
      SELECT count(*) FROM public.activity_logs
      WHERE organization_id='${fixture.org}' AND action='${auditAction}'
    ),
    'actor_memberships', (
      SELECT count(*) FROM public.organization_members
      WHERE organization_id='${fixture.org}' AND user_id='${fixture.actor}'
    ),
    'active_branches', (
      SELECT count(*) FROM public.organization_branches
      WHERE organization_id='${fixture.org}' AND status='active' AND archived_at IS NULL
    )
  ) FROM public.organization_authorization_states AS state
  WHERE state.organization_id='${fixture.org}';`));
}

function start(fixture, label, actor, sql, { hold = false } = {}) {
  // PostgreSQL truncates application_name to 63 bytes. Keep both contender
  // suffixes distinct and include a run-owned identifier in every session.
  const name = `${fixture.sessionPrefix}-${label}`;
  assert.ok(Buffer.byteLength(name, "utf8") <= 63);
  const child = database.spawnWorker();
  const session = { child, name, stdout: "", stderr: "", closed: false };
  session.done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      session.closed = true;
      resolveDone({ status, stdout: session.stdout, stderr: session.stderr });
    });
  });
  child.stdout.on("data", (chunk) => { session.stdout += chunk; });
  child.stderr.on("data", (chunk) => { session.stderr += chunk; });
  fixture.sessions.push(session);
  child.stdin.write(actorTransaction(fixture, actor) + `
    SET LOCAL application_name='${name}';
    SELECT 'BACKEND:' || pg_backend_pid();
    ${sql}
    ${hold ? "SELECT 'OPERATION_HELD';" : "COMMIT;"}
  \n`);
  if (!hold) child.stdin.end();
  return session;
}

async function until(predicate, message, session) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    assert.ok(!session.closed, `${message}: worker exited: ${session.stderr}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  assert.fail(`${message}: ${session.stderr}`);
}

async function held(session) {
  await until(() => session.stdout.includes("OPERATION_HELD"), "First operation never reached its held result", session);
  const matches = [...session.stdout.matchAll(/^BACKEND:(\d+)\r?$/gm)];
  assert.equal(matches.length, 1, "Could not identify the first operation's exact backend");
  const pid = Number(matches[0][1]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  return pid;
}

async function blockedBy(second, first, firstPid) {
  await until(() => run(`SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_activity AS waiter
    JOIN pg_catalog.pg_stat_activity AS blocker
      ON blocker.pid=${firstPid}
      AND blocker.application_name='${first.name}'
      AND blocker.datname=current_database()
    WHERE waiter.application_name='${second.name}'
      AND waiter.datname=current_database()
      AND waiter.wait_event_type='Lock'
      AND blocker.pid=ANY(pg_catalog.pg_blocking_pids(waiter.pid))
  );`) === "t", "Second operation never blocked on the exact first transaction", second);
}

async function race(fixture, {
  label, firstActor = "actor", firstSql, secondActor = "actor", secondSql,
  finishFirst = "COMMIT",
}) {
  assert.ok(["COMMIT", "ROLLBACK"].includes(finishFirst));
  const first = start(fixture, `${label}-first`, firstActor, firstSql, { hold: true });
  const firstPid = await held(first);
  const second = start(fixture, `${label}-second`, secondActor, secondSql);
  await blockedBy(second, first, firstPid);
  first.child.stdin.end(`${finishFirst};\n`);
  const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  assert.equal(firstResult.status, 0, firstResult.stderr);
  return { first: firstResult, second: secondResult };
}

function denied(result, sqlstate, message) {
  assert.notEqual(result.status, 0, "Operation unexpectedly succeeded");
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${sqlstate}:`));
  assert.ok(result.stderr.includes(message), `Unexpected denial: ${result.stderr}`);
}

async function withFixture(body) {
  const fixture = Object.fromEntries(
    ["org", "actor", "otherAdmin", "actorMembership", "otherMembership", "branch"].map((key) => [key, randomUUID()]),
  );
  fixture.sessionPrefix = `oa-${randomUUID().slice(0, 20)}`;
  fixture.sessions = [];
  const failures = [];
  try {
    // Synthetic identities only. Organization insertion supplies contained
    // authorization state; no email, Auth-admin call or production fixture is used.
    run(`BEGIN;
      INSERT INTO auth.users(id,email,email_confirmed_at)
      VALUES('${fixture.actor}','${fixture.actor}@example.test',now()),
        ('${fixture.otherAdmin}','${fixture.otherAdmin}@example.test',now());
      INSERT INTO public.organizations(id,name,slug)
      VALUES('${fixture.org}','Synthetic activation concurrency','${fixture.org}');
      INSERT INTO public.organization_members(id,organization_id,user_id,role)
      VALUES('${fixture.actorMembership}','${fixture.org}','${fixture.actor}','super_admin'),
        ('${fixture.otherMembership}','${fixture.org}','${fixture.otherAdmin}','super_admin');
      INSERT INTO public.organization_branches(id,organization_id,name,code)
      VALUES('${fixture.branch}','${fixture.org}','Synthetic ready branch','READY');
      COMMIT;`);
    const reviewed = preview(fixture);
    assert.equal(reviewed.ordinary_access_enabled, false);
    assert.equal(reviewed.activation_ready, true, JSON.stringify(reviewed.blockers));
    assert.deepEqual(reviewed.blockers, []);
    const initial = storedState(fixture);
    assert.equal(initial.enabled, false);
    assert.equal(initial.activation_audits, 0);
    await body(fixture, reviewed, initial);
  } catch (error) {
    failures.push(error);
  } finally {
    // Only terminate exact run-owned sessions, in the same pinned database.
    // Resolve every worker before touching fixtures so failed assertions cannot
    // leave a transaction holding locks during cleanup.
    for (const session of fixture.sessions.filter((entry) => !entry.closed)) {
      try {
        run(`SELECT pg_catalog.pg_terminate_backend(pid)
          FROM pg_catalog.pg_stat_activity
          WHERE application_name='${session.name}' AND datname=current_database();`);
        session.child.stdin.end();
        await session.done;
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      // Organization creation seeds restricted finance rows. This is the
      // established fixture cleanup pattern, scoped to this randomly named org.
      run(`BEGIN;
        SET LOCAL session_replication_role = replica;
        DELETE FROM app_private.finance_account_activity_authority_history WHERE organization_id='${fixture.org}';
        DELETE FROM app_private.finance_account_generated_categories WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_category_links WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_source_links WHERE organization_id='${fixture.org}';
        DELETE FROM app_private.finance_account_internal_sources WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_roles WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_accounts WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_categories WHERE organization_id='${fixture.org}';
        DELETE FROM public.financial_reconciliation_sources WHERE organization_id='${fixture.org}';
        SET LOCAL session_replication_role = origin;
        DELETE FROM public.organizations WHERE id='${fixture.org}';
        DELETE FROM auth.users WHERE id IN ('${fixture.actor}','${fixture.otherAdmin}');
        COMMIT;`);
      assert.equal(run(`SELECT
        EXISTS(SELECT 1 FROM public.organizations WHERE id='${fixture.org}')
        OR EXISTS(SELECT 1 FROM auth.users WHERE id IN ('${fixture.actor}','${fixture.otherAdmin}'));`),
      "f", "Synthetic activation fixtures survived cleanup");
    } catch (error) {
      failures.push(new Error(`Cleanup failed for synthetic activation organization ${fixture.org}.`, { cause: error }));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Activation concurrency proof and cleanup failed; original failure is first.");
}

test("ordinary-access activation rechecks authority and readiness after competing commits", async (t) => {
  await t.test("committed caller revocation wins over a waiting activation", async () => {
    await withFixture(async (fixture, reviewed, initial) => {
      const { second } = await race(fixture, {
        label: "revoke",
        firstActor: "otherAdmin",
        firstSql: `SELECT public.remove_organization_member_access('${fixture.org}','${fixture.actorMembership}');`,
        secondSql: activate(fixture, reviewed),
      });
      denied(second, "42501", "ordinary_access_forbidden");
      const state = storedState(fixture);
      assert.equal(state.actor_memberships, 0, "Revocation did not commit");
      assert.equal(state.enabled, false, "Revoked caller enabled ordinary access");
      assert.equal(state.activation_audits, 0);
      assert.equal(state.version, initial.version);
    });
  });

  await t.test("committed archive of the sole ready branch invalidates a waiting activation", async () => {
    await withFixture(async (fixture, reviewed, initial) => {
      const { second } = await race(fixture, {
        label: "archive",
        firstActor: "otherAdmin",
        firstSql: `SELECT public.archive_organization_branch('${fixture.org}','${fixture.branch}');`,
        secondSql: activate(fixture, reviewed),
      });
      denied(second, "PT409", "ordinary_access_stale_preview");
      const state = storedState(fixture);
      assert.equal(state.active_branches, 0, "Branch archive did not commit");
      assert.equal(state.enabled, false, "Activation used stale branch readiness");
      assert.equal(state.activation_audits, 0);
      assert.equal(state.version, initial.version);
      const refreshed = preview(fixture);
      assert.equal(refreshed.activation_ready, false);
      assert.ok(refreshed.blockers.includes("no_active_branch"));
      assert.notEqual(refreshed.impact_fingerprint, reviewed.impact_fingerprint);
    });
  });
});

test("ordinary-access activation serializes duplicate requests and transaction rollback", async (t) => {
  for (const finishFirst of ["COMMIT", "ROLLBACK"]) {
    await t.test(`the first ${finishFirst.toLowerCase()} leaves exactly one committed activation`, async () => {
      await withFixture(async (fixture, reviewed, initial) => {
        const { first, second } = await race(fixture, {
          label: finishFirst === "COMMIT" ? "duplicate" : "rollback",
          firstSql: activate(fixture, reviewed),
          secondSql: activate(fixture, reviewed),
          finishFirst,
        });
        assert.equal(second.status, 0, second.stderr);
        const firstResult = taggedJson(first.stdout, "ACTIVATION:");
        const secondResult = taggedJson(second.stdout, "ACTIVATION:");
        assert.equal(firstResult.status, "activated");
        assert.equal(secondResult.status, finishFirst === "COMMIT" ? "already_enabled" : "activated");
        assert.equal(secondResult.ordinary_access_enabled, true);
        assert.equal(secondResult.authorization_version, initial.version + 1);
        const state = storedState(fixture);
        assert.equal(state.enabled, true);
        assert.equal(state.version, initial.version + 1, "Duplicate request advanced authorization more than once");
        assert.equal(state.activation_audits, 1, "Duplicate or rolled-back activation left extra audit events");
        assert.equal(state.actor_memberships, 1);
        assert.equal(state.active_branches, 1);
      });
    });
  }
});
