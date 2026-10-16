// Explicitly invoked against an owned local test stack. No stack discovery,
// credentials, schedule, retry, reset, fixture deletion or hosted connection.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { maintenanceAutomationRunsTarget } from "./maintenance-automation-runs-target.mjs";

function execute(command, args, input, { worker = false, ...options } = {}) {
  if (worker) return spawn(command, args, { ...options, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const result = spawnSync(command, args, { ...options, input, encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const database = await maintenanceAutomationRunsTarget({
  config: readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"), execute,
});
const run = sql => database.run(`SET statement_timeout='20s';\n${sql}`);
const results = [];
const sessions = [];
const prefix = `maint-${randomUUID()}`;
const begin = id => `public.begin_maintenance_automation_run('${id}',100)`;
const perform = id => `public.execute_maintenance_automation_run('${id}')`;
const register = id => JSON.parse(run(`SET ROLE service_role; SELECT ${begin(id)};`));
const snapshot = id => JSON.parse(run(`SELECT jsonb_build_object('status',status,'finished_at',finished_at,
  'generated',generated,'delivered',delivered,'failure_code',failure_code)
  FROM app_private.maintenance_automation_runs WHERE run_id='${id}';`));
const unknown = { status: "registered", finished_at: null, generated: null, delivered: null, failure_code: null };

function start(suffix, body, hold = false) {
  const name = `${prefix}-${suffix}`;
  assert.ok(Buffer.byteLength(name) <= 63);
  const child = database.spawnWorker();
  const session = { name, child, stdout: "", stderr: "", closed: false, status: null };
  session.done = new Promise(resolve => {
    child.on("error", error => { session.stderr += error.message; });
    child.on("close", status => { session.closed = true; session.status = status; resolve(session); });
  });
  child.stdout.on("data", chunk => { session.stdout += chunk; });
  child.stderr.on("data", chunk => { session.stderr += chunk; });
  child.stdin.on("error", error => { session.stderr += error.message; });
  sessions.push(session);
  child.stdin.write(`SET application_name='${name}'; SET statement_timeout='20s';
    SET idle_in_transaction_session_timeout='30s'; BEGIN;\n${body}\n\\echo MAINTENANCE_READY\n`);
  if (!hold) child.stdin.end("COMMIT;\n");
  return session;
}
async function until(predicate, label, session) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    assert.ok(!session?.closed, `${label}: worker exited: ${session?.stderr}`);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(`Timed out waiting for ${label}`);
}
const ready = session => until(() => session.stdout.includes("MAINTENANCE_READY"), "held transaction", session);
const blocked = (session, blocker) => until(() => run(`SELECT EXISTS (
  SELECT 1 FROM pg_stat_activity AS waiting JOIN pg_stat_activity AS holding
    ON holding.pid = ANY(pg_blocking_pids(waiting.pid))
  WHERE waiting.datname=current_database() AND holding.datname=current_database()
    AND waiting.application_name='${session.name}' AND holding.application_name='${blocker.name}'
    AND waiting.wait_event_type='Lock');`) === "t", "observed PostgreSQL lock contention", session);
async function finish(session, action = "COMMIT") {
  session.child.stdin.end(`${action};\n`);
  await session.done;
  assert.equal(session.status, 0, session.stderr);
}
const returned = session => JSON.parse(session.stdout.split(/\r?\n/).find(line => line.startsWith("{")) ?? "null");
const passed = name => results.push({ name, passed: true });

function verifySnapshotPlan() {
  // Use the operator's actual query, preserving its CTEs and ordering. The
  // diagnostic transaction envelope itself is read-only, so extract only the
  // single query for this explicitly synthetic, rollback-wrapped plan check.
  const diagnostic = readFileSync(new URL("./inspect-maintenance-runs.sql", import.meta.url), "utf8");
  const match = diagnostic.match(/\bWITH latest_registration AS MATERIALIZED \([\s\S]+?\nFROM unresolved;/);
  assert.ok(match, "Could not identify the reviewed operator snapshot query.");
  const plan = JSON.parse(run(`BEGIN;
    SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s';
    INSERT INTO app_private.maintenance_automation_runs (
      run_id,run_at,registered_at,work_limit,status,finished_at,generated,delivered,failure_code)
    SELECT gen_random_uuid(), registered_at, registered_at, 100, status,
      CASE WHEN status <> 'registered' THEN registered_at + interval '1 second' END,
      CASE WHEN status = 'succeeded' THEN 0 END,
      CASE WHEN status = 'succeeded' THEN 0 END,
      CASE WHEN status = 'failed' THEN 'maintenance_execution_failed' END
    FROM (SELECT statement_timestamp() - interval '1 day' + n * interval '1 second' AS registered_at,
      CASE WHEN n % 100 = 0 THEN 'registered' WHEN n % 20 = 1 THEN 'failed' ELSE 'succeeded' END AS status
      FROM generate_series(1,20000) AS n) AS synthetic;
    ANALYZE app_private.maintenance_automation_runs;
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${match[0]}
    ROLLBACK;
    ANALYZE app_private.maintenance_automation_runs;`))[0];
  const nodes = [];
  const walk = node => { nodes.push(node); for (const child of node.Plans ?? []) walk(child); };
  walk(plan.Plan);
  const indexes = nodes.filter(node => node["Index Name"]).map(node => node["Index Name"]);
  for (const expected of ["maintenance_automation_runs_registered_idx", "maintenance_automation_runs_terminal_idx", "maintenance_automation_runs_unresolved_idx"]) {
    assert.ok(indexes.includes(expected), `Snapshot query did not use ${expected}: ${JSON.stringify(plan)}`);
  }
  assert.equal(indexes.filter(name => name === "maintenance_automation_runs_terminal_idx").length, 2,
    "Both terminal-status heads must use the terminal index.");
  assert.ok(!nodes.some(node => node["Node Type"] === "Seq Scan" && node["Relation Name"] === "maintenance_automation_runs"),
    "Snapshot unexpectedly scans the full synthetic run history.");
  results.push({ name: "operator snapshot uses all three intended indexes at 20000 synthetic rows", passed: true,
    planningMs: plan["Planning Time"], executionMs: plan["Execution Time"],
    indexes, scans: nodes.filter(node => node["Index Name"] || node["Relation Name"]).map(node => ({
      type: node["Node Type"], index: node["Index Name"], rows: node["Actual Rows"], loops: node["Actual Loops"],
    })) });
}

try {
  // Commit/concurrency coverage uses zero-work runs. Actual business rollback
  // is tested separately in rollback-wrapped maintenance_automation_runs_test.sql.
  assert.equal(run(`SELECT NOT EXISTS (
    SELECT 1 FROM public.maintenance_recurrence_revisions AS revision
    JOIN public.maintenance_recurrence_series AS series ON series.id=revision.series_id
      AND series.organization_id=revision.organization_id
    WHERE revision.superseded_at IS NULL AND series.lifecycle='active'
      AND revision.next_occurrence_at <= clock_timestamp())
    AND NOT EXISTS (SELECT 1 FROM public.notification_outbox
      WHERE status IN ('pending','retry') AND scheduled_for <= clock_timestamp()
        AND next_attempt_at <= clock_timestamp());`), "t",
  "Integration requires an isolated stack with no due maintenance business work.");

  const duplicateId = randomUUID();
  const firstBegin = start("begin1", `SET LOCAL ROLE service_role; SELECT ${begin(duplicateId)};`, true);
  await ready(firstBegin);
  assert.equal(run(`SELECT count(*) FROM app_private.maintenance_automation_runs WHERE run_id='${duplicateId}';`), "0");
  const secondBegin = start("begin2", `SET LOCAL ROLE service_role; SELECT ${begin(duplicateId)};`);
  await blocked(secondBegin, firstBegin);
  await finish(firstBegin);
  await secondBegin.done;
  assert.equal(secondBegin.status, 0, secondBegin.stderr);
  assert.equal(returned(firstBegin).created, true);
  assert.deepEqual(returned(secondBegin), { ...returned(firstBegin), created: false });
  assert.deepEqual(snapshot(duplicateId), unknown);
  passed("concurrent begin commits one identity and preserves the database cutoff");

  const firstExecution = start("same1", `SET LOCAL ROLE service_role; SELECT ${perform(duplicateId)};`, true);
  await ready(firstExecution);
  assert.deepEqual(snapshot(duplicateId), unknown);
  const secondExecution = start("same2", `SET LOCAL ROLE service_role; SELECT ${perform(duplicateId)};`);
  await blocked(secondExecution, firstExecution);
  await finish(firstExecution);
  await secondExecution.done;
  assert.equal(secondExecution.status, 0, secondExecution.stderr);
  assert.deepEqual(returned(firstExecution), returned(secondExecution));
  assert.equal(returned(firstExecution).status, "succeeded");
  assert.equal(returned(firstExecution).generated, 0);
  assert.equal(returned(firstExecution).delivered, 0);
  assert.equal(snapshot(duplicateId).status, "succeeded");
  passed("same-identity concurrent execution replays one committed success");

  const distinctOne = randomUUID(), distinctTwo = randomUUID();
  register(distinctOne); register(distinctTwo);
  const firstDistinct = start("distinct1", `SET LOCAL ROLE service_role; SELECT ${perform(distinctOne)};`, true);
  await ready(firstDistinct);
  const secondDistinct = start("distinct2", `SET LOCAL ROLE service_role; SELECT ${perform(distinctTwo)};`);
  await blocked(secondDistinct, firstDistinct);
  assert.deepEqual(snapshot(distinctTwo), unknown);
  await finish(firstDistinct);
  await secondDistinct.done;
  assert.equal(secondDistinct.status, 0, secondDistinct.stderr);
  assert.equal(returned(secondDistinct).status, "succeeded");
  passed("distinct identities retain the legacy global transaction serialization");

  const failedId = randomUUID();
  register(failedId);
  // A session-local function and transaction-scoped trigger inject the failure
  // after business execution. Remove the trigger before committing the known
  // failure; an unexpected error instead rolls the entire test transaction back.
  const failed = JSON.parse(run(`BEGIN;
    CREATE FUNCTION pg_temp.maintenance_run_finalization_fault() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.run_id='${failedId}'::uuid AND NEW.status='succeeded' THEN
        RAISE EXCEPTION 'synthetic private finalization payload';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER maintenance_run_integration_fault BEFORE UPDATE
      ON app_private.maintenance_automation_runs FOR EACH ROW
      EXECUTE FUNCTION pg_temp.maintenance_run_finalization_fault();
    SET LOCAL ROLE service_role;
    SELECT ${perform(failedId)};
    RESET ROLE;
    DROP TRIGGER maintenance_run_integration_fault ON app_private.maintenance_automation_runs;
    COMMIT;`));
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure_code, "maintenance_execution_failed");
  assert.equal(failed.generated, null);
  assert.equal(failed.delivered, null);
  assert.ok(failed.finished_at);
  assert.ok(!JSON.stringify(failed).includes("synthetic private"));
  assert.equal(snapshot(failedId).status, "failed");
  assert.deepEqual(JSON.parse(run(`SET ROLE service_role; SELECT ${perform(failedId)};`)), failed);
  passed("caught failure commits durably and terminal replay preserves the sanitized outcome");

  const rollbackId = randomUUID();
  const original = register(rollbackId);
  const rollback = start("rollback", `SET LOCAL ROLE service_role; SELECT ${perform(rollbackId)};`, true);
  await ready(rollback);
  assert.equal(returned(rollback).status, "succeeded");
  await finish(rollback, "ROLLBACK");
  assert.deepEqual(snapshot(rollbackId), unknown);
  assert.deepEqual(register(rollbackId), { ...original, created: false });
  passed("outer rollback preserves prior committed registration and no terminal result");

  const cancelId = randomUUID();
  register(cancelId);
  const holder = start("lockholder", "SELECT pg_advisory_xact_lock(hashtextextended('maintenance_automation_v1',0));", true);
  await ready(holder);
  const cancelled = start("cancelled", `SET LOCAL ROLE service_role; SELECT ${perform(cancelId)};`);
  await blocked(cancelled, holder);
  assert.equal(run(`SELECT pg_cancel_backend(pid) FROM pg_stat_activity
    WHERE datname=current_database() AND application_name='${cancelled.name}';`), "t");
  await cancelled.done;
  assert.notEqual(cancelled.status, 0);
  assert.match(cancelled.stderr, /57014/);
  assert.deepEqual(snapshot(cancelId), unknown);
  await finish(holder, "ROLLBACK");
  passed("real query cancellation leaves the registered outcome unresolved");

  const interruptedId = randomUUID();
  register(interruptedId);
  const interrupted = start("interrupted", `SET LOCAL ROLE service_role; SELECT ${perform(interruptedId)};`, true);
  await ready(interrupted);
  assert.equal(returned(interrupted).status, "succeeded");
  assert.equal(run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname=current_database() AND application_name='${interrupted.name}';`), "t");
  // Force psql to observe the terminated connection rather than exiting cleanly
  // on stdin EOF without another libpq operation.
  interrupted.child.stdin.end("SELECT 1;\n");
  await interrupted.done;
  assert.notEqual(interrupted.status, 0);
  assert.deepEqual(snapshot(interruptedId), unknown);
  passed("process interruption before commit preserves registration without false failure");

  verifySnapshotPlan();

  process.stdout.write(`${JSON.stringify({ container: database.container, results }, null, 2)}\n`);
} finally {
  // Terminate only this process's exact generated worker sessions. Leave test
  // ledger records in the disposable stack; no deletion or reset is performed.
  for (const session of sessions.filter(value => !value.closed)) {
    run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname=current_database() AND application_name='${session.name}';`);
    session.child.stdin.end();
    await session.done;
  }
}
