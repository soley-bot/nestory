import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { assertDailyContainer, assertDailyOrigin, assertDailyResources, dailyOrigins, memoryAvailableGiB, resolveDailyRun } from "./daily-workflow-policy.mjs";

const config = resolveDailyRun(process.env);
const root = process.cwd();
const privateDir = path.join(process.env.RUNNER_TEMP, config.project);
const reports = path.join(root, "ci-reports/daily-workflow");
const network = `supabase_network_${config.project}`;
const configuration = path.join(root, "supabase/config.toml");
const run = (bin, args, options = {}) => execFileSync(bin, args, { cwd: root, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024, ...options }).trim();
const docker = args => run("docker", args);
const inspect = name => JSON.parse(docker(["inspect", name]))[0];
const list = () => docker(["ps", "-a", "--format", "{{.Names}}"] ).split("\n").filter(Boolean);
const ownNames = () => list().filter(name => name.endsWith(`_${config.project}`));
const resource = () => { const disk = fs.statfsSync(root); return { diskGiB: disk.bavail * disk.bsize / 1024 ** 3, memoryGiB: memoryAvailableGiB(fs.readFileSync("/proc/meminfo", "utf8"), os.freemem()) }; };
let manifest;
let secrets = [];
let active;
let stage = "preflight";
const redact = text => secrets.reduce((value, secret) => value.split(secret).join("[local key redacted]"), String(text)).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[local JWT redacted]").replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[local key redacted]").split("\n").map(line => /Access Key|Secret Key|JWT.?Secret|S3_PROTOCOL|postgresql:\/\//i.test(line) ? "[synthetic credential line redacted]" : line).join("\n");
const save = (name, data) => fs.writeFileSync(path.join(reports, name), JSON.stringify(data, null, 2));
const api = (method, pathname, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : "";
  const request = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.47${pathname}`, method, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, response => {
    let result = ""; response.on("data", chunk => result += chunk); response.on("end", () => response.statusCode >= 200 && response.statusCode < 300 ? resolve(result ? JSON.parse(result) : null) : reject(new Error(`Docker operation failed: ${response.statusCode}`)));
  }); request.setTimeout(30000, () => request.destroy(new Error("Docker timeout"))); request.on("error", reject); request.end(data);
});

async function command(name, args, env, timeoutMs) {
  stage = name;
  console.log(`Starting ${name}`);
  assertDailyResources(resource());
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  active = child;
  let output = "";
  const append = chunk => { output += chunk; if (output.length > 2 * 1024 * 1024) output = output.slice(-2 * 1024 * 1024); };
  child.stdout.on("data", append); child.stderr.on("data", append);
  const started = Date.now();
  let guardError;
  let forceStop;
  const monitor = setInterval(() => {
    try { assertDailyResources(resource()); assert.ok(Date.now() - started < timeoutMs, "Stage deadline reached"); }
    catch (error) {
      if (!guardError) {
        guardError = error;
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
        forceStop = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already stopped */ } }, 5000);
      }
    }
  }, 2000);
  const code = await new Promise(resolve => { child.once("error", () => resolve(1)); child.once("close", resolve); });
  clearInterval(monitor); clearTimeout(forceStop); active = undefined;
  fs.writeFileSync(path.join(reports, `${name}.log`), redact(output));
  if (guardError) throw guardError;
  assert.equal(code, 0, `${name} failed; see redacted log`);
}

async function bindLoopback() {
  // CLI 2.108 publishes wildcard ports despite the bridge default. Recreate only
  // this new, not-yet-seeded database and gateway with explicit host bindings.
  for (const service of ["db", "kong"]) {
    const name = `supabase_${service}_${config.project}`;
    const original = inspect(name);
    assertDailyContainer(original, config.project, manifest.createdAt, false);
    assert.ok(!manifest.beforeNames.includes(name));
    assert.deepEqual(Object.keys(original.NetworkSettings.Networks), [network]);
    await api("POST", `/containers/${original.Id}/stop?t=10`);
    const host = { ...original.HostConfig, PortBindings: Object.fromEntries(Object.entries(original.HostConfig.PortBindings).map(([port, bindings]) => [port, bindings.map(binding => ({ ...binding, HostIp: "127.0.0.1" }))])) };
    await api("DELETE", `/containers/${original.Id}?v=false`);
    const created = await api("POST", `/containers/create?name=${name}`, { ...original.Config, HostConfig: host, NetworkingConfig: { EndpointsConfig: { [network]: { NetworkID: original.NetworkSettings.Networks[network].NetworkID, Aliases: original.NetworkSettings.Networks[network].Aliases } } } });
    await api("POST", `/containers/${created.Id}/start`);
    assertDailyContainer(inspect(name), config.project, manifest.createdAt);
  }
}

async function waitFor(test, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { assertDailyResources(resource()); try { if (await test()) return; } catch { /* bounded readiness only */ } await new Promise(resolve => setTimeout(resolve, 1000)); }
  throw new Error("Readiness deadline reached");
}

async function cleanup() {
  if (!fs.existsSync(path.join(privateDir, "manifest.json"))) return;
  const owned = JSON.parse(fs.readFileSync(path.join(privateDir, "manifest.json"), "utf8"));
  assert.equal(owned.project, config.project); assert.equal(owned.root, root);
  for (const name of ownNames()) {
    assert.ok(!owned.beforeNames.includes(name)); assertDailyContainer(inspect(name), config.project, owned.createdAt, false);
    docker(["rm", "-f", name]);
  }
  for (const name of docker(["volume", "ls", "--format", "{{.Name}}"] ).split("\n").filter(name => name.endsWith(`_${config.project}`))) {
    const volume = JSON.parse(docker(["volume", "inspect", name]))[0];
    assert.ok(!owned.beforeVolumes.includes(name)); assert.ok(Date.parse(volume.CreatedAt) >= Date.parse(owned.createdAt)); docker(["volume", "rm", name]);
  }
  if (docker(["network", "ls", "--format", "{{.Name}}"] ).split("\n").includes(network)) {
    const info = JSON.parse(docker(["network", "inspect", network]))[0];
    assert.equal(info.Labels?.["nestory.daily.run"], config.project); assert.equal(Object.keys(info.Containers ?? {}).length, 0); docker(["network", "rm", network]);
  }
  fs.copyFileSync(path.join(privateDir, "config.original.toml"), configuration);
}

async function main() {
  if (process.argv.includes("--cleanup")) { await cleanup(); return; }
  assert.equal(run("git", ["rev-parse", "HEAD"]), config.sha);
  assert.equal(run("git", ["status", "--porcelain", "--untracked-files=no"]), "");
  assertDailyResources(resource(), true);
  assert.equal(JSON.parse(docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"])), "unix:///var/run/docker.sock");
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) assert.ok(!fs.existsSync(path.join(root, name)), "Unexpected dotenv file");
  assert.equal(ownNames().length, 0, "Refuse an existing project");
  const beforeVolumes = docker(["volume", "ls", "--format", "{{.Name}}"] ).split("\n");
  assert.ok(!beforeVolumes.some(name => name.endsWith(`_${config.project}`)), "Refuse pre-existing project volumes");
  assert.ok(!docker(["network", "ls", "--format", "{{.Name}}"] ).split("\n").includes(network), "Refuse existing project network");
  fs.mkdirSync(privateDir, { recursive: false }); fs.mkdirSync(reports, { recursive: true });
  const original = fs.readFileSync(configuration, "utf8"); assert.match(original, /^project_id = "nestory"$/m);
  fs.writeFileSync(path.join(privateDir, "config.original.toml"), original);
  manifest = { ...config, root, createdAt: new Date().toISOString(), beforeNames: list(), beforeVolumes };
  fs.writeFileSync(path.join(privateDir, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(configuration, original.replace(/^project_id = "nestory"$/m, `project_id = "${config.project}"`).replace(/\b543(\d\d)\b/g, "583$1").replaceAll(":3000", ":3107"));
  docker(["network", "create", "--label", `nestory.daily.run=${config.project}`, network]);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/SUPABASE|SENTRY|^VERCEL_|^NEXT_PUBLIC_|^RESEND/.test(key)) delete env[key];
  Object.assign(env, { NEXT_TELEMETRY_DISABLED: "1", SUPABASE_DB_CONTAINER: `supabase_db_${config.project}`, NESTORY_BASE_URL: dailyOrigins.app, NESTORY_SKIP_FIXTURE_RESET: "1" });
  await command("startup", ["scripts/run-supabase-portable.mjs", "start", "--network-id", network, "--exclude", "logflare,vector,studio,realtime,edge-runtime,imgproxy,mailpit,postgres-meta,supavisor"], env, 6 * 60000);
  await bindLoopback();
  const expectedMigrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).length;
  const actualMigrations = Number(docker(["exec", `supabase_db_${config.project}`, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-c", "SELECT count(*) FROM supabase_migrations.schema_migrations"]));
  assert.equal(actualMigrations, expectedMigrations, "Migration replay count differs from checked-out source");
  const status = JSON.parse(run(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { env }));
  assertDailyOrigin(status.API_URL, dailyOrigins.api); assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
  secrets = [status.ANON_KEY, status.SERVICE_ROLE_KEY];
  for (const secret of secrets) console.log(`::add-mask::${secret}`);
  await waitFor(async () => (await fetch(`${dailyOrigins.api}/auth/v1/health`, { headers: { apikey: status.ANON_KEY }, signal: AbortSignal.timeout(2000) })).ok);
  await command("fixture", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/load-test-fixture.mjs"], env, 3 * 60000);
  await command("rent-guards", ["node_modules/supabase/dist/supabase.js", "test", "db", "supabase/tests/historical_rent_correction_authority_test.sql", "supabase/tests/historical_rent_correction_execution_test.sql"], env, 2 * 60000);
  const containers = ownNames(); assert.equal(containers.length, 5);
  containers.forEach(name => { assertDailyContainer(inspect(name), config.project, manifest.createdAt); docker(["stop", "--timeout", "10", name]); });
  assertDailyResources(resource(), true);
  Object.assign(env, { VERCEL: "1", NODE_OPTIONS: "--max-old-space-size=1536", NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY });
  await command("build", ["node_modules/next/dist/bin/next", "build", "--webpack"], env, 8 * 60000);
  assert.equal(run("git", ["diff", "--name-only"]).trim(), "supabase/config.toml");
  const buildId = fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim(); assert.ok(buildId);
  for (const name of containers) { docker(["start", name]); assertDailyContainer(inspect(name), config.project, manifest.createdAt); }
  env.NODE_OPTIONS = "--max-old-space-size=768";
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let appOutput = "";
  const appendApp = chunk => { appOutput = (appOutput + chunk).slice(-2 * 1024 * 1024); };
  app.stdout.on("data", appendApp); app.stderr.on("data", appendApp); app.on("error", error => appendApp(error.message));
  try {
    await waitFor(async () => { const response = await fetch(`${dailyOrigins.app}/api/local-smoke-target`, { signal: AbortSignal.timeout(2000) }); if (!response.ok) return false; assertDailyOrigin((await response.json()).supabaseOrigin, dailyOrigins.api); return true; });
    await command("browser", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/smoke-daily-workflow.mjs"], env, 7 * 60000);
    save("runner.json", { status: "passed", sha: config.sha, project: config.project, buildId, migrations: actualMigrations, apiOrigin: dailyOrigins.api, resources: resource() });
  } finally {
    try { process.kill(-app.pid, "SIGTERM"); } catch { /* exited */ }
    fs.writeFileSync(path.join(reports, "app.log"), redact(appOutput));
  }
}

try { await main(); }
catch (error) {
  if (fs.existsSync(reports)) save("runner.json", { status: "failed", stage, sha: config.sha, message: redact(error.message).slice(0,1200) });
  console.error(`Synthetic daily workflow failed at ${stage}; see safe evidence.`); process.exitCode = 1;
} finally {
  if (active?.pid) { try { process.kill(-active.pid, "SIGTERM"); } catch { /* exited */ } }
  try { await cleanup(); } catch { console.error("Own-project cleanup failed; disposable runner teardown remains required."); process.exitCode = 1; }
}
