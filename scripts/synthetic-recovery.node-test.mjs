import assert from "node:assert/strict";
import test from "node:test";
import { MIN_FREE_BYTES, rehearseSyntheticRecovery } from "./synthetic-recovery-core.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";

function harness(overrides = {}) {
  const calls = [];
  const docker = async (args, input, options) => {
    calls.push({ args, input, options });
    if (overrides.fail?.(args)) throw new Error("synthetic command failure");
    if (args[0] === "ps") return args[args.indexOf("--filter") + 1].replace("name=^/", "").replace(/\$$/, "");
    if (args[0] === "image") return overrides.image ?? JSON.stringify({ id: `sha256:${"a".repeat(64)}`, digests: [`postgres@sha256:${"b".repeat(64)}`] });
    if (args[0] === "inspect") return args.includes('{{index .Config.Labels "codex.rehearsal"}}')
      ? overrides.label ?? "synthetic-only"
      : JSON.stringify({ network: overrides.network ?? "none", ports: {}, mounts: [], tmpfs: { "/var/lib/postgresql/data": "size=268435456", "/tmp": "size=16777216" } });
    if (args.includes("psql") && args.includes("synthetic_restore")) return overrides.marker ?? "DO\nsynthetic_restore_verified\n";
    if (args.includes("bash")) return args.at(-1).includes("stat -c")
      ? `${"a".repeat(64)}  /tmp/synthetic.dump\n4156\n`
      : `${"b".repeat(64)}  /tmp/source-files/document.txt\n${overrides.fileHash ?? "b".repeat(64)}  /tmp/restored-files/document.txt\n`;
    return "";
  };
  return { calls, options: { docker, freeBytes: MIN_FREE_BYTES + 1, pause: async () => {} } };
}

test("low or unknown free space blocks every Docker operation", async () => {
  for (const freeBytes of [MIN_FREE_BYTES - 1, NaN]) {
    const h = harness();
    await assert.rejects(rehearseSyntheticRecovery({ ...h.options, freeBytes }), /8 GiB/);
    assert.equal(h.calls.length, 0);
  }
});

test("success proves database marker and matching file hashes, then removes only its labelled target", async () => {
  const h = harness();
  const result = await rehearseSyntheticRecovery(h.options);
  assert.equal(result.productionRestoreProven, false);
  assert.equal(result.databaseVerified, true);
  assert.equal(result.fileBytesVerified, true);
  assert.equal(result.removed, true);
  const run = h.calls.find(c => c.args[0] === "run").args;
  assert.equal(run[run.indexOf("--network") + 1], "none");
  assert.equal(run[run.indexOf("--pull") + 1], "never");
  assert.ok(!run.includes("--publish") && !run.includes("--volume"));
  const name = run[run.indexOf("--name") + 1];
  assert.deepEqual(h.calls.at(-1).args, ["rm", "--force", name]);
});

test("missing cached image prevents container creation", async () => {
  const h = harness({ fail: args => args[0] === "image" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /synthetic command failure/);
  assert.equal(h.calls.length, 1);
});

test("failed isolation check prevents SQL and still cleans up", async () => {
  const h = harness({ network: "bridge" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /isolation/);
  assert.ok(!h.calls.some(c => c.args.includes("psql")));
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("pg_restore failure is fatal and cleanup still runs", async () => {
  const h = harness({ fail: args => args.includes("pg_restore") });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /synthetic command failure/);
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("uncertain create outcome checks for and removes only the matching labelled container", async () => {
  const h = harness({ fail: args => args[0] === "run" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /synthetic command failure/);
  assert.ok(h.calls.some(c => c.args[0] === "ps"));
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("successful restore exit without validation evidence does not count as verified", async () => {
  const h = harness({ marker: "DO\n" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /validation marker/);
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("file corruption cannot produce successful evidence", async () => {
  const h = harness({ fileHash: "c".repeat(64) });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /file restore evidence/);
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("cleanup refuses a target whose label does not match", async () => {
  const h = harness({ label: "shared" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), /Refusing cleanup/);
  assert.ok(!h.calls.some(c => c.args[0] === "rm"));
});

test("falling below disk floor after source setup prevents dumping and cleans up", async () => {
  const h = harness();
  let checks = 0;
  await assert.rejects(rehearseSyntheticRecovery({ ...h.options, readFreeBytes: async () => ++checks === 1 ? MIN_FREE_BYTES + 1 : MIN_FREE_BYTES - 1 }), /fell below/);
  assert.ok(!h.calls.some(c => c.args.includes("pg_dump")));
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("Docker environment overrides fail before even context inspection", async () => {
  for (const [key, value] of [
    ["DOCKER_HOST", "tcp://remote.example:2375"], ["DOCKER_HOST", "npipe:////./pipe/docker_engine"],
    ["DOCKER_CONTEXT", "remote"], ["DOCKER_CONFIG", "other-config"],
    ["DOCKER_TLS_VERIFY", "1"], ["DOCKER_CERT_PATH", "private-certs"], ["DOCKER_API_VERSION", "1.40"],
  ]) {
    await assert.rejects(localRecoveryDocker({ env: { [key]: value }, platform: "win32", execute: () => assert.fail("must not execute") }), /overrides/);
  }
});

test("active remote and unknown Docker contexts cannot reach a daemon", async () => {
  for (const endpoint of ["tcp://remote.example:2375", "ssh://remote.example", "tcp://127.0.0.1:2375", "npipe:////remote/pipe/docker_engine", "unix:///tmp/unknown.sock"]) {
    const calls = [];
    await assert.rejects(localRecoveryDocker({ env: {}, platform: "win32", execute: async (_file, args) => {
      calls.push(args);
      return args.includes("show") ? "remote\n" : JSON.stringify(endpoint);
    } }), /local Docker endpoint/);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(args => args[0] === "context"));
  }
});

test("verified local endpoint is pinned for work and cleanup despite later environment changes", async () => {
  const env = {};
  const calls = [];
  const { docker, endpoint } = await localRecoveryDocker({ env, platform: "win32", execute: async (_file, args, _input, options) => {
    calls.push({ args, options });
    if (args.includes("show")) return "desktop-linux\n";
    if (args[0] === "context") return '"npipe:////./pipe/dockerDesktopLinuxEngine"';
    return "";
  } });
  env.DOCKER_HOST = "tcp://remote.example:2375";
  await docker(["image", "inspect", "postgres:16-bookworm"]);
  await docker(["rm", "--force", "synthetic-name"], undefined, { timeoutMs: 42 });
  for (const call of calls.slice(2)) {
    assert.deepEqual(call.args.slice(0, 2), ["--host", endpoint]);
    assert.equal(call.options.env.DOCKER_HOST, undefined);
  }
  assert.equal(calls.at(-1).options.timeoutMs, 42);
});

test("only the supported local Unix socket is accepted on Linux", async () => {
  const local = await localRecoveryDocker({ env: {}, platform: "linux", execute: async (_file, args) => args.includes("show") ? "default" : '"unix:///var/run/docker.sock"' });
  assert.equal(local.endpoint, "unix:///var/run/docker.sock");
});

test("null digest or invalid image ID fails before creation; valid ID is used for run", async () => {
  for (const image of [{ id: `sha256:${"a".repeat(64)}`, digests: null }, { id: "tag", digests: [`postgres@sha256:${"b".repeat(64)}`] }]) {
    const h = harness({ image: JSON.stringify(image) });
    await assert.rejects(rehearseSyntheticRecovery(h.options), /image identity/);
    assert.ok(!h.calls.some(c => c.args[0] === "run"));
  }
  const h = harness();
  await rehearseSyntheticRecovery(h.options);
  assert.equal(h.calls.find(c => c.args[0] === "run").args.at(-1), `sha256:${"a".repeat(64)}`);
});

test("temporary socket readiness cannot start fixture SQL before final TCP readiness", async () => {
  const h = harness();
  const original = h.options.docker;
  let probes = 0;
  let ticks = 0;
  const result = await rehearseSyntheticRecovery({ ...h.options, now: () => ticks, pause: async ms => { ticks += ms; }, docker: async (args, input, options) => {
    if (args.includes("pg_isready")) {
      assert.equal(args[args.indexOf("-h") + 1], "127.0.0.1");
      if (++probes < 3) throw new Error("temporary server is socket-only");
    }
    if (args.includes("psql")) assert.equal(probes, 3);
    return original(args, input, options);
  } });
  assert.equal(result.databaseVerified, true);
  assert.equal(probes, 3);
});

test("readiness deadline rejects late success and caps subprocess to remaining time", async () => {
  const h = harness();
  let ticks = 0;
  let probes = 0;
  await assert.rejects(rehearseSyntheticRecovery({ ...h.options, now: () => ticks, pause: async ms => { ticks += ms; }, docker: async (args, input, options) => {
    if (args.includes("pg_isready")) {
      assert.ok(options.timeoutMs <= 15_000);
      ticks += options.timeoutMs;
      if (++probes === 1) throw new Error("not ready yet");
      return "accepting connections";
    }
    return h.options.docker(args, input, options);
  } }), error => error.diagnostics.workError.phase === "final_server_readiness");
  assert.ok(!h.calls.some(c => c.args.includes("psql")));
});

test("list, label and removal failures keep exact resource identity and both failure phases", async () => {
  for (const phase of ["list", "label_inspection", "remove"]) {
    const h = harness({ fail: args => args.includes("pg_restore") ||
      (phase === "list" && args[0] === "ps") ||
      (phase === "label_inspection" && args.includes('{{index .Config.Labels "codex.rehearsal"}}')) ||
      (phase === "remove" && args[0] === "rm") });
    await assert.rejects(rehearseSyntheticRecovery({ ...h.options, dockerEndpoint: "npipe:////./pipe/docker_engine" }), error => {
      const d = error.diagnostics;
      assert.match(d.containerName, /^nestory-synthetic-recovery-[a-f0-9-]+$/);
      assert.equal(d.dockerEndpoint, "npipe:////./pipe/docker_engine");
      assert.equal(d.workError.phase, "database_dump_restore");
      assert.equal(d.cleanupError.phase, phase);
      assert.equal(d.removed, false);
      return true;
    });
  }
});

test("overall work deadline prevents another command while allowing bounded cleanup", async () => {
  const h = harness();
  let ticks = 0;
  await assert.rejects(rehearseSyntheticRecovery({ ...h.options, now: () => ticks, docker: async (args, input, options) => {
    const result = await h.options.docker(args, input, options);
    if (args.includes("pg_restore")) ticks = 60_000;
    return result;
  } }), error => error.diagnostics.workError.phase === "database_validation" && error.diagnostics.removed === true);
  assert.ok(!h.calls.some(c => c.args.includes("psql") && c.args.includes("synthetic_restore")));
  assert.equal(h.calls.at(-1).args[0], "rm");
});

test("cleanup-only failure retains successful work status and unresolved removal", async () => {
  const h = harness({ fail: args => args[0] === "rm" });
  await assert.rejects(rehearseSyntheticRecovery(h.options), error => {
    assert.equal(error.diagnostics.workError, null);
    assert.equal(error.diagnostics.cleanupError.phase, "remove");
    assert.equal(error.diagnostics.removed, false);
    return true;
  });
});
