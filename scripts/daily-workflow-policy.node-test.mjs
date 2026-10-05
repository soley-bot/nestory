import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { assertDailyCompletion, assertDailyContainer, assertDailyOrigin, assertDailyResources, dailyOrigins, dailyPhases, memoryAvailableGiB, resolveDailyRun } from "./daily-workflow-policy.mjs";

const env = { GITHUB_ACTIONS: "true", CI: "true", RUNNER_OS: "Linux", GITHUB_REPOSITORY: "soley-bot/nestory", GITHUB_EVENT_NAME: "pull_request", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", NESTORY_TEST_SHA: "a".repeat(40) };
test("accepts only the exact PR runner context and derives a fresh project", () => {
  assert.deepEqual(resolveDailyRun(env), { project: "nestory-daily-123-1", sha: "a".repeat(40) });
  assert.notEqual(resolveDailyRun({ ...env, GITHUB_RUN_ATTEMPT: "2" }).project, resolveDailyRun(env).project);
});
for (const [key, value] of [["GITHUB_ACTIONS", "false"], ["CI", "false"], ["RUNNER_OS", "Windows"], ["GITHUB_REPOSITORY", "other/repo"], ["GITHUB_EVENT_NAME", "push"], ["GITHUB_RUN_ID", "../nestory"], ["GITHUB_RUN_ATTEMPT", "0"], ["NESTORY_TEST_SHA", "main"]]) {
  test(`rejects invalid ${key}`, () => assert.throws(() => resolveDailyRun({ ...env, [key]: value })));
}
for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID", "NESTORY_SENTRY_AUTH_TOKEN"]) {
  test(`rejects injected ${key}`, () => assert.throws(() => resolveDailyRun({ ...env, [key]: "fixture-secret" })));
}
test("accepts only the exact local origins", () => {
  assert.equal(assertDailyOrigin(dailyOrigins.api, dailyOrigins.api), dailyOrigins.api);
  assert.equal(assertDailyOrigin(dailyOrigins.app, dailyOrigins.app), dailyOrigins.app);
});
for (const url of ["https://pilot.nestory-kh.com", "https://example.supabase.co", "http://127.0.0.1:54321", "http://localhost:58321", "http://127.0.0.1:58321/path", "http://u:p@127.0.0.1:58321", "http://127.0.0.1:58321?token=secret", "http://127.0.0.1:58321#private", "http://127.0.0.1.evil.test:58321"]) {
  test(`rejects non-attested target ${url}`, () => assert.throws(() => assertDailyOrigin(url, dailyOrigins.api)));
}
const created = "2026-10-05T00:00:00Z";
const container = { Name: "/supabase_db_nestory-daily-123-1", Created: "2026-10-05T00:01:00Z", NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58322" }] } } };
test("accepts a newly owned loopback database", () => assertDailyContainer(container, "nestory-daily-123-1", created));
for (const changed of [
  { ...container, Name: "/supabase_db_nestory" },
  { ...container, Name: "/supabase_db_nestory-daily-123-2" },
  { ...container, Created: "2026-10-04T23:59:59Z" },
  { ...container, Created: "invalid" },
  { ...container, NetworkSettings: { Ports: {} } },
  { ...container, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "58322" }] } } },
  { ...container, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] } } },
]) test(`rejects unsafe container ${JSON.stringify(changed)}`, () => assert.throws(() => assertDailyContainer(changed, "nestory-daily-123-1", created)));
test("uses Linux available memory instead of counting reclaimable cache as unavailable", () => {
  assert.equal(memoryAvailableGiB("MemFree: 1 kB\nMemAvailable: 4194304 kB\n", 1), 4);
  assert.equal(memoryAvailableGiB("", 1024 ** 3), 1);
});
test("enforces admission and stop floors", () => {
  assertDailyResources({ memoryGiB: 4, diskGiB: 8 }, true);
  assertDailyResources({ memoryGiB: .75, diskGiB: 8 });
  assert.throws(() => assertDailyResources({ memoryGiB: 3.99, diskGiB: 9 }, true));
  assert.throws(() => assertDailyResources({ memoryGiB: .74, diskGiB: 9 }));
  assert.throws(() => assertDailyResources({ memoryGiB: 5, diskGiB: 7.99 }));
});
test("cannot label partial, reordered or failed phases complete", () => {
  const phases = dailyPhases.map(name => ({ name, passed: true }));
  assertDailyCompletion(phases);
  assert.throws(() => assertDailyCompletion(phases.slice(0,-1)));
  assert.throws(() => assertDailyCompletion(phases.toReversed()));
  assert.throws(() => assertDailyCompletion(phases.map((phase,index) => ({ ...phase, passed: index !== 1 }))));
});
test("dedicated PR workflow cannot request production access or deploy", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/daily-workflow-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /pull_request_target|workflow_dispatch|\bpush:|secrets\.|environment:|statuses:|id-token:|deploy|db push|--linked/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  for (const match of workflow.matchAll(/uses: (\S+)/g)) assert.match(match[1], /@[0-9a-f]{40}$/);
  assert.match(workflow, /if: always\(\)[\s\S]*--cleanup/);
  assert.doesNotMatch(workflow, /\.env|trace\.zip|storageState|matrix:|strategy:/);
});
