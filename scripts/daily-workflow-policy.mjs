import assert from "node:assert/strict";

export const dailyOrigins = Object.freeze({ app: "http://127.0.0.1:3107", api: "http://127.0.0.1:58321" });
export const dailyPhases = Object.freeze(["move-in", "payment", "monthly-correction", "receipt", "owner-statement"]);

export function resolveDailyRun(env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "GitHub Actions required");
  assert.equal(env.CI, "true", "CI required");
  assert.equal(env.RUNNER_OS, "Linux", "Disposable Linux runner required");
  assert.equal(env.GITHUB_REPOSITORY, "soley-bot/nestory", "Unexpected repository");
  assert.equal(env.GITHUB_EVENT_NAME, "pull_request", "PR-only acceptance");
  assert.match(env.GITHUB_RUN_ID ?? "", /^[1-9][0-9]*$/, "Invalid run ID");
  assert.match(env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9][0-9]*$/, "Invalid attempt");
  assert.match(env.NESTORY_TEST_SHA ?? "", /^[a-f0-9]{40}$/, "Exact head required");
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID", "NESTORY_SENTRY_AUTH_TOKEN"]) {
    assert.ok(!env[key], "Hosted credentials must not enter acceptance");
  }
  return { project: `nestory-daily-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, sha: env.NESTORY_TEST_SHA };
}

export function assertDailyOrigin(value, expected) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", "Local HTTP only");
  assert.equal(url.hostname, "127.0.0.1", "Loopback only");
  assert.equal(url.username + url.password + url.search + url.hash, "", "Bare origin required");
  assert.equal(url.pathname, "/", "Bare origin required");
  assert.equal(url.origin, expected, "Wrong local service");
  return url.origin;
}

export function assertDailyContainer(container, project, createdAfter, requireBindings = true) {
  assert.match(project, /^nestory-daily-[1-9][0-9]*-[1-9][0-9]*$/);
  const services = ["db", "auth", "rest", "storage", "kong"];
  assert.ok(services.some(service => container.Name === `/supabase_${service}_${project}`), "Unowned container");
  assert.ok(Date.parse(container.Created) >= Date.parse(createdAfter), "Pre-existing container");
  if (requireBindings) {
    for (const binding of Object.values(container.NetworkSettings?.Ports ?? {}).flat().filter(Boolean)) {
      assert.equal(binding.HostIp, "127.0.0.1", "Published port is not loopback-only");
    }
    const service = services.find(value => container.Name === `/supabase_${value}_${project}`);
    if (service === "db" || service === "kong") {
      const internal = service === "db" ? "5432/tcp" : "8000/tcp";
      const external = service === "db" ? "58322" : "58321";
      assert.deepEqual(container.NetworkSettings?.Ports?.[internal], [{ HostIp: "127.0.0.1", HostPort: external }], "Wrong published service port");
    }
  }
}

export function memoryAvailableGiB(meminfo, fallbackBytes) {
  const available = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(meminfo ?? "");
  return available ? Number(available[1]) / 1024 ** 2 : fallbackBytes / 1024 ** 3;
}

export function assertDailyResources({ memoryGiB, diskGiB }, admission = false) {
  assert.ok(memoryGiB >= (admission ? 4 : .75), "Memory guard reached");
  assert.ok(diskGiB >= 8, "Disk guard reached");
}

export function assertDailyCompletion(phases) {
  assert.deepEqual(phases.map(phase => phase.name), dailyPhases, "Incomplete or reordered daily workflow");
  assert.ok(phases.every(phase => phase.passed === true), "A daily phase did not pass");
}
