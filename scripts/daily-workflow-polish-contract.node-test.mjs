import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dailyPhases } from "./daily-workflow-policy.mjs";
import {
  assertPolishCompletion, assertPolishReadiness, assertPolishTarget, dailyPolishFixture,
  dailyPolishSeedSql, polishActionDiagnostics, polishCases, polishDeliverySnapshotSql, polishOtherAuthoritySql,
  polishPassword, polishReadinessSql, polishViewports, redactPolishEvidence,
} from "./daily-workflow-polish-contract.mjs";

const env = {
  GITHUB_ACTIONS: "true", CI: "true", RUNNER_OS: "Linux",
  GITHUB_REPOSITORY: "soley-bot/nestory", GITHUB_EVENT_NAME: "pull_request",
  GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", NESTORY_TEST_SHA: "a".repeat(40),
  SUPABASE_DB_CONTAINER: "supabase_db_nestory-daily-123-1", NESTORY_BASE_URL: "http://127.0.0.1:3107",
};
const project = "nestory-daily-123-1";
const root = "/runner/work/nestory/nestory";
const created = "2026-10-20T00:00:00Z";
const target = () => ({
  env, root, head: env.NESTORY_TEST_SHA, buildId: "production-build",
  manifest: { root, project, sha: env.NESTORY_TEST_SHA, createdAt: created, beforeNames: [] },
  dailyResult: { sha: env.NESTORY_TEST_SHA, complete: true, phases: dailyPhases.map(name => ({ name, passed: true })) },
  container: { Id: "b".repeat(64), Name: `/supabase_db_${project}`, Created: created, State: { Running: true },
    NetworkSettings: { Networks: { [`supabase_network_${project}`]: {} }, Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "58322" }] } } },
});
const f = dailyPolishFixture(env);
function preview() {
  const assignment = { branch_id: f.branch, branch_name: f.branchName, role_id: f.role, role_name: f.roleName, permission_keys: ["finance.view", "maintenance.view"] };
  return { organization_id: f.org, ordinary_access_enabled: false, activation_ready: true,
    active_branch_count: 1, property_count: 1, unscoped_property_count: 0, conflicting_record_count: 0,
    blockers: [], authorization_version: 1, impact_fingerprint: "c".repeat(64),
    ordinary_member_count: 1, live_ordinary_invitation_count: 1,
    impact_memberships: [{ ...assignment, membership_id: f.membership, user_id: f.viewer, email: f.viewerEmail }],
    impact_invitations: [{ ...assignment, invitation_id: f.invitation, email: f.invitationEmail, status: "pending" }],
  };
}

test("rejects wrong CI context before producing synthetic fixture SQL", () => {
  for (const changed of [
    { CI: "false" }, { RUNNER_OS: "Windows" }, { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY: "another/repository" }, { GITHUB_RUN_ID: "123';drop" },
    { NESTORY_TEST_SHA: "main" }, { SUPABASE_PROJECT_ID: "hosted" },
  ]) assert.throws(() => dailyPolishSeedSql({ ...env, ...changed }));
});
test("fixture identities are stable within one exact run and distinct across run, attempt and SHA", () => {
  assert.deepEqual(dailyPolishFixture(env), f);
  const ids = ["org", "admin", "adminIdentity", "viewer", "viewerIdentity", "membership", "branch", "role", "invitation", "property", "unit", "costEvent", "maintenanceEvent"];
  assert.equal(new Set(ids.map(key => f[key])).size, ids.length);
  for (const key of ids) assert.match(f[key], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const changed of [{ GITHUB_RUN_ID: "124" }, { GITHUB_RUN_ATTEMPT: "2" }, { NESTORY_TEST_SHA: "b".repeat(40) }]) {
    const other = dailyPolishFixture({ ...env, ...changed });
    for (const key of ids) assert.notEqual(f[key], other[key]);
  }
  for (const key of ["adminEmail", "viewerEmail", "invitationEmail"]) assert.match(f[key], /^[a-z0-9-]+@polish\.example\.test$/);
});
test("attestation requires completed same-head journey and exact fresh database network, root and binding", () => {
  assert.equal(assertPolishTarget(target()), "b".repeat(64));
  const variants = [
    t => { t.dailyResult.complete = false; }, t => { t.dailyResult.phases.pop(); },
    t => { t.dailyResult.sha = "c".repeat(40); }, t => { t.head = "c".repeat(40); },
    t => { t.manifest.root = "/elsewhere"; }, t => { t.manifest.sha = "c".repeat(40); },
    t => { t.manifest.project = "nestory"; }, t => { t.buildId = ""; },
    t => { t.container.Name = "/supabase_db_nestory"; }, t => { t.container.Id = "short"; },
    t => { t.container.State.Running = false; }, t => { t.container.Created = "2026-10-19T23:59:59Z"; },
    t => { t.manifest.beforeNames.push(`supabase_db_${project}`); },
    t => { t.container.NetworkSettings.Networks.extra = {}; },
    t => { t.container.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0"; },
    t => { t.container.NetworkSettings.Ports["5432/tcp"][0].HostPort = "54322"; },
    t => { t.env = { ...env, NESTORY_BASE_URL: "https://production.example.test" }; },
    t => { t.env = { ...env, SUPABASE_DB_CONTAINER: "supabase_db_nestory" }; },
  ];
  for (const mutate of variants) { const value = target(); mutate(value); assert.throws(() => assertPolishTarget(value)); }
});
test("seeding is additive and scoped, with checked property assignment and contained ordinary access", () => {
  const sql = dailyPolishSeedSql(env);
  assert.doesNotMatch(sql, /\bTRUNCATE\b|\bDELETE\b|\bUPDATE\s+public\b|session_replication_role|DISABLE TRIGGER|set_config\('app_private|ordinary_access_enabled\s*=/i);
  assert.match(sql, /Polish fixture already exists; refuse reuse/);
  assert.match(sql, /INSERT INTO public\.properties\(id,organization_id,name,code,property_type\)/);
  assert.match(sql, /SET LOCAL ROLE authenticated;[\s\S]*public\.assign_property_branch/);
  assert.ok(sql.indexOf("organization_role_permissions") < sql.indexOf("VALUES('" + f.membership));
  assert.match(sql, /'Maintenance'[\s\S]*5,'USD'/);
  assert.match(sql, /'Inspection'[\s\S]*NULL,NULL/);
  assert.doesNotMatch(sql, /ledger_entries|ledger_entry_id|finance\.record|properties\.view|inviteUser|generateLink|resend/);
  for (const id of [f.org, f.admin, f.viewer, f.branch, f.role]) assert.ok(sql.includes(id));
});
test("locked readiness snapshot uses an ordinary rollback transaction, never READ ONLY", () => {
  const sql = polishReadinessSql(f);
  assert.match(sql, /^BEGIN;/);
  assert.doesNotMatch(sql, /READ ONLY/i);
  assert.match(sql, /SET LOCAL ROLE authenticated/);
  assert.match(sql, /get_organization_ordinary_access_activation/);
  assert.match(sql, /ROLLBACK;$/);
});
test("readiness contract rejects stale, widened, cross-org or incomplete affected assignments", () => {
  assertPolishReadiness(preview(), f);
  for (const modify of [
    p => { p.organization_id = f.admin; }, p => { p.ordinary_access_enabled = true; },
    p => { p.active_branch_count = 2; }, p => { p.blockers = ["invalid_memberships"]; },
    p => { p.impact_memberships[0].permission_keys.push("properties.view"); },
    p => { p.impact_memberships[0].email = "another@example.test"; },
    p => { p.impact_invitations[0].status = "send_failed"; },
    p => { p.impact_invitations = []; }, p => { p.impact_fingerprint = "invalid"; },
  ]) { const value = preview(); modify(value); assert.throws(() => assertPolishReadiness(value, f)); }
  assertPolishReadiness({ ...preview(), active_branch_count: 2, ordinary_access_enabled: true, activation_ready: false }, f, { enabled: true, branches: 2 });
});
test("delivery and other-organization snapshots exclude no rows within their declared scopes", () => {
  const delivery = polishDeliverySnapshotSql(f);
  for (const table of ["organization_invitations", "privileged_email_step_up_challenges", "privileged_email_step_up_events", "privileged_email_step_up_grants", "privileged_email_step_up_policies"]) assert.ok(delivery.includes(table));
  assert.equal((delivery.match(new RegExp(`organization_id='${f.org}'`, "g")) ?? []).length, 5);
  assert.match(polishOtherAuthoritySql(f), /'propertyBranches'/);
  assert.ok(polishOtherAuthoritySql(f).includes(`organization_id<>'${f.org}'`));
});
test("partial or failed cases cannot be labeled complete; compact is an explicit viewport", () => {
  const complete = polishCases.map(name => ({ name, status: "passed" }));
  assertPolishCompletion(complete);
  assert.throws(() => assertPolishCompletion(complete.slice(1)));
  assert.throws(() => assertPolishCompletion(complete.map((item, index) => ({ ...item, status: index ? "passed" : "pending" }))));
  assert.deepEqual(polishViewports.compact, { width: 683, height: 384 });
});
test("evidence redacts credentials without losing fictional failure context", () => {
  const database = new URL("postgresql://127.0.0.1/test");
  database.username = "fictional-user";
  database.password = "fictional-password";
  const text = redactPolishEvidence(`${polishPassword} eyJabc.abc.def sb_secret_secret ${database.href} stale review`);
  for (const secret of [polishPassword, "eyJabc.abc.def", "sb_secret_secret", database.username, database.password]) assert.ok(!text.includes(secret));
  assert.ok(text.includes("stale review"));
});
test("action diagnostics retain only bounded fixed-target POST timings and status", () => {
  let time = 1000;
  const diagnostics = polishActionDiagnostics(env.NESTORY_BASE_URL, () => time);
  const request = (url, method = "POST") => ({
    url: () => url, method: () => method,
    headers: () => { throw new Error("Headers must never be read"); },
    postData: () => { throw new Error("Bodies must never be read"); },
    failure: () => { throw new Error("Raw failures must never be read"); },
  });
  for (const ignored of [
    request("https://example.test/settings/access"),
    request(`${env.NESTORY_BASE_URL}/settings/branches`),
    request(`${env.NESTORY_BASE_URL}/settings/access`, "GET"),
  ]) {
    diagnostics.request(ignored);
    diagnostics.response({ request: () => ignored, status: () => 200 });
    diagnostics.failed(ignored);
  }
  assert.equal(diagnostics.evidence.requests.length, 0);
  const completed = request(`${env.NESTORY_BASE_URL}/settings/access?fictional=do-not-retain`);
  time = 1010;
  diagnostics.request(completed);
  time = 1050;
  diagnostics.response({ request: () => completed, status: () => 200 });
  time = 1080;
  diagnostics.finished(completed);
  const failed = request(`${env.NESTORY_BASE_URL}/settings/access`);
  time = 1100;
  diagnostics.request(failed);
  time = 1150;
  diagnostics.failed(failed);
  const pending = request(`${env.NESTORY_BASE_URL}/settings/access`);
  diagnostics.request(pending);
  assert.deepEqual(diagnostics.evidence.requests, [
    { sequence: 1, startedMs: 10, responseMs: 50, settledMs: 80, durationMs: 70, status: 200, completed: true, failed: false },
    { sequence: 2, startedMs: 100, responseMs: null, settledMs: 150, durationMs: 50, status: null, completed: false, failed: true },
    { sequence: 3, startedMs: 150, responseMs: null, settledMs: null, durationMs: null, status: null, completed: false, failed: false },
  ]);
  assert.ok(!JSON.stringify(diagnostics.evidence).includes("do-not-retain"));
  for (let index = 0; index < 40; index++) diagnostics.request(request(`${env.NESTORY_BASE_URL}/settings/access`));
  assert.equal(diagnostics.evidence.requests.length, 32);
  assert.equal(diagnostics.evidence.truncated, true);
  assert.throws(() => polishActionDiagnostics("https://example.test"));
});
test("runner invokes polish only after existing journey with bounded budget and retained evidence", () => {
  const runner = readFileSync(new URL("./run-daily-workflow-ci.mjs", import.meta.url), "utf8");
  const daily = runner.indexOf('await command("browser"');
  const polish = runner.indexOf('await command("polish-browser"');
  assert.ok(daily > 0 && polish > daily);
  assert.match(runner, /"scripts\/smoke-daily-polish\.mjs"\], env, 5 \* 60000/);
  assert.ok(runner.indexOf('save("runner.json", { status: "passed"') > polish);
  const workflow = readFileSync(new URL("../.github/workflows/daily-workflow-acceptance.yml", import.meta.url), "utf8");
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /polish-result\.json/);
  assert.match(workflow, /daily-workflow-polish-contract\.node-test\.mjs/);
  const smoke = readFileSync(new URL("./smoke-daily-polish.mjs", import.meta.url), "utf8");
  assert.ok(smoke.indexOf("assertPolishTarget({") < smoke.indexOf("sql(dailyPolishSeedSql"));
  assert.match(smoke, /assertDailyOrigin\(\(await attestation\.json\(\)\)\.supabaseOrigin/);
  assert.match(smoke, /context\.route\("\*\*\/\*"/);
  assert.match(smoke, /hasText: "Staff access changed\. Review refreshed readiness before activating\." \}\)\)\.toBeVisible\(\{ timeout: 30000 \}\)/);
  assert.match(smoke, /activationStateAtFailure = activationState\(\)/);
  assert.doesNotMatch(smoke, /pageScaleFactor|deviceScaleFactor|browser\.newContext\([^)]*storageState|inviteUserByEmail|generateLink|\.send\(/);
  assert.match(smoke, /Compact is responsive viewport coverage, not native 200% browser zoom/);
  assert.doesNotMatch(smoke, /docker\(\["(?:rm|stop|restart|volume|network)"/);
});
