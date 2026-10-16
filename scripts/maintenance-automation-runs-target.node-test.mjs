import assert from "node:assert/strict";
import { test } from "node:test";
import { maintenanceAutomationRunsTarget } from "./maintenance-automation-runs-target.mjs";

const project = "nestory-ips-operations-20261016";
const container = `supabase_db_${project}`;
const endpoint = "npipe:////./pipe/dockerDesktopLinuxEngine";
function harness(overrides = {}) {
  const calls = [];
  const state = { id: "a".repeat(64), name: `/${container}`, project, running: true };
  const execute = (command, args, input, options) => {
    calls.push({ command, args, input, options });
    if (args.join(" ") === "context show") return "desktop-linux\n";
    if (args[0] === "context" && args[1] === "inspect") return JSON.stringify(overrides.endpoint ?? endpoint);
    if (args[2] === "inspect") return JSON.stringify(state);
    if (args[2] === "exec") return options.worker ? { worker: true } : "query-result\n";
    throw Error("Unexpected mock Docker command.");
  };
  const input = { execute, config: 'project_id = "nestory"', platform: "win32",
    env: { MAINTENANCE_RUNS_LOCAL_PROJECT: project, ...overrides.env } };
  return { calls, state, input };
}

test("pins local Docker endpoint and full isolated container identity for every operation", async () => {
  const { calls, input } = harness();
  const target = await maintenanceAutomationRunsTarget(input);
  assert.equal(target.container, container);
  assert.equal(target.run("SELECT 1"), "query-result");
  assert.deepEqual(target.spawnWorker(), { worker: true });
  const executions = calls.filter(call => call.args[2] === "exec");
  assert.equal(executions.length, 2);
  for (const call of executions) {
    assert.deepEqual(call.args.slice(0, 5), ["--host", endpoint, "exec", "-i", "a".repeat(64)]);
    assert.ok(call.args.includes("postgres"));
  }
  assert.equal(calls.filter(call => call.args[2] === "inspect").length, 3);
});

test("refuses missing or shared developer project before Docker access", async () => {
  for (const value of [undefined, "nestory", "nestory-ips-readiness-test", "nestory-ips-operations-20261016;evil"]) {
    const { calls, input } = harness({ env: { MAINTENANCE_RUNS_LOCAL_PROJECT: value } });
    await assert.rejects(maintenanceAutomationRunsTarget(input));
    assert.equal(calls.length, 0);
  }
});

test("CI alone cannot relax developer isolation", async () => {
  for (const env of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }]) {
    const { input } = harness({ env: { ...env, MAINTENANCE_RUNS_LOCAL_PROJECT: "nestory" } });
    await assert.rejects(maintenanceAutomationRunsTarget(input), /isolated operations project/);
  }
});

test("GitHub Actions must explicitly match the single configured local project", async () => {
  const { input, state } = harness({ env: { CI: "true", GITHUB_ACTIONS: "true", MAINTENANCE_RUNS_LOCAL_PROJECT: "nestory" } });
  state.name = "/supabase_db_nestory";
  state.project = "nestory";
  assert.equal((await maintenanceAutomationRunsTarget(input)).container, "supabase_db_nestory");
  await assert.rejects(maintenanceAutomationRunsTarget({ ...input, config: 'project_id = "other"' }), /must match/);
  await assert.rejects(maintenanceAutomationRunsTarget({ ...input, config: 'project_id = "nestory"\nproject_id = "nestory"' }), /one local Supabase/);
});

test("refuses connection URLs and conflicting explicit container targets", async () => {
  for (const env of [
    { DATABASE_URL: "postgresql://remote.invalid/db" },
    { SUPABASE_DB_URL: "postgresql://remote.invalid/db" },
    { PGHOST: "remote.invalid" },
    { PGSERVICE: "remote" },
    { PGSERVICEFILE: "remote.conf" },
    { SUPABASE_DB_CONTAINER: "supabase_db_nestory" },
  ]) {
    const { input, calls } = harness({ env });
    await assert.rejects(maintenanceAutomationRunsTarget(input));
    assert.equal(calls.length, 0);
  }
});

test("refuses Docker target overrides and remote engine endpoints", async () => {
  const override = harness({ env: { DOCKER_HOST: "tcp://remote.invalid:2375" } });
  await assert.rejects(maintenanceAutomationRunsTarget(override.input), /overrides/);
  const remote = harness({ endpoint: "tcp://remote.invalid:2375" });
  await assert.rejects(maintenanceAutomationRunsTarget(remote.input), /local Docker endpoint/);
});

test("refuses stopped, mislabeled or wrongly named containers", async () => {
  for (const change of [{ running: false }, { project: "nestory" }, { name: "/supabase_db_nestory" }]) {
    const { input, state } = harness();
    Object.assign(state, change);
    await assert.rejects(maintenanceAutomationRunsTarget(input));
  }
});

test("rechecks identity before queries and workers and rejects replacement", async () => {
  const { input, state, calls } = harness();
  const target = await maintenanceAutomationRunsTarget(input);
  state.id = "b".repeat(64);
  assert.throws(() => target.run("SELECT 1"), /replaced/);
  assert.throws(() => target.spawnWorker(), /replaced/);
  assert.equal(calls.filter(call => call.args[2] === "exec").length, 0);
});
