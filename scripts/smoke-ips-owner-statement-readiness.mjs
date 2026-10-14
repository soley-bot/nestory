// Fixed local official-publication acceptance. No baseline reload, global
// cleanup, or deletion of prior statements. Fresh cases remain for review.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { assertRecoveryContainer, FIXTURE_USERS, sha256 } from "./ips-readiness-recovery-core.mjs";
import { statementTarget as target, verifyStatementTarget, reconcileFreshStatement, verifyStatementArtifact } from "./owner-statement-readiness-core.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(process.argv.length, 2, "Alternate target arguments are unsupported");
const readJson = name => JSON.parse(readFileSync(path.join(cwd, name), "utf8").replace(/^\uFEFF/, ""));
const manifest = readJson(".codex-artifacts/ips-readiness-source-manifest.json");
const status = readJson(".codex-artifacts/isolated-local-status.json");
verifyStatementTarget({ cwd, manifest, status, env: process.env,
  config: readFileSync(path.join(cwd, "supabase/config.toml"), "utf8"),
  fixtureHash: sha256(readFileSync(path.join(cwd, "supabase/test-fixtures/baseline.sql"))) });
const runId = randomUUID();
const ids = { organization: randomUUID(), branch: randomUUID(), property: null, owner: null, assignment: null };
const baselineOrganization = target.organization;
const output = path.join(cwd, ".codex-artifacts/official-owner-statement", runId);
mkdirSync(output, { recursive: true });
const report = { runId, target, sourceContainerId: manifest.containerId, ids,
  startedAt: new Date().toISOString(), completed: false, phases: [],
  cleanup: "Fresh synthetic case and official artifacts retained; no global cleanup." };
const save = () => writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
save();
const execute = (command, args, input, options = {}) => {
  const result = spawnSync(command, args, { input, encoding: "utf8", shell: false,
    windowsHide: true, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    writeFileSync(path.join(output, "local-command-failure.json"), JSON.stringify({
      command, args, exitCode: result.status, error: result.error?.message, stderr: result.stderr,
    }, null, 2));
    throw Error("Verified local statement database operation failed; see scoped local-command-failure.json.");
  }
  return result.stdout;
};
const { docker, endpoint } = await localRecoveryDocker({ execute });
report.dockerEndpoint = endpoint;
function sql(statement) {
  const format = '{"name":{{json .Name}},"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"image":{{json .Image}}}';
  assertRecoveryContainer(JSON.parse(docker(["inspect", target.container, "--format", format])), manifest.containerId);
  return docker(["exec", "-i", manifest.containerId, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], statement).trim();
}
const jsonSql = statement => JSON.parse(sql(statement));
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const baselineActors = {
  super_admin: { id: FIXTURE_USERS[0], email: "nestory@gmail.com" },
  finance_manager: { id: "00000000-0000-0000-0000-000000000701", email: "finance.manager@nestory.com" },
  finance_member: { id: "00000000-0000-0000-0000-000000000801", email: "finance.member@nestory.com" },
  operations_manager: { id: "00000000-0000-0000-0000-000000000501", email: "operations.manager@nestory.com" },
};
const baselinePassword = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const password = `Synthetic-${randomUUID()}!`;
const actors = {};
report.actors = actors;
async function actorClient(name, identities = actors, actorPassword = password) {
  const client = createClient(target.api, status.ANON_KEY, options);
  const signedIn = await client.auth.signInWithPassword({ email: identities[name].email, password: actorPassword });
  assert.ifError(signedIn.error); assert.equal(signedIn.data.user?.id, identities[name].id);
  return client;
}
async function rpc(client, name, args) {
  const result = await client.rpc(name, args); assert.ifError(result.error); return result.data;
}
async function deniedRpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error?.code, "42501", `${name} must reject this role`);
  assert.equal(result.data, null);
}
function phase(name, detail = {}) { report.phases.push({ name, ...detail }); save(); console.log(`PASS ${name}`); }
let browser, monthStart;
function publications(property = ids.property, owner = ids.owner, month = monthStart, organization = ids.organization) {
  return jsonSql(`SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.revision_number),'[]'::jsonb) FROM (
    SELECT publication.id,publication.statement_number,publication.supersedes_publication_id,revision.revision_number,
      revision.id revision_id,series.id series_id,
      (SELECT count(*) FROM public.owner_statement_artifacts a WHERE a.publication_id=publication.id) artifact_count
    FROM public.owner_statement_publications publication JOIN public.owner_close_revisions revision ON revision.id=publication.owner_close_revision_id
    JOIN public.owner_close_series series ON series.id=revision.owner_close_series_id
    WHERE series.organization_id=${q(organization)} AND series.property_id=${q(property)}
      AND series.owner_person_id=${q(owner)} AND series.month_start=${q(month)}) p;`);
}
function frozenSnapshot(publicationIds, organization = ids.organization) {
  return sql(`SELECT jsonb_agg(jsonb_build_object('publication',to_jsonb(p),'artifacts',(
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.format) FROM public.owner_statement_artifacts a WHERE a.publication_id=p.id)) ORDER BY p.id)
    FROM public.owner_statement_publications p WHERE p.organization_id=${q(organization)} AND p.id IN (${publicationIds.map(q).join(",")});`);
}
async function downloadFromUi(page, publication) {
  const card = page.locator("article").filter({ has: page.getByText(publication.statement_number, { exact: true }) });
  const artifacts = jsonSql(`SELECT jsonb_agg(to_jsonb(a) ORDER BY format) FROM public.owner_statement_artifacts a WHERE publication_id=${q(publication.id)};`);
  assert.deepEqual(artifacts.map(a => a.format), ["pdf", "xlsx"]);
  for (const artifact of artifacts) {
    const link = card.getByRole("link", { name: artifact.format === "pdf" ? "Download PDF" : "Download Excel", exact: true });
    const href = await link.getAttribute("href");
    const url = new URL(href, target.app); assert.equal(url.origin, target.app);
    assert.equal(url.pathname, `/api/reports/${artifact.format === "pdf" ? "pdf" : "excel"}`);
    assert.equal(url.searchParams.get("artifactId"), artifact.id);
    const [download, response] = await Promise.all([
      page.waitForEvent("download"), page.waitForResponse(response => response.url() === url.toString()), link.click(),
    ]);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["content-type"], artifact.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const destination = path.join(output, `${publication.statement_number}.${artifact.format}`);
    await download.saveAs(destination); verifyStatementArtifact(readFileSync(destination), artifact);
  }
}
async function withActor(name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return [target.app, target.api].includes(url.origin) || ["data:", "blob:"].includes(url.protocol)
      ? route.continue() : route.abort("blockedbyclient");
  });
  try {
    await page.goto(`${target.app}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(actors[name].email); await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(url => url.pathname !== "/login");
    await page.goto(`${target.app}/workspace`, { waitUntil: "networkidle" });
    await page.waitForURL(url => url.pathname !== "/workspace");
    const cookies = (await context.cookies()).filter(c => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name))
      .sort((a, b) => Number(a.name.match(/\.(\d+)$/)?.[1] ?? 0) - Number(b.name.match(/\.(\d+)$/)?.[1] ?? 0));
    assert.ok(cookies.length, "App did not establish a local Auth session");
    const value = decodeURIComponent(cookies.map(c => c.value).join(""));
    const session = JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString() : value);
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
    assert.equal(claims.iss, `${target.api}/auth/v1`);
    const verified = await createClient(target.api, status.ANON_KEY, options).auth.getUser(session.access_token);
    assert.ifError(verified.error); assert.equal(verified.data.user?.id, actors[name].id);
    await run(page);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function balancePage(page) {
  const url = new URL("/balances", target.app);
  url.searchParams.set("propertyId", ids.property); url.searchParams.set("ownerPersonId", ids.owner);
  url.searchParams.set("month", monthStart.slice(0, 7));
  url.searchParams.set("view", "statements"); url.searchParams.set("manage", "1");
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  const preparation = page.locator("details").filter({ has: page.locator("summary").getByText("Prepare or correct a statement", { exact: true }) });
  if (await preparation.count() && await preparation.getAttribute("open") === null) {
    await preparation.locator(":scope > summary").click();
  }
  await page.getByTestId("owner-close-readiness").waitFor();
}
async function closeAndPublish(page, revision) {
  await balancePage(page);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Close owner month", exact: true }) }).first();
  await form.getByLabel("Close reason").fill(`Synthetic official statement ${runId} revision ${revision}`);
  await form.getByRole("button", { name: "Close owner month", exact: true }).click();
  await page.getByRole("button", { name: "Publish owner statement", exact: true }).waitFor();
  await page.getByRole("button", { name: "Publish owner statement", exact: true }).click();
  const deadline = Date.now() + 60_000;
  let publication;
  while (Date.now() < deadline) {
    publication = publications().find(row => row.revision_number === revision && row.artifact_count === 2);
    if (publication) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(publication, "Official publication/artifact registration did not complete");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(publication.statement_number, { exact: true }).waitFor();
  await downloadFromUi(page, publication);
  return publication;
}

try {
  const baseline = jsonSql(`SELECT jsonb_build_object('organization',EXISTS(SELECT 1 FROM public.organizations WHERE id=${q(baselineOrganization)}),
    'users',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users WHERE id IN (${FIXTURE_USERS.map(q).join(",")})));`);
  assert.equal(baseline.organization, true); assert.deepEqual(baseline.users, FIXTURE_USERS);
  monthStart = sql("SELECT (date_trunc('month',now() AT TIME ZONE 'UTC') + interval '48 months')::date::text;");
  report.monthStart = monthStart;
  assert.equal(sql(`SELECT count(*) FROM public.financial_month_locks WHERE organization_id=${q(ids.organization)} AND month_start=${q(monthStart)};`), "0", "Fresh month already has a company lock");
  const baselineMonth = sql("SELECT (date_trunc('month',now() AT TIME ZONE 'UTC') + interval '24 months')::date::text;");
  const historical = publications("10000000-0000-0000-0000-000000000004", "80000000-0000-0000-0000-000000000014", baselineMonth, baselineOrganization);
  assert.equal(historical.length, 1); assert.equal(historical[0].revision_number, 3); assert.equal(historical[0].artifact_count, 2);
  const baselineIds = historical.map(row => row.id), baselineBefore = frozenSnapshot(baselineIds, baselineOrganization);
  writeFileSync(path.join(output, "historical-before.json"), baselineBefore);
  const baselineMember = await actorClient("finance_member", baselineActors, baselinePassword);
  const historicalModel = await rpc(baselineMember, "get_owner_statement_publication", { p_organization_id: baselineOrganization, p_publication_id: historical[0].id });
  const oracle = readJson("scripts/fixtures/owner-statement-publication.json");
  assert.deepEqual(historicalModel.components.map(c => ({ component: c.component, opening: c.opening_amount, movement: c.movement_amount, closing: c.closing_amount })), oracle.reconciliation.components);
  assert.equal(historicalModel.lines.length, 17);
  assert.deepEqual(historicalModel.artifacts.map(artifact => artifact.format).sort(), ["pdf", "xlsx"]);
  const historicalBytes = [];
  for (const artifact of historicalModel.artifacts) {
    const downloaded = await baselineMember.storage.from("owner-statements").download(artifact.storage_path); assert.ifError(downloaded.error);
    const bytes = Buffer.from(await downloaded.data.arrayBuffer()); verifyStatementArtifact(bytes, artifact);
    historicalBytes.push({ artifact, hash: sha256(bytes) });
  }
  phase("historical official statement and retained bytes verified", { publicationId: historical[0].id });

  // Separate ordinary synthetic organization and genuine local Auth users.
  // Existing baseline UUIDs predate strict UUID validation and remain read-only.
  const authAdmin = createClient(target.api, status.SERVICE_ROLE_KEY, options);
  for (const name of Object.keys(baselineActors)) {
    const email = `statement-${runId.slice(0, 8)}-${name.replaceAll("_", "-")}@example.test`;
    const created = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error); actors[name] = { id: created.data.user.id, email };
    save();
  }
  const roleCopies = [
    ["finance_manager", "00000000-0000-0000-0000-000000000311"],
    ["finance_member", "00000000-0000-0000-0000-000000000312"],
    ["operations_manager", "00000000-0000-0000-0000-000000000313"],
  ].map(([name, original]) => ({ name, original, id: randomUUID() }));
  sql(`BEGIN;
    INSERT INTO public.organizations(id,name,slug) VALUES(${q(ids.organization)},'Synthetic official statement acceptance',${q(`statement-${runId}`)});
    INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
      VALUES(${q(ids.organization)},true,false) ON CONFLICT(organization_id) DO UPDATE SET ordinary_access_enabled=true,transition_manifest_required=false;
    INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES(${q(ids.branch)},${q(ids.organization)},'Statement acceptance','STATEMENT');
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(${q(ids.organization)},${q(actors.super_admin.id)},'super_admin');
    ${roleCopies.map(role => `INSERT INTO public.organization_roles(id,organization_id,name)
      SELECT ${q(role.id)},${q(ids.organization)},name FROM public.organization_roles WHERE organization_id=${q(baselineOrganization)} AND id=${q(role.original)};
      INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
      SELECT ${q(ids.organization)},${q(role.id)},permission_key FROM public.organization_role_permissions WHERE organization_id=${q(baselineOrganization)} AND role_id=${q(role.original)};
      INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id)
      VALUES(${q(ids.organization)},${q(actors[role.name].id)},'custom',${q(ids.branch)},${q(role.id)});`).join("\n")}
    COMMIT;`);
  report.stepUpEnforcement = sql(`SELECT coalesce((SELECT enforcement_enabled FROM app_private.privileged_email_step_up_policies WHERE organization_id=${q(ids.organization)}),false)::text;`);
  const manager = await actorClient("finance_manager"), member = await actorClient("finance_member"), admin = await actorClient("super_admin");
  phase("separate ordinary organization and real Auth actors provisioned", { organizationId: ids.organization });

  // Fresh identities and their scope are created through checked public authority.
  const sourceProperty = jsonSql(`SELECT jsonb_build_object('branch',branch_id,'type',property_type)
    FROM public.properties WHERE organization_id=${q(baselineOrganization)} AND id='10000000-0000-0000-0000-000000000004';`);
  ids.owner = await rpc(admin, "create_person", { p_organization_id: ids.organization,
    p_branch_id: ids.branch, p_display_name: `Synthetic statement owner ${runId.slice(0, 8)}`,
    p_legal_name: null, p_party_type: "individual", p_primary_email: null, p_primary_phone: null,
    p_tax_identifier: null, p_notes: `readiness:${runId}`, p_roles: ["owner"] });
  save();
  ids.property = await rpc(admin, "create_property_minimal", { p_organization_id: ids.organization,
    p_branch_id: ids.branch, p_name: `Synthetic statement property ${runId.slice(0, 8)}`,
    p_code: `OS-${runId.slice(0, 8)}`, p_property_type: sourceProperty.type, p_address: null,
    p_registered_date: null, p_idempotency_key: `${runId}:property`, p_owner_person_id: ids.owner,
    p_owner_started_on: "2024-01-01", p_owner_ownership_percent: 100 });
  ids.assignment = sql(`SELECT id FROM public.property_owners WHERE organization_id=${q(ids.organization)}
    AND property_id=${q(ids.property)} AND person_id=${q(ids.owner)} AND ended_on IS NULL;`);
  assert.match(ids.assignment, /^[0-9a-f-]{36}$/); save();
  for (const [component, amount] of [["ips_held_owner_cash", 1000], ["owner_due_to_ips", 200], ["ips_due_to_owner", 0], ["security_deposit_custody", 0]]) {
    const opening = await rpc(member, "submit_owner_opening_balance", {
      p_organization_id: ids.organization, p_property_id: ids.property, p_owner_person_id: ids.owner,
      p_currency: "USD", p_effective_date: monthStart, p_component: component, p_amount: amount,
      p_reason: `Synthetic statement ${runId}`, p_source_reference: `readiness:${runId}:${component}`,
      p_supporting_document_id: null, p_evidence_sha256: sha256(`${runId}:${component}`),
      p_resubmission_of_request_id: null, p_idempotency_key: `${runId}:opening:${component}` });
    await rpc(admin, "review_owner_opening_balance", { p_organization_id: ids.organization, p_request_id: opening.request_id,
      p_decision: "approve", p_review_reason: "Independently verified synthetic opening", p_idempotency_key: `${runId}:approve:${component}` });
  }
  const period = { p_organization_id: ids.organization, p_property_id: ids.property,
    p_owner_person_id: ids.owner, p_currency: "USD", p_month_start: monthStart };
  await rpc(manager, "generate_owner_balance_period", { ...period, p_idempotency_key: `${runId}:period:r1` });
  await rpc(admin, "set_financial_month_lock", { p_organization_id: ids.organization, p_month_start: monthStart,
    p_locked: true, p_reason: `Synthetic statement case ${runId}` });
  phase("fresh case prepared through checked opening and period authority");
  await deniedRpc(member, "close_owner_month", { ...period,
    p_close_reason: "Synthetic forbidden member close", p_idempotency_key: `${runId}:deny:member-close` });
  browser = await chromium.launch({ headless: true });
  let first, second;
  await withActor("finance_manager", async page => {
    first = await closeAndPublish(page, 1); const firstSnapshot = frozenSnapshot([first.id]);
    const firstModel = await rpc(manager, "get_owner_statement_publication", { p_organization_id: ids.organization, p_publication_id: first.id });
    reconcileFreshStatement(firstModel, 1);
    writeFileSync(path.join(output, "revision-one-model.json"), JSON.stringify(firstModel, null, 2));
    phase("Finance Manager publishes and downloads official revision one", { publicationId: first.id });
    await deniedRpc(member, "publish_owner_statement", { p_organization_id: ids.organization,
      p_owner_close_revision_id: first.revision_id, p_idempotency_key: `${runId}:deny:member-publish` });
    await deniedRpc(member, "reopen_owner_month", { p_organization_id: ids.organization,
      p_owner_close_series_id: first.series_id, p_reopen_reason: "Synthetic forbidden member reopen",
      p_idempotency_key: `${runId}:deny:member-reopen` });
    phase("Finance Member close, publish and reopen rejected with 42501");
    const seriesId = sql(`SELECT id FROM public.owner_close_series WHERE organization_id=${q(ids.organization)} AND property_id=${q(ids.property)} AND owner_person_id=${q(ids.owner)} AND month_start=${q(monthStart)};`);
    const reopened = await rpc(admin, "reopen_owner_month", { p_organization_id: ids.organization, p_owner_close_series_id: seriesId,
      p_reopen_reason: "Synthetic late correction for retained supersession proof", p_idempotency_key: `${runId}:reopen:r2` });
    await rpc(admin, "record_owner_close_correction", { p_organization_id: ids.organization, p_owner_close_revision_id: reopened.revision_id,
      p_component: "ips_held_owner_cash", p_effective_date: monthStart, p_signed_amount: -25,
      p_reason: "Synthetic late bank charge", p_source_reference: `readiness:${runId}:correction`,
      p_evidence_sha256: sha256(`${runId}:correction`), p_idempotency_key: `${runId}:correction:r2` });
    await rpc(manager, "generate_owner_balance_period", { ...period, p_idempotency_key: `${runId}:period:r2` });
    second = await closeAndPublish(page, 2);
    assert.equal(second.supersedes_publication_id, first.id); assert.equal(frozenSnapshot([first.id]), firstSnapshot);
    const secondModel = await rpc(manager, "get_owner_statement_publication", { p_organization_id: ids.organization, p_publication_id: second.id });
    reconcileFreshStatement(secondModel, 2);
    writeFileSync(path.join(output, "revision-two-model.json"), JSON.stringify(secondModel, null, 2));
    await downloadFromUi(page, first); await page.getByText("Superseded", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "manager-official-statements.png"), fullPage: true });
    phase("corrected revision two supersedes immutable retained revision one", { publicationId: second.id });
  });
  await withActor("finance_member", async page => {
    await balancePage(page); await downloadFromUi(page, first); await downloadFromUi(page, second);
    for (const name of ["Publish owner statement", "Close owner month", "Reopen month"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0);
    phase("Finance Member downloads both formats without mutation controls");
  });
  await withActor("operations_manager", async page => {
    assert.equal(await page.locator('nav[aria-label="Global navigation"] a[href="/balances"]').count(), 0);
    const response = await page.goto(`${target.app}/balances`, { waitUntil: "networkidle" });
    assert.ok(new URL(page.url()).pathname !== "/balances" || [401,403,404].includes(response?.status() ?? 0));
    const operations = await actorClient("operations_manager");
    await deniedRpc(operations, "get_owner_statement_publication", {
      p_organization_id: ids.organization, p_publication_id: second.id });
    const artifacts = jsonSql(`SELECT jsonb_agg(to_jsonb(a) ORDER BY format) FROM public.owner_statement_artifacts a WHERE publication_id=${q(second.id)};`);
    for (const artifact of artifacts) {
      const url = new URL(`/api/reports/${artifact.format === "pdf" ? "pdf" : "excel"}`, target.app);
      url.searchParams.set("artifactId", artifact.id);
      const denied = await page.evaluate(async endpoint => {
        const response = await fetch(endpoint, { credentials: "same-origin", redirect: "manual" });
        return { status: response.status, url: response.url, contentType: response.headers.get("content-type") };
      }, url.toString());
      assert.equal(denied.url, url.toString());
      assert.equal(denied.status, 403, "Operations must be denied the retained official artifact");
      assert.match(denied.contentType, /^text\/plain/);
    }
    phase("Operations Manager denied navigation, route, statement read and both artifact downloads");
  });
  assert.equal(sql(`SELECT count(*) FROM app_private.financial_idempotency_requests WHERE organization_id=${q(ids.organization)} AND status='pending' AND operation IN ('publish_owner_statement','register_owner_statement_artifact','register_owner_statement_artifact_verified');`), "0");
  assert.equal(frozenSnapshot(baselineIds, baselineOrganization), baselineBefore);
  for (const { artifact, hash } of historicalBytes) {
    const downloaded = await baselineMember.storage.from("owner-statements").download(artifact.storage_path); assert.ifError(downloaded.error);
    assert.equal(sha256(Buffer.from(await downloaded.data.arrayBuffer())), hash);
  }
  writeFileSync(path.join(output, "historical-after.json"), frozenSnapshot(baselineIds, baselineOrganization));
  report.publications = publications(); report.completed = true;
  phase("historical publication unchanged and no pending publication claims");
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error); throw error;
} finally {
  await browser?.close(); report.finishedAt = new Date().toISOString(); save();
}
