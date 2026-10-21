import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { propertyConcurrencyTarget } from "./property-concurrency-target.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";

// Only the verified ephemeral CI database or an explicitly named local
// readiness database is admitted. No hosted URL/key or existing API key is read.
const privateValues = [];
const safe = value => privateValues.reduce(
  (text, value) => text.replaceAll(value, "[synthetic-redacted]"), String(value));
function execute(command, args, input, { worker = false, ...options } = {}) {
  if (worker) return spawn(command, args, { ...options, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const result = spawnSync(command, args, { ...options, input, encoding: "utf8",
    shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(safe(result.error.message));
  assert.equal(result.status, 0, safe(result.stderr));
  return result.stdout;
}
if (process.env.CI === "true") {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "CI mode is restricted to the ephemeral GitHub runner.");
  assert.match(process.env.GITHUB_RUN_ID ?? "", /^\d+$/);
}
const database = await propertyConcurrencyTarget({
  config: readFileSync(resolve(import.meta.dirname, "../supabase/config.toml"), "utf8"), execute,
});
const { docker } = await localRecoveryDocker({ execute });
let lastResourceCheck = 0;
function resourceGuard() {
  if (process.env.CI === "true" || process.platform !== "win32"
    || Date.now() - lastResourceCheck < 15_000) return;
  const sample = JSON.parse(execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$m=Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 8 -ErrorAction Stop; $d=Get-PSDrive C -ErrorAction Stop; [pscustomobject]@{memory=([double]$m.FreePhysicalMemory*1024);disk=[double]$d.Free}|ConvertTo-Json -Compress"]));
  assert.ok(sample.memory >= 2 * 1024 ** 3, "HTTP fixture requires at least 2 GiB free host memory.");
  assert.ok(sample.disk >= 8 * 1024 ** 3, "HTTP fixture requires at least 8 GiB free host disk.");
  lastResourceCheck = Date.now();
}
const run = sql => { resourceGuard(); return database.run(sql); };
const ids = Object.fromEntries([
  "org", "foreignOrg", "actor", "secondActor", "outsider",
  "branch", "otherBranch", "foreignBranch", "property", "otherProperty", "foreignProperty",
].map(key => [key, randomUUID()]));
const project = database.container.slice("supabase_db_".length);
const role = `unit_http_${randomBytes(10).toString("hex")}`;
const password = randomBytes(28).toString("hex");
const jwtSecret = randomBytes(40).toString("base64url");
privateValues.push(password, jwtSecret);
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(actor) {
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "authenticated", sub: actor, aud: "authenticated",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  const value = `${data}.${createHmac("sha256", jwtSecret).update(data).digest("base64url")}`;
  privateValues.push(value);
  return value;
}
const actorToken = token(ids.actor);
const secondToken = token(ids.secondActor);
const outsiderToken = token(ids.outsider);
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let rest, restName, endpoint, roleCreated = false, fixtureCreated = false;
let proxy;
let requests = 0;
const sqlSessions = [];

async function until(predicate, message, session) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    assert.ok(!session?.closed, safe(`${message}: ${session?.stderr}`));
    await delay(40);
  }
  assert.fail(message);
}
async function startSqlSession(sql) {
  resourceGuard();
  const child = database.spawnWorker();
  const session = { child, name: `unit-http-${randomUUID()}`, stdout: "", stderr: "", closed: false };
  session.done = new Promise(resolve => {
    child.on("error", error => resolve({ status: null, stderr: safe(error.message) }));
    child.on("close", status => { session.closed = true; resolve({ status, stdout: session.stdout, stderr: session.stderr }); });
  });
  child.stdout.on("data", chunk => { session.stdout += chunk; });
  child.stderr.on("data", chunk => { session.stderr += chunk; });
  sqlSessions.push(session);
  // Only test setup takes a raw lock as postgres: authenticated deliberately
  // lacks direct table UPDATE. Subsequent edit RPCs run as authenticated.
  child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s';
    SET LOCAL application_name='${session.name}';
    SELECT set_config('request.jwt.claim.sub','${ids.actor}',true);
    ${sql}\nSET LOCAL ROLE authenticated;
    SELECT pg_backend_pid()::text || ':UNIT_HTTP_SESSION_READY';\n`);
  await until(() => /\d+:UNIT_HTTP_SESSION_READY/.test(session.stdout), "SQL lock session did not become ready", session);
  session.pid = Number(session.stdout.match(/(\d+):UNIT_HTTP_SESSION_READY/)[1]);
  return session;
}
async function closeSqlSessions() {
  const failures = [];
  for (const session of sqlSessions.filter(value => !value.closed)) {
    try {
      database.run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE application_name=${q(session.name)}
        ${Number.isSafeInteger(session.pid) ? `AND pid=${session.pid}` : ""};`);
      session.child.stdin.end();
      await session.done;
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "HTTP concurrency sessions did not close.");
}

function inspectRest(reference = rest, { allowUnhealthy = false } = {}) {
  const value = JSON.parse(docker(["inspect", reference, "--format",
    '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "codex.unit-http")}},"running":{{json .State.Running}},"oom":{{json .State.OOMKilled}}}']));
  assert.match(value.id, /^[a-f0-9]{64}$/);
  if (rest) assert.equal(value.id, rest);
  assert.equal(value.name, `/${restName}`);
  assert.equal(value.project, role);
  if (!allowUnhealthy) assert.equal(value.oom, false);
  return value;
}
function reconcileRest() {
  const matches = docker(["ps", "-aq", "--no-trunc", "--filter", `name=^/${restName}$`])
    .trim().split(/\r?\n/).filter(Boolean);
  assert.ok(matches.length <= 1, "Disposable PostgREST name is ambiguous.");
  if (matches.length === 0) return;
  const owned = inspectRest(matches[0], { allowUnhealthy: true });
  assert.equal(owned.id, matches[0]);
  rest = owned.id;
}
async function setupRest() {
  const db = JSON.parse(docker(["inspect", database.containerId, "--format",
    '{"id":{{json .Id}},"network":{{json .HostConfig.NetworkMode}}}']));
  assert.equal(db.id, database.containerId);
  assert.match(db.network, /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/);
  assert.ok(!["host", "none", "default", "bridge"].includes(db.network), "A verified project network is required.");
  const network = JSON.parse(docker(["network", "inspect", db.network, "--format",
    '{"id":{{json .Id}},"containers":{{json .Containers}}}']));
  assert.ok(network.containers[database.containerId], "Database is absent from its named network.");
  let image;
  if (process.env.CI === "true") {
    const existing = JSON.parse(docker(["inspect", `supabase_rest_${project}`, "--format",
      '{"name":{{json .Name}},"image":{{json .Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}']));
    assert.equal(existing.name, `/supabase_rest_${project}`);
    assert.equal(existing.project, project);
    image = existing.image;
  } else {
    image = docker(["image", "inspect", "public.ecr.aws/supabase/postgrest:v14.13", "--format", "{{.Id}}"]).trim();
  }
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  // Track the attempt before dispatch so an uncertain COMMIT is cleaned up.
  roleCreated = true;
  run(`BEGIN; CREATE ROLE ${role} NOINHERIT LOGIN PASSWORD ${q(password)};
    GRANT anon, authenticated TO ${role}; COMMIT;`);
  const databaseUrl = new URL(`postgresql://${database.container}:5432/postgres`);
  databaseUrl.username = role;
  databaseUrl.password = password;
  restName = `nestory-unit-http-${randomUUID()}`;
  try {
    const createdId = docker(["create", "--pull", "never", "--name", restName,
      "--label", `codex.unit-http=${role}`, "--network", db.network,
      "--publish", "127.0.0.1::3000", "--memory", "128m", "--memory-swap", "128m",
      "--cpus", "0.5", "--pids-limit", "64", "--restart", "no",
      "--security-opt", "no-new-privileges:true",
      "--env", `PGRST_DB_URI=${databaseUrl.href}`,
      "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon",
      "--env", `PGRST_JWT_SECRET=${jwtSecret}`, "--env", "PGRST_DB_POOL=4",
      "--env", "PGRST_LOG_LEVEL=error", "--env", "PGRST_SERVER_PORT=3000", image]).trim();
    assert.match(createdId, /^[a-f0-9]{64}$/);
    rest = createdId;
  } catch (error) {
    // A timed-out create can have succeeded. Reclaim only this exact name and
    // ownership label for cleanup; never create another container on retry.
    try { reconcileRest(); }
    catch (recoveryError) {
      throw new AggregateError([error, recoveryError], "PostgREST creation outcome is unresolved.");
    }
    throw error;
  }
  assert.equal(inspectRest().running, false);
  docker(["start", rest]);
  const port = docker(["port", rest, "3000/tcp"]).trim();
  assert.match(port, /^127\.0\.0\.1:\d+$/);
  endpoint = `http://${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    assert.equal(inspectRest().running, true);
    try {
      const result = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
      if (result.status === 200) return;
    } catch { /* bounded startup reads only */ }
    await delay(200);
  }
  throw new Error("Disposable PostgREST startup failed.");
}
const body = (label, changes = {}) => ({
  p_organization_id: ids.org, p_property_id: ids.property,
  p_unit_number: label, p_floor: null, p_size_sqm: null,
  p_bedroom_count: null, p_bathroom_count: 0, p_status: "vacant",
  p_idempotency_key: `unit-http-${randomUUID()}`, ...changes,
});
async function rpc(payload, jwt = actorToken, base = endpoint) {
  resourceGuard();
  requests += 1;
  const response = await fetch(`${base}/rpc/create_unit`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(payload), redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function created(payload, jwt = actorToken) {
  const response = await rpc(payload, jwt);
  assert.equal(response.status, 200, `RPC failed: ${response.data?.code ?? response.status}`);
  assert.match(response.data, /^[a-f0-9-]{36}$/);
  return response.data;
}
async function denied(payload, jwt = actorToken) {
  const response = await rpc(payload, jwt);
  assert.ok(response.status >= 400 && response.status < 500, `Expected rejection, got ${response.status}`);
  assert.ok(response.data.code && response.data.code !== "PGRST202", "Function signature must resolve.");
  return response;
}
async function resultChanged(payload) {
  const response = await rpc(payload);
  // PostgREST maps SQLSTATE class 55 to HTTP 500. Require this exact domain
  // rejection, so a deadlock, timeout or unrelated server error cannot pass.
  assert.deepEqual({ status: response.status, code: response.data.code, details: response.data.details }, {
    status: 500, code: "55000", details: "unit_creation_result_changed",
  });
}
function inventory(unitId) {
  return JSON.parse(run(`SELECT jsonb_build_object(
    'units',(SELECT count(*) FROM public.units WHERE organization_id='${ids.org}' AND id='${unitId}'),
    'audits',(SELECT count(*) FROM public.activity_logs WHERE organization_id='${ids.org}'
      AND entity_id='${unitId}' AND action='unit_created'),
    'receipts',(SELECT count(*) FROM app_private.unit_creation_requests WHERE organization_id='${ids.org}' AND unit_id='${unitId}'));`));
}
function fixtures() {
  fixtureCreated = true;
  run(`BEGIN; INSERT INTO auth.users(id,email) VALUES
    ('${ids.actor}','${ids.actor}@example.test'),
    ('${ids.secondActor}','${ids.secondActor}@example.test'),
    ('${ids.outsider}','${ids.outsider}@example.test');
    INSERT INTO public.organizations(id,name,slug) VALUES
    ('${ids.org}','Synthetic HTTP unit recovery','${ids.org}'),
    ('${ids.foreignOrg}','Synthetic HTTP foreign company','${ids.foreignOrg}');
    INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES
    ('${ids.branch}','${ids.org}','Primary','PRIMARY'),
    ('${ids.otherBranch}','${ids.org}','Other','OTHER'),
    ('${ids.foreignBranch}','${ids.foreignOrg}','Foreign','FOREIGN');
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
    ('${ids.org}','${ids.actor}','super_admin'),
    ('${ids.org}','${ids.secondActor}','super_admin');
    INSERT INTO public.properties(id,organization_id,name,code,property_type) VALUES
    ('${ids.property}','${ids.org}','Primary property','HTTP-PRIMARY','House'),
    ('${ids.otherProperty}','${ids.org}','Other property','HTTP-OTHER','House'),
    ('${ids.foreignProperty}','${ids.foreignOrg}','Foreign property','HTTP-FOREIGN','House');
    SELECT set_config('request.jwt.claim.sub','${ids.actor}',false);
    SELECT public.assign_property_branch('${ids.org}','${ids.property}','${ids.branch}');
    SELECT public.assign_property_branch('${ids.org}','${ids.otherProperty}','${ids.otherBranch}');
    COMMIT;`);
}
function cleanupFixtures() {
  const organizations = `'${ids.org}','${ids.foreignOrg}'`;
  database.run(`BEGIN; SET LOCAL session_replication_role=replica;
    DELETE FROM app_private.finance_account_activity_authority_history WHERE organization_id IN (${organizations});
    DELETE FROM app_private.finance_account_generated_categories WHERE organization_id IN (${organizations});
    DELETE FROM public.finance_account_category_links WHERE organization_id IN (${organizations});
    DELETE FROM public.finance_account_source_links WHERE organization_id IN (${organizations});
    DELETE FROM app_private.finance_account_internal_sources WHERE organization_id IN (${organizations});
    DELETE FROM public.finance_account_roles WHERE organization_id IN (${organizations});
    DELETE FROM public.finance_accounts WHERE organization_id IN (${organizations});
    DELETE FROM public.finance_categories WHERE organization_id IN (${organizations});
    DELETE FROM public.financial_reconciliation_sources WHERE organization_id IN (${organizations});
    SET LOCAL session_replication_role=origin;
    DELETE FROM public.organizations WHERE id IN (${organizations});
    DELETE FROM auth.users WHERE id IN ('${ids.actor}','${ids.secondActor}','${ids.outsider}');
    COMMIT;`);
  assert.deepEqual(JSON.parse(database.run(`SELECT jsonb_build_object(
    'organizations',(SELECT count(*) FROM public.organizations WHERE id IN (${organizations})),
    'users',(SELECT count(*) FROM auth.users WHERE id IN ('${ids.actor}','${ids.secondActor}','${ids.outsider}')),
    'units',(SELECT count(*) FROM public.units WHERE organization_id IN (${organizations})),
    'receipts',(SELECT count(*) FROM app_private.unit_creation_requests WHERE organization_id IN (${organizations})));`)),
  { organizations: 0, users: 0, units: 0, receipts: 0 });
}

test("actual HTTP unit creation survives lost committed responses and rejects unsafe replays", async t => {
  const failures = [];
  try {
    fixtures();
    await setupRest();
    await t.test("a committed response lost before client receipt replays one UUID and audit", async () => {
      const request = body("Lost response \u00a0 e\u0301");
      let committed;
      let forwardError;
      proxy = http.createServer(async (incoming) => {
        try {
          const chunks = [];
          for await (const chunk of incoming) chunks.push(chunk);
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const result = await rpc(payload);
          assert.equal(result.status, 200);
          committed = result.data;
          // Upstream PostgREST has returned after transaction commit. Destroy
          // downstream without forwarding status, headers or the generated UUID.
          incoming.socket.destroy();
        } catch (error) { forwardError = error; incoming.socket.destroy(); }
      });
      await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
      const address = proxy.address();
      await assert.rejects(rpc(request, actorToken, `http://127.0.0.1:${address.port}`));
      assert.equal(forwardError, undefined);
      assert.match(committed, /^[a-f0-9-]{36}$/);
      assert.deepEqual(inventory(committed), { units: 1, audits: 1, receipts: 1 });
      assert.equal(await created(request), committed);
      assert.deepEqual(inventory(committed), { units: 1, audits: 1, receipts: 1 });
      await new Promise(resolve => proxy.close(resolve));
      proxy = undefined;
    });
    await t.test("concurrent duplicate HTTP requests converge on one unit and audit", async () => {
      const request = body("Concurrent", { p_floor: "0", p_size_sqm: 0, p_bedroom_count: 0 });
      const results = await Promise.all([created(request), created(request), created(request)]);
      assert.equal(new Set(results).size, 1);
      assert.deepEqual(inventory(results[0]), { units: 1, audits: 1, receipts: 1 });
    });
    await t.test("concurrent unit edit and HTTP replay finish without a parent/unit deadlock", async t => {
      t.after(closeSqlSessions);
      const request = body("Concurrent editor");
      const id = await created(request);
      const gate = await startSqlSession(`SELECT pg_advisory_xact_lock(hashtextextended(
        '${ids.org}:unit_creation_v1:${request.p_idempotency_key}',0));`);
      const editor = await startSqlSession(`SELECT id FROM public.units WHERE id='${id}' FOR UPDATE;`);
      // The advisory gate holds replay after its parent lock. The editor then
      // waits on that parent while retaining the unit lock, deterministically
      // forming the old lock inversion before replay is released.
      const replay = rpc(request).then(value => ({ value }), error => ({ error }));
      let replayPid;
      await until(() => {
        const pid = run(`SELECT pid FROM pg_stat_activity
          WHERE usename=${q(role)} AND ${gate.pid}=ANY(pg_blocking_pids(pid));`);
        if (!pid) return false;
        assert.match(pid, /^\d+$/);
        replayPid = Number(pid);
        return true;
      }, "HTTP replay did not reach its advisory gate");
      editor.child.stdin.end(`SELECT public.update_unit('${id}','${ids.org}','${ids.property}',
        ${q(request.p_unit_number)},'Edited during replay',NULL,NULL,0,'vacant'); COMMIT;\n`);
      await until(() => run(`SELECT ${replayPid}=ANY(pg_blocking_pids(${editor.pid}));`) === "t",
        "Unit editor did not wait on the replay parent lock", editor);
      gate.child.stdin.end("COMMIT;\n");
      const [result, edited, released] = await Promise.all([replay, editor.done, gate.done]);
      assert.equal(result.error, undefined);
      assert.equal(result.value.status, 200, `Replay failed: ${result.value.data?.code}`);
      assert.equal(result.value.data, id);
      assert.equal(edited.status, 0, safe(edited.stderr));
      assert.equal(released.status, 0, safe(released.stderr));
      assert.equal(run(`SELECT floor FROM public.units WHERE id='${id}';`), "Edited during replay");
      assert.deepEqual(inventory(id), { units: 1, audits: 1, receipts: 1 });
      await resultChanged(request);
    });
    await t.test("same key rejects changed physical payload, parent, actor and company", async () => {
      const request = body("Bound request");
      const id = await created(request);
      for (const changes of [
        { p_floor: "0" }, { p_size_sqm: 0 }, { p_bedroom_count: 0 },
        { p_bathroom_count: null }, { p_unit_number: "Other label" },
        { p_property_id: ids.otherProperty },
        { p_organization_id: ids.foreignOrg, p_property_id: ids.foreignProperty },
      ]) await denied({ ...request, ...changes });
      await denied(request, secondToken);
      await denied(request, outsiderToken);
      assert.deepEqual(inventory(id), { units: 1, audits: 1, receipts: 1 });
    });
    await t.test("stored numeric rounding permits only the original exact request", async () => {
      const request = body("Rounded size", { p_size_sqm: 1.005 });
      const id = await created(request);
      assert.equal(run(`SELECT size_sqm FROM public.units WHERE id='${id}';`), "1.01");
      assert.equal(await created(request), id);
      await denied({ ...request, p_size_sqm: 1.01 });
    });
    await t.test("archived and drifted units cannot be adopted by replay", async () => {
      const archived = body("Archived");
      const id = await created(archived);
      run(`UPDATE public.units SET archived_at=now(),archived_by='${ids.actor}' WHERE id='${id}';`);
      await resultChanged(archived);
      const drifted = body("Drifted");
      const otherId = await created(drifted);
      run(`UPDATE public.units SET floor='Changed' WHERE id='${otherId}';`);
      await resultChanged(drifted);
      assert.deepEqual(inventory(id), { units: 1, audits: 1, receipts: 1 });
      assert.deepEqual(inventory(otherId), { units: 1, audits: 1, receipts: 1 });
    });
    await t.test("current branch state and owner authority are required for replay", async () => {
      const request = body("Current authority");
      const id = await created(request);
      run(`UPDATE public.organization_branches SET status='inactive' WHERE id='${ids.branch}';`);
      await denied(request);
      run(`UPDATE public.organization_branches SET status='active' WHERE id='${ids.branch}';
        DELETE FROM public.organization_members WHERE organization_id='${ids.org}' AND user_id='${ids.actor}';`);
      await denied(request);
      run(`INSERT INTO public.organization_members(organization_id,user_id,role)
        VALUES('${ids.org}','${ids.actor}','super_admin');`);
      assert.equal(await created(request), id);
    });
    await t.test("legacy six/eight argument signatures remain callable and receipt-private", async () => {
      const eight = body("Legacy eight");
      delete eight.p_idempotency_key;
      const six = { ...eight, p_unit_number: "Legacy six" };
      delete six.p_bedroom_count;
      delete six.p_bathroom_count;
      assert.notEqual(await created(eight), await created(six));
      const deniedRead = await fetch(`${endpoint}/unit_creation_requests`, {
        headers: { Authorization: `Bearer ${actorToken}` }, signal: AbortSignal.timeout(5000),
      });
      assert.ok(deniedRead.status >= 400);
      assert.equal(run("SELECT has_table_privilege('authenticated','app_private.unit_creation_requests','SELECT');"), "f");
    });
    t.diagnostic(`Actual PostgREST HTTP requests: ${requests}; synthetic target ${database.container}; no hosted requests or existing key reads.`);
  } catch (error) {
    failures.push(error);
  } finally {
    if (proxy) {
      proxy.closeAllConnections();
      await new Promise(resolve => proxy.close(resolve));
    }
    try { await closeSqlSessions(); } catch (error) { failures.push(error); }
    if (restName && !rest) {
      try { reconcileRest(); } catch (error) { failures.push(error); }
    }
    if (rest) {
      try {
        inspectRest(rest, { allowUnhealthy: true });
        docker(["rm", "--force", rest]);
        assert.equal(docker(["ps", "-aq", "--no-trunc", "--filter", `id=${rest}`]).trim(), "");
      } catch (error) { failures.push(error); }
    }
    if (roleCreated) {
      try {
        database.run(`DROP ROLE IF EXISTS ${role};`);
        assert.equal(database.run(`SELECT count(*) FROM pg_roles WHERE rolname=${q(role)};`), "0");
      } catch (error) { failures.push(error); }
    }
    if (fixtureCreated) {
      try { cleanupFixtures(); } catch (error) { failures.push(error); }
    }
  }
  if (failures.length === 0) t.diagnostic("Owned HTTP helper, login role, synthetic organizations, users, units and receipts were removed.");
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "HTTP recovery verification or scoped cleanup failed.");
});
