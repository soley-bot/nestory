import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { assertDailyContainer, assertDailyOrigin, dailyOrigins, resolveDailyRun } from "./daily-workflow-policy.mjs";
import { dailyActors, dailyInvoiceHref } from "./daily-workflow-contract.mjs";
import {
  assertPolishCompletion, assertPolishReadiness, assertPolishTarget, dailyPolishFixture,
  dailyPolishSeedSql, polishCases, polishDeliverySnapshotSql, polishDockerHost,
  polishOtherAuthoritySql, polishPassword, polishReadinessSql, polishViewports,
  redactPolishEvidence,
} from "./daily-workflow-polish-contract.mjs";

const run = resolveDailyRun(process.env);
const root = process.cwd();
const reports = path.join(root, "ci-reports/daily-workflow");
const manifest = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP, run.project, "manifest.json"), "utf8"));
const dailyResult = JSON.parse(fs.readFileSync(path.join(reports, "result.json"), "utf8"));
const buildId = fs.readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim();
const command = (bin, args, options = {}) => {
  try {
    return execFileSync(bin, args, { cwd: root, encoding: "utf8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
  } catch {
    // Child stderr can include SQL input or authentication material. Retain only
    // the current case, never the raw child-process error or database query.
    throw new Error("Owned synthetic command failed");
  }
};
const docker = (args, options) => command("docker", ["--host", polishDockerHost, ...args], options);
const inspect = identity => JSON.parse(docker(["inspect", identity]))[0];
const container = inspect(`supabase_db_${run.project}`);
const databaseId = assertPolishTarget({
  env: process.env, root, manifest, container, dailyResult, buildId,
  head: command("git", ["rev-parse", "HEAD"]),
});
assert.match(fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8"), new RegExp(`^project_id = "${run.project}"$`, "m"));
for (const key of Object.keys(process.env)) {
  if (/^RESEND|^SMTP_|^SENDGRID|^MAILGUN/.test(key)) assert.ok(!process.env[key], "Email provider configuration is forbidden");
}
const base = assertDailyOrigin(process.env.NESTORY_BASE_URL, dailyOrigins.app);
const attestation = await fetch(`${base}/api/local-smoke-target`, { signal: AbortSignal.timeout(10000) });
assert.equal(attestation.status, 200);
assertDailyOrigin((await attestation.json()).supabaseOrigin, dailyOrigins.api);
const f = dailyPolishFixture(process.env);
const cases = polishCases.map(name => ({ name, status: "pending" }));
let stage = "fixture";
let page;
let browser;
const contexts = [];
const sql = statement => {
  const current = inspect(databaseId);
  assertDailyContainer(current, run.project, manifest.createdAt);
  assert.equal(current.Id, databaseId);
  assert.deepEqual(Object.keys(current.NetworkSettings.Networks), [`supabase_network_${run.project}`]);
  return docker(["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: statement });
};
const json = statement => {
  const rows = sql(statement).split(/\r?\n/).filter(line => line.startsWith("{"));
  assert.equal(rows.length, 1, "Expected one synthetic JSON result");
  return JSON.parse(rows[0]);
};
const readiness = () => json(polishReadinessSql(f));
const activationState = () => json(`SELECT jsonb_build_object(
  'enabled',(SELECT ordinary_access_enabled FROM public.organization_authorization_states WHERE organization_id='${f.org}'),
  'audits',(SELECT count(*) FROM public.activity_logs WHERE organization_id='${f.org}' AND action='organization_ordinary_access_enabled'),
  'members',(SELECT count(*) FROM public.organization_members WHERE organization_id='${f.org}'),
  'auditActor',(SELECT actor_id FROM public.activity_logs WHERE organization_id='${f.org}' AND action='organization_ordinary_access_enabled' LIMIT 1)
)::text;`);
const save = extra => fs.writeFileSync(path.join(reports, "polish-result.json"), JSON.stringify({
  sha: run.sha, project: run.project, buildId, fixture: f, cases,
  complete: false, viewports: polishViewports,
  limits: [
    "Compact is responsive viewport coverage, not native 200% browser zoom.",
    "Mixed Records covers a cost-bearing Maintenance event and a maintenance-only Inspection; no finance-only ledger event.",
    "Invoice coverage uses the issued daily-journey invoice, not a voided invoice.",
    "No email delivery or step-up verification journey is exercised; no grants or policy overrides are created.",
  ],
  ...extra,
}, null, 2));
async function screenshot(name) {
  if (page && !["/login", "/verify-session"].includes(new URL(page.url()).pathname)) {
    const filename = `polish-${name}.png`;
    await page.screenshot({ path: path.join(reports, filename), fullPage: true,
      mask: [page.locator('input[type="password"]')] });
    return filename;
  }
  return null;
}
async function check(name, operation) {
  stage = name;
  const evidence = await operation();
  const item = cases.find(item => item.name === name);
  assert.ok(item && item.status === "pending");
  Object.assign(item, { status: "passed", evidence });
  item.resultScreenshot = await screenshot(name);
  save();
  console.log(`PASS polish ${name}`);
}
async function login(email, password) {
  const context = await browser.newContext({ viewport: polishViewports.laptop, serviceWorkers: "block" });
  contexts.push(context);
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    return [dailyOrigins.app, dailyOrigins.api].includes(origin) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(url => !["/login", "/no-access"].includes(url.pathname));
  return context;
}
async function navigate(href) {
  await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(url => url.pathname === new URL(href, base).pathname);
}
async function review() {
  await page.getByRole("button", { name: "Review staff access", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Enable staff access?", exact: true });
  await expect(dialog).toBeVisible();
  for (const [region, email] of [
    ["Existing staff gaining access", f.viewerEmail],
    ["Invitations still requiring acceptance", f.invitationEmail],
  ]) {
    const assignment = dialog.getByRole("region", { name: region });
    await expect(assignment.getByText(email, { exact: true })).toBeVisible();
    await expect(assignment.getByText(`${f.branchName} · ${f.roleName}`, { exact: true })).toBeVisible();
    for (const permission of ["Finance: View", "Maintenance: View"]) {
      await expect(assignment.getByText(permission, { exact: true })).toBeVisible();
    }
  }
  await expect(dialog.getByRole("button", { name: "Confirm enable staff access", exact: true })).toBeEnabled();
  cases.find(item => item.name === stage).reviewScreenshot = await screenshot(`${stage}-consent-open`);
  return dialog;
}
async function layoutEvidence(controls) {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio, visualViewportScale: window.visualViewport?.scale ?? null,
  }));
  assert.ok(geometry.documentWidth <= geometry.clientWidth + 1, "Document overflows horizontally");
  for (const control of controls) {
    await expect(control).toBeVisible();
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.width > 0 && box.x >= -1 && box.x + box.width <= geometry.width + 1, "Control extends past viewport");
  }
  return geometry;
}
async function reportCase(viewport) {
  await page.setViewportSize(viewport);
  await navigate("/reports/rent-collections");
  const totals = page.getByRole("region", { name: "Report totals", exact: true });
  await expect(totals.locator("dt")).toHaveText(["Charges", "Received", "Deposits applied", "Outstanding", "Credit"]);
  const filters = page.getByRole("region", { name: "Report filters", exact: true });
  const property = filters.getByRole("button", { name: "Filter report by property", exact: true });
  await property.focus();
  await property.press("Enter");
  await expect(page.getByRole("option", { name: "All properties", exact: true })).toBeVisible();
  const filterScreenshot = await screenshot(`${stage}-filter-open`);
  await page.keyboard.press("Escape");
  await expect(property).toBeFocused();
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  await exportButton.focus();
  await exportButton.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "PDF report", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Excel workbook", exact: true })).toBeVisible();
  for (const format of ["pdf", "excel"]) {
    assert.equal(await menu.locator(`a[href^="/api/reports/${format}?"]`).count(), 1);
  }
  const exportScreenshot = await screenshot(`${stage}-export-open`);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(exportButton).toBeFocused();
  return { totals: 5, filterKeyboard: true, exportKeyboard: true, focusReturned: true,
    filterScreenshot, exportScreenshot,
    layout: await layoutEvidence([property, exportButton, filters.getByRole("button", { name: "Apply filters", exact: true })]) };
}
async function invoiceCase(viewport, invoiceId) {
  await page.setViewportSize(viewport);
  await navigate(dailyInvoiceHref(invoiceId));
  const dialog = page.getByRole("dialog", { name: "Invoice details", exact: true });
  await expect(dialog).toBeVisible();
  const documents = dialog.getByRole("group", { name: "Invoice payment and documents", exact: true });
  await expect(documents).toBeVisible();
  const pdf = documents.getByRole("link", { name: "Download PDF", exact: true });
  const publish = documents.getByRole("button", { name: "Publish PDF", exact: true });
  const documentControl = await pdf.count() ? pdf : publish;
  const documentKind = await pdf.count() ? "download" : "publish";
  await expect(documentControl).toBeVisible();
  // The daily journey leaves a partial invoice with its balance and receipt intact.
  const payment = documents.getByRole("button", { name: "Record payment", exact: true });
  await expect(payment).toBeVisible();
  await documentControl.focus();
  await page.keyboard.press("Tab");
  await expect(payment).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(documentControl).toBeFocused();
  const layout = await layoutEvidence([documentControl, payment]);
  const openScreenshot = await screenshot(`${stage}-drawer-open`);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  return { invoiceId, state: "issued-partial", documentControl: documentKind,
    groupedActions: true, tabOrder: true, escapeCloses: true, layout, openScreenshot };
}

try {
  save();
  const otherAuthority = sql(polishOtherAuthoritySql(f));
  sql(dailyPolishSeedSql(process.env));
  const initial = readiness();
  assertPolishReadiness(initial, f);
  assert.deepEqual(activationState(), { enabled: false, audits: 0, members: 2, auditActor: null });
  const deliveryBefore = sql(polishDeliverySnapshotSql(f));
  browser = await chromium.launch({ headless: true });
  const adminContext = await login(f.adminEmail, polishPassword);
  await navigate("/settings/access");
  await check("activation-review-cancel", async () => {
    const dialog = await review();
    await dialog.getByRole("button", { name: "Keep contained", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Review staff access", exact: true })).toBeFocused();
    assert.deepEqual(activationState(), { enabled: false, audits: 0, members: 2, auditActor: null });
    return { exactAssignmentsReviewed: true, unchanged: true, focusReturned: true };
  });
  await check("activation-review-escape", async () => {
    const dialog = await review();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Review staff access", exact: true })).toBeFocused();
    assert.deepEqual(activationState(), { enabled: false, audits: 0, members: 2, auditActor: null });
    return { unchanged: true, focusReturned: true };
  });
  await check("activation-stale", async () => {
    const dialog = await review();
    const reviewed = readiness();
    const second = await adminContext.newPage();
    second.setDefaultTimeout(15000);
    try {
      await second.goto(`${base}/settings/branches`, { waitUntil: "domcontentloaded" });
      await second.getByRole("button", { name: "Add branch", exact: true }).click();
      const branch = second.getByRole("dialog", { name: "Add branch", exact: true });
      await branch.getByLabel("Name", { exact: true }).fill(f.secondBranchName);
      await branch.getByLabel("Branch code", { exact: true }).fill("POLISH-SECOND");
      await branch.getByRole("button", { name: "Save", exact: true }).click();
      await expect(branch.getByText("Branch added.", { exact: true })).toBeVisible();
      const changed = readiness();
      assertPolishReadiness(changed, f, { branches: 2 });
      assert.notEqual(changed.impact_fingerprint, reviewed.impact_fingerprint);
      await dialog.getByRole("button", { name: "Confirm enable staff access", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Staff access changed. Review refreshed readiness before activating." })).toBeVisible();
      await expect(dialog).toBeHidden();
      assert.deepEqual(activationState(), { enabled: false, audits: 0, members: 2, auditActor: null });
      await expect(page.getByRole("button", { name: "Review staff access", exact: true })).toBeEnabled();
      return { branchCreatedThroughUI: true, impactChanged: true, consentCleared: true, unchangedActivation: true };
    } finally { await second.close(); }
  });
  await check("activation-confirm", async () => {
    const dialog = await review();
    await dialog.getByRole("button", { name: "Confirm enable staff access", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Staff access", exact: true }).getByText("Enabled", { exact: true })).toBeVisible();
    assert.deepEqual(activationState(), { enabled: true, audits: 1, members: 2, auditActor: f.admin });
    assertPolishReadiness(readiness(), f, { enabled: true, branches: 2 });
    return { activationAudits: 1, actor: f.admin, exactConsent: true };
  });
  await check("activation-reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Staff access", exact: true }).getByText("Enabled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review staff access", exact: true })).toHaveCount(0);
    assert.equal(activationState().audits, 1);
    return { persisted: true, activationAudits: 1 };
  });
  await adminContext.close();
  await login(f.viewerEmail, polishPassword);
  await check("ordinary-settings-denied", async () => {
    await page.goto(`${base}/settings/access`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(url => url.pathname === "/no-access" && url.searchParams.get("reason") === "capability");
    await expect(page.getByRole("button", { name: "Review staff access", exact: true })).toHaveCount(0);
    return { ordinaryWorkspaceEntry: true, settingsDenied: true };
  });
  for (const [name, route, includesInspection] of [
    ["records-financial", "/financial-timeline", false],
    ["records-maintenance", "/maintenance-timeline", true],
  ]) {
    await check(name, async () => {
      await navigate(route);
      const expand = page.getByRole("button", { name: "Expand Records navigation", exact: true });
      if (await expand.count()) await expand.click();
      const nav = page.getByRole("navigation", { name: "Global navigation", exact: true });
      for (const [label, href] of [["Financial timeline", "/financial-timeline"], ["Maintenance timeline", "/maintenance-timeline"]]) {
        const destination = nav.getByRole("link", { name: label, exact: true });
        await expect(destination).toBeVisible();
        assert.equal(await destination.getAttribute("href"), href);
      }
      assert.equal(await nav.locator('a[href="/timeline"],a[href="/property-timeline"]').count(), 0);
      const cost = page.getByRole("region", { name: "Timeline table", exact: true }).getByRole("link", { name: f.costTitle, exact: true });
      await expect(cost).toBeVisible();
      const href = new URL(await cost.getAttribute("href"), base);
      assert.equal(href.pathname, route);
      assert.equal(href.searchParams.get("eventId"), f.costEvent);
      const inspection = page.getByRole("region", { name: "Timeline table", exact: true }).getByRole("link", { name: f.maintenanceTitle, exact: true });
      await expect(inspection).toHaveCount(includesInspection ? 1 : 0);
      await cost.click();
      await expect(page).toHaveURL(url => url.pathname === route && url.searchParams.get("eventId") === f.costEvent);
      await expect(page.getByRole("heading", { name: f.costTitle, exact: true })).toBeVisible();
      return { activeScope: route, eventId: f.costEvent, maintenanceOnlyVisible: includesInspection, noGlobalFallback: true };
    });
  }
  await page.context().close();
  await login(dailyActors.finance.email, "123456789");
  const invoiceId = dailyResult.paymentEvidence?.invoiceId;
  assert.match(invoiceId ?? "", /^[0-9a-f-]{36}$/);
  for (const [name, viewport] of Object.entries(polishViewports)) {
    await check(`reports-${name}`, () => reportCase(viewport));
    await check(`invoice-${name}`, () => invoiceCase(viewport, invoiceId));
  }
  await check("no-email-or-unrelated-authority-change", async () => {
    assert.equal(sql(polishDeliverySnapshotSql(f)), deliveryBefore);
    assert.equal(sql(polishOtherAuthoritySql(f)), otherAuthority);
    assert.deepEqual(activationState(), { enabled: true, audits: 1, members: 2, auditActor: f.admin });
    return { invitationAndDeliveryRowsUnchanged: true, noStepUpGrantsOrPolicyChanges: true, otherOrganizationsAuthorityUnchanged: true };
  });
  assertPolishCompletion(cases);
  save({ complete: true });
} catch (error) {
  const item = cases.find(item => item.name === stage);
  if (item) item.status = "failed";
  save({ failedStage: stage, message: redactPolishEvidence(error.message).slice(0, 1000) });
  await screenshot("failure").catch(() => {});
  throw new Error(`Synthetic polish failed at ${stage}; see sanitized polish evidence.`);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  // The existing runner owns teardown; this stage never stops/removes resources.
}
