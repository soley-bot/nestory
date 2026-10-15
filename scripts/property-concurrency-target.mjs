import assert from "node:assert/strict";
import { configuredDepositContainer } from "./deposit-candidate-target.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";

// One verified local endpoint and full container identity own discovery, SQL,
// workers and cleanup. The injected executor keeps target tests database-free.
export async function propertyConcurrencyTarget({ config, execute, env = process.env, platform = process.platform }) {
  const { docker, endpoint } = await localRecoveryDocker({ execute, env, platform });
  let container = env.PROPERTY_CONCURRENCY_DB_CONTAINER;
  if (env.CI === "true") {
    const configured = configuredDepositContainer(config);
    assert.ok(!container || container === configured, "Property test database must match the verified local CI configuration.");
    container = configured;
  } else {
    assert.match(container ?? "", /^supabase_db_nestory-ips-readiness-[a-z0-9-]+$/,
      "Set PROPERTY_CONCURRENCY_DB_CONTAINER to the isolated readiness database container.");
  }
  assert.ok(!env.SUPABASE_DB_CONTAINER || env.SUPABASE_DB_CONTAINER === container, "Conflicting explicit property database target.");
  const running = docker(["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"])
    .split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  assert.ok(running.includes(container), "The selected local property database container is not running.");
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}';
  const inspect = () => JSON.parse(docker(["inspect", container, "--format", format]));
  function verify(value, id) {
    assert.match(value.id, /^[a-f0-9]{64}$/);
    if (id) assert.equal(value.id, id, "Property concurrency container was replaced.");
    assert.equal(value.name, `/${container}`, "Property concurrency container name changed.");
    assert.equal(value.project, container.slice("supabase_db_".length), "Property concurrency project label changed.");
    assert.equal(value.running, true, "Property concurrency container stopped.");
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
