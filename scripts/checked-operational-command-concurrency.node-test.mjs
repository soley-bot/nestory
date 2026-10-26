// Dedicated synthetic database / disposable CI only. Never reloads a fixture.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { selectDepositContainer } from "./deposit-candidate-target.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const localProject = process.env.OPERATIONAL_COMMAND_LOCAL_PROJECT_DIR;
let database;
if (localProject) {
  database = process.env.OPERATIONAL_COMMAND_TEST_DATABASE;
  assert.match(database ?? "", /^(postgres|pilot_reset_[a-z0-9_]+)$/,
    "OPERATIONAL_COMMAND_TEST_DATABASE must name the dedicated local database");
} else {
  assert.equal(process.env.GITHUB_ACTIONS, "true",
    "Outside disposable CI, OPERATIONAL_COMMAND_LOCAL_PROJECT_DIR must identify the dedicated local project");
  assert.equal(process.env.OPERATIONAL_COMMAND_TEST_DATABASE, undefined,
    "CI command tests cannot override the configured project database");
  database = "postgres";
}
function execute(command, args, input, options = {}) {
  const result = spawnSync(command, args, {
    input, encoding: "utf8", shell: false, windowsHide: true,
    timeout: 30_000, cwd: repoRoot, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
const { docker, endpoint } = await localRecoveryDocker({ execute });
const config = readFileSync(path.join(localProject ?? repoRoot, "supabase/config.toml"), "utf8");
const container = selectDepositContainer(config,
  docker(["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"])
    .split(/\r?\n/).filter(Boolean), process.env.SUPABASE_DB_CONTAINER);
if (localProject) {
  assert.match(container, /^supabase_db_nestory-pilot-reset-[0-9]{8}$/,
    "Local command concurrency tests require the dedicated Nestory Pilot reset test container");
}
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres",
  "-d", database, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
const sql = (body) => docker(psqlArgs, body).trim();
const admin = "00000000-0000-0000-0000-000000000101";
const actor = "00000000-0000-0000-0000-000000000501";

function command(action, event, org, property) {
  if (action === "update") {
    return `SELECT public.update_timeline_event('${event}','${org}','${property}',NULL,
      '2026-10-01','Inspection','Actor changed title',NULL,NULL,NULL);`;
  }
  return `SELECT public.${action}_timeline_event('${event}','${org}');`;
}
function fixture(action) {
  const [org, branchA, branchB, propertyA, propertyB, role, event, control] = Array.from({ length: 8 }, randomUUID);
  const archived = action === "restore" ? "now()" : "NULL";
  sql(`BEGIN;
    INSERT INTO public.organizations(id,name,slug) VALUES ('${org}','Operational command race','isolation-${org}');
    INSERT INTO public.organization_branches(id,organization_id,name,code,status) VALUES
      ('${branchA}','${org}','Source branch','RACE-A','active'), ('${branchB}','${org}','Other branch','RACE-B','active');
    INSERT INTO public.organization_roles(id,organization_id,name,status) VALUES ('${role}','${org}','Scoped command actor','active');
    INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
      SELECT '${org}','${role}',permission::public.organization_permission_key
      FROM unnest(ARRAY['properties.view','properties.write','properties.archive']) permission;
    INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES
      ('${org}','${admin}','super_admin',NULL,NULL), ('${org}','${actor}','custom','${branchA}','${role}');
    UPDATE public.organization_authorization_states SET ordinary_access_enabled=true WHERE organization_id='${org}';
    SELECT set_config('app.property_branch_assignment_context',
      (SELECT capability_token FROM app_private.property_branch_assignment_context_capability WHERE singleton),true);
    INSERT INTO public.properties(id,organization_id,branch_id,name,code,property_type) VALUES
      ('${propertyA}','${org}','${branchA}','Allowed source','RACE-A','Apartment'),
      ('${propertyB}','${org}','${branchB}','Forbidden destination','RACE-B','Apartment');
    SELECT set_config('app.property_branch_assignment_context','',true);
    INSERT INTO public.timeline_events(id,organization_id,property_id,event_date,event_type,title,archived_at) VALUES
      ('${event}','${org}','${propertyA}','2026-10-01','Inspection','Original title',${archived}),
      ('${control}','${org}','${propertyA}','2026-10-01','Inspection','Control title',${archived});
    COMMIT;`);
  // Assert the fixture's ordinary branch restriction and real positive command
  // before the race. A blanket-denial implementation must not pass this test.
  assert.equal(sql(`SET request.jwt.claim.sub='${actor}';
    SELECT app_private.can_access_property('${org}','${propertyA}','properties.archive')::text || ',' ||
      app_private.can_access_property('${org}','${propertyB}','properties.archive')::text;`), "true,false");
  sql(`BEGIN; SET LOCAL request.jwt.claim.sub='${actor}'; SET LOCAL ROLE authenticated;
    ${command(action, control, org, propertyA)} COMMIT;`);
  const revision = () => BigInt(sql(`SELECT coalesce(sum(revision),0) FROM app_private.financial_report_source_revisions WHERE organization_id='${org}';`));
  return { org, propertyA, propertyB, event, revision };
}
function session(body, applicationName) {
  const child = spawn("docker", ["--host", endpoint, ...psqlArgs], {
    cwd: repoRoot, shell: false, windowsHide: true,
  });
  const worker = { child, applicationName, stdout: "", stderr: "", closed: false };
  child.stdout.on("data", chunk => { worker.stdout += chunk; });
  child.stderr.on("data", chunk => { worker.stderr += chunk; });
  worker.done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", status => { worker.closed = true; resolve({ ...worker, status }); });
  });
  child.stdin.write(`BEGIN; SET LOCAL application_name='${applicationName}';
    SET LOCAL statement_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='30s';
    ${body}
    \\echo COMMAND_READY
  `);
  return worker;
}
async function waitFor(predicate, worker, description) {
  const deadline = performance.now() + 8_000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    if (worker.closed) assert.fail(`${description}: session closed: ${worker.stderr}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`${description}: bounded wait expired: ${worker.stderr}`);
}

// Tasks cannot make this transition: tasks_guard_branch_scope makes their branch
// snapshot immutable, and property permissions are branch-wide. Exercise only
// real timeline moves; never disable a guard to invent a task race.
for (const action of ["update", "archive", "restore"]) {
  test(`timeline ${action} rechecks the locked source after a concurrent cross-branch move`, async () => {
    const { org, propertyA, propertyB, event, revision } = fixture(action);
    const before = revision();
    const auditBefore = sql(`SELECT count(*) FROM public.activity_logs WHERE organization_id='${org}' AND entity_id='${event}';`);
    const holder = session(`SET LOCAL request.jwt.claim.sub='${admin}';
      UPDATE public.timeline_events SET property_id='${propertyB}' WHERE id='${event}';`, `command-move-${org}`);
    let caller;
    try {
      await waitFor(() => holder.stdout.includes("COMMAND_READY"), holder, "Move holds source row");
      caller = session(`SET LOCAL request.jwt.claim.sub='${actor}'; SET LOCAL ROLE authenticated;
        ${command(action, event, org, propertyA)}`, `command-actor-${org}`);
      caller.child.stdin.end("COMMIT;\n");
      await waitFor(() => sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h
        ON h.pid=ANY(pg_blocking_pids(w.pid)) WHERE w.application_name='${caller.applicationName}'
        AND h.application_name='${holder.applicationName}');`) === "t", caller, "Ordinary command waits for moved source");
      holder.child.stdin.end("COMMIT;\n");
      const [moved, denied] = await Promise.all([holder.done, caller.done]);
      assert.equal(moved.status, 0, moved.stderr);
      assert.notEqual(denied.status, 0, "cross-branch command must fail");
      assert.match(denied.stderr, /42501: Not authorized/);
      assert.doesNotMatch(denied.stderr, /deadlock detected|statement timeout|40P01/);
      assert.equal(sql(`SELECT property_id::text || ',' || title || ',' || (archived_at IS NOT NULL)::text
        FROM public.timeline_events WHERE id='${event}';`), `${propertyB},Original title,${action === "restore"}`,
        "denied actor cannot modify or move back the admin's committed source");
      assert.equal(sql(`SELECT count(*) FROM public.activity_logs WHERE organization_id='${org}' AND entity_id='${event}';`), auditBefore,
        "denied command writes no audit success record");
      assert.equal(revision(), before + 1n, "only the committed admin move advances the source revision");
    } finally {
      for (const worker of [holder, caller].filter(Boolean)) {
        if (!worker.closed && !worker.child.stdin.writableEnded) worker.child.stdin.end("ROLLBACK;\n");
      }
      await Promise.all([holder.done, ...(caller ? [caller.done] : [])]);
    }
  });
}
