import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { before, test } from "node:test";
import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Maintenance concurrency fixtures require a disposable GitHub Actions runner.");
const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const actorId = "00000000-0000-0000-0000-000000000101";
const runAt = "2039-02-14 09:00+00";
const inventory = spawnSync("docker", ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"], {
  cwd: repoRoot, encoding: "utf8", shell: false,
});
assert.equal(inventory.status, 0, inventory.stderr);
const container = selectLocalDatabaseContainer(repoRoot, inventory.stdout.split(/\r?\n/).filter(Boolean));

function psqlArgs(interactive = false) {
  return ["exec", ...(interactive ? ["-i"] : []), container, "psql", "-X", "-qAt", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
}
function run(sql) {
  const result = spawnSync("docker", [...psqlArgs(), "-c", sql], {
    cwd: repoRoot, encoding: "utf8", shell: false, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function transaction(sql, name = "maintenance-" + randomUUID()) {
  return `BEGIN;
    SET LOCAL application_name = '${name}';
    SET LOCAL statement_timeout = '20s';
    SET LOCAL idle_in_transaction_session_timeout = '30s';
    ${sql}`;
}
function session(sql) {
  const child = spawn("docker", psqlArgs(true), { cwd: repoRoot, shell: false });
  const value = { child, stdout: "", stderr: "", closed: false };
  child.stdout.on("data", (chunk) => { value.stdout += chunk; });
  child.stderr.on("data", (chunk) => { value.stderr += chunk; });
  value.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => { value.closed = true; resolve({ ...value, status }); });
  });
  child.stdin.write(sql + "\n");
  return value;
}
async function waitUntil(predicate, detail, observed) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (observed?.closed) assert.fail("Session closed before " + detail + ": " + observed.stderr);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for " + detail);
}
async function finish(value, command = "COMMIT") {
  value.child.stdin.end(command + ";\n");
  const result = await value.done;
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /deadlock detected/i);
  return result;
}
async function cleanup(...values) {
  for (const value of values.filter(Boolean)) {
    if (!value.closed) await finish(value, "ROLLBACK");
  }
}
const automation = `SELECT public.run_maintenance_automation('${runAt}', 100);`;

function createTask(frequency = "none") {
  const output = run(transaction(`SELECT set_config('request.jwt.claim.sub','${actorId}',true);
    SELECT public.create_maintenance_task('${organizationId}',
      '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      'Concurrent reminder ${randomUUID()}', NULL, 'Plumbing', 'normal', 'scheduled',
      '2039-01-15', '09:00', '2039-01-14', '09:00', NULL, NULL, NULL,
      '[]', '${frequency}', '00000000-0000-0000-0000-000000000211', NULL);
    COMMIT;`));
  const id = output.split(/\r?\n/).filter((line) => /^[0-9a-f-]{36}$/.test(line)).at(-1);
  assert.ok(id);
  if (frequency === "none") {
    run(`UPDATE public.tasks SET reminder_date='2039-02-14' WHERE id='${id}';`);
  }
  return id;
}

before(() => {
  run(`UPDATE public.maintenance_recurrence_series SET lifecycle='paused';
    UPDATE public.notification_outbox SET status='cancelled' WHERE status IN ('pending','retry','processing');`);
});

test("concurrent scheduler retries generate and deliver one advance occurrence", async () => {
  const taskId = createTask("monthly");
  run(`UPDATE public.notification_outbox SET status='cancelled' WHERE task_id='${taskId}';`);
  const seriesId = run(`SELECT recurrence_series_id FROM public.tasks WHERE id='${taskId}';`);
  const name = "maintenance-replay-" + randomUUID();
  const first = session(transaction(automation + " SELECT 'maintenance_delivered';"));
  let second;
  try {
    await waitUntil(() => first.stdout.includes("maintenance_delivered"), "first delivery", first);
    second = session(transaction(automation, name));
    await waitUntil(() => run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE application_name='${name}' AND wait_event_type='Lock');`) === "t", "serialized replay", second);
    const original = await finish(first);
    const replayed = await finish(second);
    assert.match(original.stdout, /"generated": 1/);
    assert.match(original.stdout, /"delivered": 1/);
    assert.match(replayed.stdout, /"generated": 0/);
    assert.match(replayed.stdout, /"delivered": 0/);
    assert.equal(run(`SELECT count(*) FROM public.tasks WHERE recurrence_series_id='${seriesId}'
      AND recurrence_occurrence_at='2039-02-15 09:00+00';`), "1");
    assert.equal(run(`SELECT count(*) FROM public.notification_delivery_attempts AS attempt
      JOIN public.notification_outbox AS outbox ON outbox.id=attempt.outbox_id
      JOIN public.tasks AS task ON task.id=outbox.task_id
      WHERE task.recurrence_series_id='${seriesId}';`), "1");
  } finally {
    await cleanup(first, second);
    run(`UPDATE public.maintenance_recurrence_series SET lifecycle='paused' WHERE id='${seriesId}';`);
  }
});

for (const release of ["COMMIT", "ROLLBACK"]) {
  test(`a locked cancellation is skipped and ${release.toLowerCase()} is revalidated on retry`, async () => {
    const id = createTask();
    const first = session(transaction(`UPDATE public.tasks SET status='cancelled' WHERE id='${id}';
      SELECT 'maintenance_cancelled';`));
    let second;
    try {
      await waitUntil(() => first.stdout.includes("maintenance_cancelled"), "task cancellation", first);
      second = session(transaction(automation + " SELECT 'maintenance_skipped';"));
      await waitUntil(() => second.stdout.includes("maintenance_skipped"), "nonblocking delivery skip", second);
      const skipped = await finish(second);
      assert.match(skipped.stdout, /"delivered": 0/);
      await finish(first, release);
      const retried = JSON.parse(run(automation));
      assert.equal(retried.delivered, release === "COMMIT" ? 0 : 1);
      assert.equal(run(`SELECT status FROM public.notification_outbox WHERE task_id='${id}'
        AND scheduled_for='${runAt}';`), release === "COMMIT" ? "cancelled" : "delivered");
      assert.equal(run(`SELECT count(*) FROM public.notification_delivery_attempts AS attempt
        JOIN public.notification_outbox AS outbox ON outbox.id=attempt.outbox_id WHERE outbox.task_id='${id}';`),
      release === "COMMIT" ? "0" : "1");
    } finally {
      await cleanup(first, second);
    }
  });
}

for (const release of ["COMMIT", "ROLLBACK"]) {
  test(`delivery ${release.toLowerCase()} and concurrent cancellation share task-first lock order`, async () => {
    const id = createTask();
    const first = session(transaction(automation + " SELECT 'maintenance_delivery_held';"));
    const name = "maintenance-cancellation-" + randomUUID();
    let second;
    try {
      await waitUntil(() => first.stdout.includes("maintenance_delivery_held"), "delivery lock", first);
      second = session(transaction(`UPDATE public.tasks SET status='cancelled' WHERE id='${id}';`, name));
      await waitUntil(() => run(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE application_name='${name}' AND wait_event_type='Lock');`) === "t", "cancellation waiting for task", second);
      await finish(first, release);
      await finish(second);
      assert.equal(run(`SELECT status FROM public.notification_outbox WHERE task_id='${id}'
        AND scheduled_for='${runAt}';`), release === "COMMIT" ? "delivered" : "cancelled");
      assert.equal(run(`SELECT count(*) FROM public.notification_delivery_attempts AS attempt
        JOIN public.notification_outbox AS outbox ON outbox.id=attempt.outbox_id WHERE outbox.task_id='${id}';`),
      release === "COMMIT" ? "1" : "0");
      assert.equal(JSON.parse(run(automation)).delivered, 0);
    } finally {
      await cleanup(first, second);
    }
  });
}
