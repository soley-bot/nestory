import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { propertyConcurrencyTarget } from "./property-concurrency-target.mjs";

// Use the same verified local target as ordinary-access concurrency: the
// configured CI stack or an explicitly selected isolated readiness stack.
// The endpoint and full container identity bind queries, workers and cleanup.
function execute(command, args, input, { worker = false, ...options } = {}) {
  if (worker) {
    return spawn(command, args, {
      ...options, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
  }
  const result = spawnSync(command, args, {
    ...options, input, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000,
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
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function transaction(name, serviceRole = true) {
  return `BEGIN ISOLATION LEVEL READ COMMITTED;
    SET LOCAL statement_timeout='20s';
    SET LOCAL lock_timeout='0';
    SET LOCAL idle_in_transaction_session_timeout='25s';
    SET LOCAL application_name=${literal(name)};
    ${serviceRole ? `SET LOCAL ROLE service_role;
      SET LOCAL request.jwt.claim.role='service_role';
      SET LOCAL request.jwt.claims='{"role":"service_role"}';` : ""}
    SELECT 'BACKEND:' || pg_backend_pid();`;
}

function renew(fixture) {
  const expected = fixture.expected;
  // PostgreSQL timestamp and bigint text stay verbatim; Date/Number conversion
  // would truncate microseconds or large authorization versions.
  assert.equal(typeof expected.expiry, "string");
  assert.match(expected.version, /^\d+$/);
  return `SELECT 'RENEWAL:' || to_jsonb(result)::text
    FROM public.resume_client_workspace_invitation_exact(
      ${literal(fixture.org)}::uuid,${literal(fixture.invitation)}::uuid,
      ${literal(fixture.name)},${literal(fixture.slug)},${literal(fixture.email)},
      ${literal(expected.expiry)}::timestamptz,${literal(expected.version)}::bigint
    ) AS result;`;
}

function taggedJson(output, tag) {
  const lines = output.split(/\r?\n/).filter((line) => line.startsWith(tag));
  assert.equal(lines.length, 1, `Expected one ${tag} result; received ${output}`);
  return JSON.parse(lines[0].slice(tag.length));
}

function storedState(fixture) {
  return JSON.parse(run(`SELECT jsonb_build_object(
    'organization',(SELECT to_jsonb(o) FROM public.organizations o WHERE id='${fixture.org}'),
    'authorization',(SELECT to_jsonb(s) FROM public.organization_authorization_states s WHERE organization_id='${fixture.org}'),
    'invitation',(SELECT to_jsonb(i) FROM public.organization_invitations i WHERE id='${fixture.invitation}'),
    'expiry',(SELECT expires_at::text FROM public.organization_invitations WHERE id='${fixture.invitation}'),
    'version',(SELECT version::text FROM public.organization_authorization_states WHERE organization_id='${fixture.org}'),
    'fresh',(SELECT expires_at>clock_timestamp() FROM public.organization_invitations WHERE id='${fixture.invitation}'),
    'members',(SELECT count(*) FROM public.organization_members WHERE organization_id='${fixture.org}'),
    'branches',(SELECT count(*) FROM public.organization_branches WHERE organization_id='${fixture.org}'),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb)
      FROM public.activity_logs a WHERE organization_id='${fixture.org}')
  );`));
}

function assertRenewed(fixture, before, after) {
  assert.deepEqual(after.organization, before.organization);
  assert.deepEqual(after.authorization, before.authorization);
  const allowed = new Set(["invited_at", "expires_at", "updated_at", "delivery_error"]);
  const preserved = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !allowed.has(key)));
  assert.deepEqual(preserved(after.invitation), preserved(before.invitation));
  assert.equal(after.invitation.id, fixture.invitation);
  assert.equal(after.invitation.status, "pending");
  assert.equal(after.invitation.delivery_error, null);
  assert.equal(after.members, 0);
  assert.equal(after.branches, 0);
  assert.equal(after.fresh, true);
  assert.notEqual(after.expiry, fixture.expected.expiry);
  const oldIds = new Set(before.audit.map((row) => row.id));
  assert.deepEqual(after.audit.filter((row) => oldIds.has(row.id)), before.audit);
  const added = after.audit.filter((row) => !oldIds.has(row.id));
  assert.equal(added.length, 1, "Renewal must add exactly one audit");
  assert.equal(added[0].action, "workspace_provisioning_resumed");
  assert.equal(added[0].organization_id, fixture.org);
  assert.equal(added[0].entity_id, fixture.invitation);
  assert.equal(added[0].entity_type, "organization_invitation");
  assert.equal(added[0].actor_id, null);
  assert.equal(added[0].previous_values, null);
  assert.deepEqual(added[0].new_values, { email: fixture.email, role: "super_admin" });
  assert.equal(after.audit.filter((row) => row.action === "workspace_provisioning_resumed").length, 1);
}

function writeInput(session, sql, { end = false } = {}) {
  // Both callbacks and the stream error listener record failure without an
  // unhandled rejection. completed() propagates it inside withFixture's cleanup.
  session.inputOperations.push(new Promise((resolveInput) => {
    const finished = (error) => {
      session.failInput(error);
      resolveInput();
    };
    try {
      if (end) session.child.stdin.end(sql, finished);
      else session.child.stdin.write(sql, finished);
    } catch (error) { finished(error); }
  }));
}

function start(fixture, label, sql, { hold = false, serviceRole = true, discardRenewalResult = false } = {}) {
  const name = `${fixture.sessionPrefix}-${label}`;
  assert.ok(Buffer.byteLength(name, "utf8") <= 63);
  const child = database.spawnWorker();
  const session = {
    child, name, stdout: "", stderr: "", closed: false, discardedResults: 0,
    inputError: null, inputOperations: [],
  };
  session.inputFailure = new Promise((resolveFailure) => {
    session.failInput = (error) => {
      if (!error) return;
      session.inputError ??= error;
      resolveFailure(session.inputError);
    };
  });
  child.stdin.on("error", session.failInput);
  let partial = "";
  const acceptLine = (line) => {
    // Deliberately suppress the returned SQL row in this test transport.
    // This does not simulate a physical disconnect or an HTTP response loss.
    if (discardRenewalResult && line.startsWith("RENEWAL:")) session.discardedResults++;
    else session.stdout += `${line}\n`;
  };
  session.done = new Promise((resolveDone) => {
    child.on("error", (error) => { session.stderr += String(error); });
    child.on("close", (status) => {
      if (partial) acceptLine(partial);
      session.closed = true;
      resolveDone({ status, stdout: session.stdout, stderr: session.stderr });
    });
  });
  child.stdout.on("data", (chunk) => {
    partial += chunk;
    let end;
    while ((end = partial.indexOf("\n")) >= 0) {
      acceptLine(partial.slice(0, end).replace(/\r$/, ""));
      partial = partial.slice(end + 1);
    }
  });
  child.stderr.on("data", (chunk) => { session.stderr += chunk; });
  fixture.sessions.push(session);
  writeInput(session, `${transaction(name, serviceRole)}
    ${sql}
    ${hold ? "SELECT 'OPERATION_HELD';" : "COMMIT;"}
  \n`);
  if (!hold) writeInput(session, undefined, { end: true });
  return session;
}

async function completed(session, timeout = 30_000, { waitForExitOnly = false } = {}) {
  let timer;
  try {
    const operation = waitForExitOnly ? session.done : Promise.race([
      (async () => {
        const result = await session.done;
        await Promise.all(session.inputOperations);
        return result;
      })(),
      session.inputFailure.then((error) => {
        throw new Error(`Worker ${session.name} input failed (${error.code ?? "stream error"}).`, { cause: error });
      }),
    ]);
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Worker ${session.name} did not finish: ${session.stderr}`)), timeout);
      }),
    ]);
  } finally { clearTimeout(timer); }
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
  await until(() => session.stdout.includes("OPERATION_HELD"), "First operation did not reach its held result", session);
  const matches = [...session.stdout.matchAll(/^BACKEND:(\d+)\r?$/gm)];
  assert.equal(matches.length, 1);
  const pid = Number(matches[0][1]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  return pid;
}
async function finish(session, command = "COMMIT") {
  assert.ok(["COMMIT", "ROLLBACK"].includes(command));
  writeInput(session, `${command};\n`, { end: true });
  const result = await completed(session);
  assert.equal(result.status, 0, result.stderr);
  return result;
}
async function rejectsOriginal(fixture, label, sqlstate) {
  const contender = start(fixture, label, renew(fixture));
  // A missing NOWAIT must fail this test rather than silently queue a write.
  const result = await completed(contender, sqlstate === "55P03" ? 5_000 : 30_000);
  assert.notEqual(result.status, 0, "Renewal unexpectedly succeeded");
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${sqlstate}:`));
  if (sqlstate === "55000") assert.match(result.stderr, /Workspace invitation no longer matches the reviewed reservation/);
}

async function withFixture(body) {
  const fixture = {
    org: randomUUID(), invitation: randomUUID(), name: "Synthetic renewal concurrency",
    slug: `renewal-${randomUUID()}`, email: `${randomUUID()}@example.invalid`,
    sessionPrefix: `renew-${randomUUID().slice(0, 20)}`, sessions: [],
  };
  const failures = [];
  try {
    // Direct, synthetic-only fixtures match an undelivered initial reservation.
    // No Auth user, password, membership, email or owner session is created.
    run(`BEGIN;
      INSERT INTO public.organizations(id,name,slug)
      VALUES('${fixture.org}',${literal(fixture.name)},${literal(fixture.slug)});
      INSERT INTO public.organization_invitations(id,organization_id,email,role,status,invited_at,expires_at)
      VALUES('${fixture.invitation}','${fixture.org}',${literal(fixture.email)},'super_admin','pending',
        clock_timestamp()-interval '2 hours',
        date_trunc('second',clock_timestamp())-interval '1 hour'+interval '123456 microseconds');
      COMMIT;`);
    const initial = storedState(fixture);
    fixture.expected = Object.freeze({ expiry: initial.expiry, version: initial.version });
    assert.match(fixture.expected.expiry, /\.123456/);
    assert.equal(initial.fresh, false);
    assert.equal(initial.members, 0);
    assert.equal(initial.branches, 0);
    assert.equal(initial.authorization.ordinary_access_enabled, false);
    assert.equal(initial.authorization.transition_manifest_required, false);
    await body(fixture, initial);
  } catch (error) {
    failures.push(error);
  } finally {
    // Close only exact run-owned workers in the pinned database before cleanup.
    for (const session of fixture.sessions.filter((entry) => !entry.closed)) {
      try {
        run(`SELECT pg_catalog.pg_terminate_backend(pid)
          FROM pg_catalog.pg_stat_activity
          WHERE application_name=${literal(session.name)} AND datname=current_database();`);
        writeInput(session, undefined, { end: true });
        // An input failure is already reported by the operation. Cleanup must
        // still await the actual worker exit before deleting its fixture.
        await completed(session, 5_000, { waitForExitOnly: true });
      } catch (error) { failures.push(error); }
    }
    try {
      // Match the established ordinary-access fixture cleanup for automatically
      // seeded finance rows; every deletion is scoped to this random fixture org.
      run(`BEGIN;
        SET LOCAL statement_timeout='20s';
        SET LOCAL session_replication_role=replica;
        DELETE FROM app_private.finance_account_activity_authority_history WHERE organization_id='${fixture.org}';
        DELETE FROM app_private.finance_account_generated_categories WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_category_links WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_source_links WHERE organization_id='${fixture.org}';
        DELETE FROM app_private.finance_account_internal_sources WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_account_roles WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_accounts WHERE organization_id='${fixture.org}';
        DELETE FROM public.finance_categories WHERE organization_id='${fixture.org}';
        DELETE FROM public.financial_reconciliation_sources WHERE organization_id='${fixture.org}';
        SET LOCAL session_replication_role=origin;
        DELETE FROM public.organizations WHERE id='${fixture.org}';
        COMMIT;`);
      assert.equal(run(`SELECT
        EXISTS(SELECT 1 FROM public.organizations WHERE id='${fixture.org}')
        OR EXISTS(SELECT 1 FROM public.organization_invitations WHERE id='${fixture.invitation}');`),
      "f", "Synthetic renewal fixture survived cleanup");
    } catch (error) {
      failures.push(new Error(`Cleanup failed for synthetic renewal organization ${fixture.org}.`, { cause: error }));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Renewal concurrency proof and cleanup failed; original failure is first.");
}

test("exact invitation renewal preserves the original CAS across suppression, contention and rollback", async (t) => {
  await t.test("a committed suppressed SQL result rejects original-expiry replay without a second audit", async () => {
    await withFixture(async (fixture, initial) => {
      const first = start(fixture, "suppressed", renew(fixture), { discardRenewalResult: true });
      const result = await completed(first);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(first.discardedResults, 1);
      assert.ok(!result.stdout.includes("RENEWAL:"));
      const saved = storedState(fixture);
      assertRenewed(fixture, initial, saved);
      await rejectsOriginal(fixture, "stale-replay", "55000");
      assert.deepEqual(storedState(fixture), saved);
    });
  });

  await t.test("overlapping identical requests are busy before commit and stale after exactly one renewal", async () => {
    await withFixture(async (fixture, initial) => {
      const first = start(fixture, "duplicate-first", renew(fixture), { hold: true });
      await held(first);
      assert.deepEqual(storedState(fixture), initial);
      await rejectsOriginal(fixture, "duplicate-second", "55P03");
      assert.deepEqual(storedState(fixture), initial);
      await finish(first);
      const saved = storedState(fixture);
      assertRenewed(fixture, initial, saved);
      await rejectsOriginal(fixture, "duplicate-stale", "55000");
      assert.deepEqual(storedState(fixture), saved);
    });
  });

  for (const [label, table, column] of [
    ["organization", "public.organizations", "id"],
    ["authorization-state", "public.organization_authorization_states", "organization_id"],
    ["invitation", "public.organization_invitations", "id"],
  ]) {
    await t.test(`held ${label} row rejects NOWAIT before changing expiry or audit`, async () => {
      await withFixture(async (fixture, initial) => {
        const id = label === "invitation" ? fixture.invitation : fixture.org;
        const holder = start(fixture, `${label}-holder`,
          `SELECT ${column} FROM ${table} WHERE ${column}='${id}' FOR UPDATE;`,
          { hold: true, serviceRole: false });
        await held(holder);
        await rejectsOriginal(fixture, `${label}-contender`, "55P03");
        assert.deepEqual(storedState(fixture), initial);
        await finish(holder, "ROLLBACK");
        assert.deepEqual(storedState(fixture), initial);
      });
    });
  }

  await t.test("an acknowledged rollback permits an explicit original-CAS attempt with one committed audit", async () => {
    await withFixture(async (fixture, initial) => {
      const first = start(fixture, "rollback-first", renew(fixture), { hold: true });
      await held(first);
      assert.deepEqual(storedState(fixture), initial);
      await finish(first, "ROLLBACK");
      assert.deepEqual(storedState(fixture), initial);
      const explicitAttempt = start(fixture, "after-rollback", renew(fixture));
      const result = await completed(explicitAttempt);
      assert.equal(result.status, 0, result.stderr);
      assertRenewed(fixture, initial, storedState(fixture));
    });
  });

  await t.test("the acceptance lock prefix waits for renewal and re-reads the new pending expiry", async () => {
    await withFixture(async (fixture, initial) => {
      const first = start(fixture, "ordering-first", renew(fixture), { hold: true });
      const firstPid = await held(first);
      // This executes only acceptance's state -> invitation -> organization lock
      // prefix. It does not call acceptance or prove password/session behavior.
      const second = start(fixture, "acceptance-prefix", `
        SELECT organization_id FROM public.organization_authorization_states
          WHERE organization_id='${fixture.org}' FOR UPDATE;
        SELECT 'REREAD:' || jsonb_build_object('id',id,'status',status,
          'expiry',expires_at::text,'fresh',expires_at>clock_timestamp())::text
          FROM public.organization_invitations WHERE id='${fixture.invitation}' FOR UPDATE;
        SELECT id FROM public.organizations WHERE id='${fixture.org}' FOR UPDATE;`,
      { serviceRole: false });
      await until(() => run(`SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_stat_activity waiter
        JOIN pg_catalog.pg_stat_activity blocker
          ON blocker.pid=${firstPid} AND blocker.application_name=${literal(first.name)}
          AND blocker.datname=current_database()
        WHERE waiter.application_name=${literal(second.name)} AND waiter.datname=current_database()
          AND waiter.wait_event_type='Lock' AND blocker.pid=ANY(pg_catalog.pg_blocking_pids(waiter.pid))
      );`) === "t", "Acceptance lock prefix never blocked on the exact renewal transaction", second);
      await finish(first);
      const result = await completed(second);
      assert.equal(result.status, 0, result.stderr);
      const saved = storedState(fixture);
      assertRenewed(fixture, initial, saved);
      assert.deepEqual(taggedJson(result.stdout, "REREAD:"), {
        id: fixture.invitation, status: "pending", expiry: saved.expiry, fresh: true,
      });
    });
  });
});
