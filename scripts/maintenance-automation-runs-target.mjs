import assert from "node:assert/strict";
import { configuredDepositContainer } from "./deposit-candidate-target.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";

// The caller must name its owned local project. Never discover a database by
// proximity, fall back to the shared developer stack, or accept a database URL.
export async function maintenanceAutomationRunsTarget({ config, execute, env = process.env, platform = process.platform }) {
  const project = env.MAINTENANCE_RUNS_LOCAL_PROJECT;
  assert.match(project ?? "", /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    "Set MAINTENANCE_RUNS_LOCAL_PROJECT to the verified local test project.");
  const container = `supabase_db_${project}`;
  if (env.CI === "true" && env.GITHUB_ACTIONS === "true") {
    assert.equal(container, configuredDepositContainer(config),
      "Maintenance integration project must match the local GitHub Actions configuration.");
  } else {
    assert.match(project, /^nestory-ips-operations-[0-9]{8}$/,
      "Developer maintenance integration requires an explicitly isolated operations project.");
  }
  assert.ok(!env.SUPABASE_DB_CONTAINER || env.SUPABASE_DB_CONTAINER === container,
    "Conflicting explicit maintenance database target.");
  for (const key of ["DATABASE_URL", "SUPABASE_DB_URL", "PGHOST", "PGSERVICE", "PGSERVICEFILE"]) {
    assert.ok(!env[key], "Maintenance integration refuses database connection overrides.");
  }

  const { docker, endpoint } = await localRecoveryDocker({ execute, env, platform });
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}';
  const inspect = () => JSON.parse(docker(["inspect", container, "--format", format]));
  function verify(value, expectedId) {
    assert.match(value.id, /^[a-f0-9]{64}$/);
    if (expectedId) assert.equal(value.id, expectedId, "Maintenance test container was replaced.");
    assert.equal(value.name, `/${container}`, "Maintenance test container name changed.");
    assert.equal(value.project, project, "Maintenance test container project label changed.");
    assert.equal(value.running, true, "Maintenance test container is not running.");
  }
  const initial = inspect();
  verify(initial);
  const args = ["exec", "-i", initial.id, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
  return Object.freeze({
    endpoint, container, containerId: initial.id,
    run(sql) {
      verify(inspect(), initial.id);
      return docker(args, sql).trim();
    },
    spawnWorker() {
      verify(inspect(), initial.id);
      return docker(args, undefined, { worker: true });
    },
  });
}
