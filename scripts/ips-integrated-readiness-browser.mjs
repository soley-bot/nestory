/**
 * Dedicated synthetic local acceptance. Never resets a database or cleans a
 * previous run. Root must hand off its dedicated stack before invocation:
 * IPS_LOCAL_HANDOFF=nestory-ips-readiness-20261014 node scripts/ips-integrated-readiness-browser.mjs
 * Failures and fixtures are retained in ignored output/playwright/ips-readiness-*.
 * --resume <fixture.json> reuses only this runner's synthetic run after diagnosis.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";
import { createFixture, localHarness, quote, rpc, target, verifyResumeState, verifyPdfSummary, verifySheetSummary } from "./ips-integrated-readiness-fixture.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = await localHarness(cwd);
const resumeIndex = process.argv.indexOf("--resume");
const resume = resumeIndex < 0 ? null : path.resolve(process.argv[resumeIndex + 1]);
const attempt = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = resume ? path.join(path.dirname(resume), `resume-${attempt}`) : path.join(cwd, "output/playwright", `ips-readiness-${attempt}`);
assert.ok(output.startsWith(path.join(cwd, "output/playwright") + path.sep), "Evidence must stay inside this worktree");
await mkdir(output, { recursive: true });
const events = [];
let browser, fixture, activePage;
let phase = "prepare";
const saveFixture = async value => writeFile(path.join(output, "fixture.json"), JSON.stringify(value, null, 2));
async function record(name, detail = {}) {
  events.push({ name, at: new Date().toISOString(), ...detail });
  await writeFile(path.join(output, "results.json"), JSON.stringify({ target, phase, events }, null, 2));
  console.log(`PASS ${name}`);
}
async function checkpoint(name, run) {
  phase = name;
  const started = performance.now();
  await run();
  await record(name, { elapsedMs: Math.round(performance.now() - started) });
}
function sqlJson(statement) { return JSON.parse(harness.sql(statement)); }
async function candidate(client) {
  return rpc(client, "get_local_deposit_rent_candidates", { p_organization_id: fixture.ids.org, p_lease_id: fixture.ids.depositLease });
}
async function saveIntent(client, operation) {
  const journal = await rpc(client, "get_deposit_rent_journal", { p_org: fixture.ids.org, p_lease: fixture.ids.depositLease });
  assert.equal(journal?.state, "preview");
  assert.equal(journal.payload.operation, operation);
  fixture.state[operation === "apply" ? "applyIntent" : "reversalIntent"] = journal;
  await saveFixture(fixture);
}
async function reconcileResume(client) {
  const snapshot = await candidate(client);
  const deposit = snapshot.deposits.find(row => row.id === fixture.ids.depositId);
  const invoice = snapshot.invoices.find(row => row.id === fixture.ids.invoiceId);
  const observed = {
    journal: await rpc(client, "get_deposit_rent_journal", { p_org: fixture.ids.org, p_lease: fixture.ids.depositLease }),
    receipts: sqlJson(`SELECT coalesce(json_agg(row_to_json(e)),'[]'::json) FROM (SELECT id,amount FROM public.lease_deposit_events WHERE organization_id=${quote(fixture.ids.org)} AND lease_deposit_id=${quote(fixture.ids.depositId)} AND event_type='received' ORDER BY id) e;`),
    applications: sqlJson(`SELECT coalesce(json_agg(row_to_json(a)),'[]'::json) FROM (SELECT id,amount,reversal_of_application_id FROM public.deposit_rent_applications WHERE organization_id=${quote(fixture.ids.org)} AND lease_deposit_id=${quote(fixture.ids.depositId)} ORDER BY id) a;`),
    held: deposit?.held, outstanding: invoice?.outstanding, custodyCurrent: deposit?.custodyCurrent,
  };
  await writeFile(path.join(output, "resume-observed.json"), JSON.stringify(observed, null, 2));
  verifyResumeState(fixture, observed);
  await record("read-only resume checkpoint reconciliation");
}
async function select(page, scope, label, option) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  const choices = page.getByRole("option");
  if (option) await choices.filter({ hasText: option }).first().click();
  else await page.locator('[role="option"]:not([aria-disabled="true"])').first().click();
}
async function today(page, scope, label) {
  await scope.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
}
async function browserGet(page, url) {
  assert.equal(new URL(url).origin, target.app);
  return page.evaluate(async requestUrl => {
    const response = await fetch(requestUrl, { redirect: "manual" });
    return { status: response.status, url: response.url, contentType: response.headers.get("content-type") };
  }, url);
}
async function withActor(name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  activePage = page;
  const errors = [];
  const authOrigins = new Set();
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/auth/v1/")) authOrigins.add(url.origin);
  });
  // An incorrectly built app must not contact a hosted Supabase service.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith(".supabase.co") || url.pathname.startsWith("/auth/v1/") && url.origin !== target.api) return route.abort("blockedbyclient");
    return route.continue();
  });
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${target.app}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(fixture.actors[name].email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(url => url.pathname !== "/login");
    await page.goto(`${target.app}/workspace`, { waitUntil: "networkidle" });
    await page.waitForURL(url => url.pathname !== "/workspace");
    assert.ok([...authOrigins].every(origin => origin === target.api), "Served app attempted another Auth API");
    // Password login is a Server Action. Verify the actual returned session,
    // rather than assuming a browser-side Auth network call will be present.
    const tokenCookies = (await context.cookies()).filter(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
      .sort((a, b) => Number(a.name.match(/\.(\d+)$/)?.[1] ?? 0) - Number(b.name.match(/\.(\d+)$/)?.[1] ?? 0));
    assert.ok(tokenCookies.length, "Served app did not establish a Supabase session");
    const value = decodeURIComponent(tokenCookies.map(cookie => cookie.value).join(""));
    const session = JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString("utf8") : value);
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
    assert.equal(claims.iss, `${target.api}/auth/v1`, "Served app session issuer must be this dedicated local API");
    await harness.verifySessionToken(session.access_token, fixture.actors[name].id);
    // Start after sign-in so the trace does not include the password form.
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await run(page);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name}-${phase}-failure.png`), fullPage: true }).catch(() => {});
    await writeFile(path.join(output, `${name}-${phase}-failure.txt`), await page.locator("body").innerText().catch(() => "Page unavailable"));
    throw error;
  } finally {
    await writeFile(path.join(output, `${name}-page-errors.json`), JSON.stringify(errors, null, 2));
    await context.tracing.stop({ path: path.join(output, `${name}-${Date.now()}-trace.zip`) }).catch(() => {});
    await context.close();
    activePage = null;
  }
}
async function depositPanel(page) {
  await page.goto(`${target.app}/leases/${fixture.ids.depositLease}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Rent & deposit", exact: true }).click();
  await page.getByRole("button", { name: "Manage deposit", exact: true }).click();
  await page.getByRole("button", { name: "Use deposit for rent", exact: true }).waitFor();
}
async function openApply(page) {
  await depositPanel(page);
  await page.getByRole("button", { name: "Use deposit for rent", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Use deposit for rent", exact: true });
  await dialog.getByRole("combobox", { name: "Action", exact: true }).waitFor();
  return dialog;
}
async function prepareApply(page, dialog) {
  await select(page, dialog, "Deposit");
  const invoiceNumber = harness.sql(`SELECT invoice_number FROM public.tenant_invoices WHERE id=${quote(fixture.ids.invoiceId)} AND organization_id=${quote(fixture.ids.org)};`);
  await select(page, dialog, "Invoice", invoiceNumber);
  await select(page, dialog, "Rent line");
  await dialog.getByLabel("Amount (USD)", { exact: true }).fill("100.00");
  await today(page, dialog, "Application date");
  await dialog.getByLabel("Reason", { exact: true }).fill("Synthetic interrupted application acceptance");
  await dialog.getByRole("button", { name: "Preview changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm deposit application", exact: true }).waitFor();
  assert.match(await dialog.innerText(), /USD 500\.00/);
}
async function balances(client, held, due, count) {
  const snapshot = await candidate(client);
  assert.equal(snapshot.deposits.find(row => row.id === fixture.ids.depositId)?.held, held);
  assert.equal(snapshot.invoices.find(row => row.id === fixture.ids.invoiceId)?.outstanding, due);
  const actual = sqlJson(`SELECT json_build_object('applications',count(*),'sum',coalesce(sum(CASE WHEN reversal_of_application_id IS NULL THEN amount ELSE -amount END),0)) FROM public.deposit_rent_applications WHERE organization_id=${quote(fixture.ids.org)} AND lease_deposit_id=${quote(fixture.ids.depositId)};`);
  assert.equal(actual.applications, count);
  assert.equal(Number(actual.sum), 600 - Number(held));
  assert.equal(harness.sql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=${quote(fixture.ids.org)} AND invoice_id=${quote(fixture.ids.invoiceId)};`), "0", "Deposit settlement must not invent a bank receipt");
  return snapshot;
}
async function ownerFinancialSnapshot(client, stage) {
  const common = { p_organization_id: fixture.ids.org, p_property_id: fixture.ids.property, p_currency: "USD", p_period_start: fixture.monthStart, p_period_end: fixture.monthEnd, p_page_size: 500 };
  async function completeEvents(name, dateField) {
    const rows = [], seen = new Set(); let cursor;
    while (true) {
      const page = await rpc(client, name, { ...common,
        ...(name === "get_owner_profit_loss_events_page" ? { p_period_start: fixture.previousMonth } : {}),
        [`p_after_${dateField}`]: cursor?.[`cursor_${dateField}`] ?? null,
        p_after_source_type: cursor?.cursor_source_type ?? null, p_after_source_id: cursor?.cursor_source_id ?? null,
      });
      assert.ok(Array.isArray(page) && page.length <= 500);
      if (!page.length) return rows;
      for (const row of page) {
        assert.equal(row.organization_id, fixture.ids.org); assert.equal(row.property_id, fixture.ids.property);
        assert.ok(!seen.has(row.event_key), "Duplicate financial event"); seen.add(row.event_key); rows.push(row);
      }
      assert.ok(rows.length < 10_000, "Unexpected financial snapshot size");
      cursor = page.at(-1);
    }
  }
  const pnl = await completeEvents("get_owner_profit_loss_events_page", "recognized_on");
  assert.ok(pnl.some(row => row.source_type === "tenant_invoice_line" && row.source_parent_id === fixture.ids.invoiceId), "P&L evidence must include the real rent invoice being settled");
  const cash = await completeEvents("get_property_cash_events_page", "event_date");
  const owner = await rpc(client, "get_owner_balance_source_ledger", {
    p_organization_id: fixture.ids.org, p_property_id: fixture.ids.property, p_owner_person_id: fixture.ids.owner,
    p_currency: "USD", p_period_start: fixture.monthStart, p_period_end: fixture.monthStart,
  });
  assert.ok(owner.length < 1000, "Unexpected owner ledger cap in tiny fixture");
  const cents = value => Math.round(Number(value ?? 0) * 100);
  const cashTotals = Object.fromEntries(["amount", "deposit_liability_effect", "operating_cash_effect", "owner_cash_effect"].map(key => [key, cash.reduce((sum, row) => sum + cents(row[key]), 0)]));
  assert.ok(cash.every(row => row.resolution_state === "resolved"), "Unresolved cash evidence");
  const ownerTotals = Object.fromEntries(["security_deposit_custody", "ips_held_owner_cash", "owner_due_to_ips", "ips_due_to_owner"].map(component => [component, owner.filter(row => row.component === component).reduce((sum, row) => sum + cents(row.signed_amount), 0)]));
  const pnlFacts = pnl.map(row => ({ key: row.event_key, amount: cents(row.signed_amount), economicClass: row.economic_class })).sort((a, b) => a.key.localeCompare(b.key));
  const evidence = { stage, pnl, cash, owner, cashTotals, ownerTotals, pnlFacts,
    limitation: "Live scoped public read authorities. This is not an official published Owner Statement and does not prove owner-close/publication or official artifact downloads." };
  await writeFile(path.join(output, `owner-financial-${stage}.json`), JSON.stringify(evidence, null, 2));
  if (stage === "before-apply") {
    fixture.state.ownerBaseline = { cashTotals, ownerTotals, pnlFacts };
    await saveFixture(fixture);
  } else {
    const baseline = fixture.state.ownerBaseline;
    assert.ok(baseline, "Before-application financial evidence is required");
    assert.deepEqual(pnlFacts, baseline.pnlFacts, "Settling rent must not recognize invoice income twice");
    for (const key of ["amount", "operating_cash_effect", "owner_cash_effect"]) assert.equal(cashTotals[key], baseline.cashTotals[key], `Deposit settlement must not duplicate ${key}`);
    const applicationCents = stage === "after-apply" ? 10_000 : 0;
    assert.equal(cashTotals.deposit_liability_effect, baseline.cashTotals.deposit_liability_effect - applicationCents);
    assert.equal(ownerTotals.security_deposit_custody, baseline.ownerTotals.security_deposit_custody - applicationCents);
    assert.equal(ownerTotals.ips_held_owner_cash, baseline.ownerTotals.ips_held_owner_cash + applicationCents);
    const movements = owner.filter(row => row.source_type === "deposit_rent_application");
    assert.equal(movements.length, stage === "after-apply" ? 2 : 4);
    assert.ok(movements.every(row => row.source_fingerprint && row.ownership_roster_hash && Number(row.ownership_percent_snapshot) === 100));
    if (stage === "after-reversal") assert.equal(movements.filter(row => row.reversal_of_movement_id).length, 2);
  }
  await record(`scoped P&L, cash and owner lineage ${stage}`, { cashTotals, ownerTotals, pnlIncomeCents: pnlFacts.filter(row => row.economicClass === "owner_income").reduce((sum, row) => sum + row.amount, 0), officialStatementPublished: false });
}
async function exportReports(page, suffix, expectedAmount) {
  await page.goto(`${target.app}/reports/deposit-rent?propertyId=${fixture.ids.property}&month=${fixture.month}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Deposit rent settlements", exact: true }).waitFor();
  const summary = page.locator("dl > div").filter({ has: page.locator("dt").filter({ hasText: /^Rent settled from deposits$/ }) });
  assert.equal((await summary.locator("dd").innerText()).trim(), `USD ${expectedAmount}`, "UI summary total mismatch");
  const exports = [];
  let pdfHref;
  for (const [format, label] of [["pdf", "Download PDF"], ["xlsx", "Download Excel"]]) {
    const href = await page.getByRole("link", { name: label, exact: true }).getAttribute("href");
    const downloadUrl = new URL(href, target.app).href;
    assert.equal(new URL(downloadUrl).origin, target.app);
    if (format === "pdf") pdfHref = downloadUrl;
    const [response, download] = await Promise.all([
      page.waitForResponse(response => response.url() === downloadUrl && response.request().method() === "GET"),
      page.waitForEvent("download"),
      page.getByRole("link", { name: label, exact: true }).click(),
    ]);
    assert.equal(response.status(), 200, `Download returned ${response.status()} at ${response.url()}`);
    assert.equal(await download.failure(), null);
    const filename = `deposit-${suffix}.${format}`;
    await download.saveAs(path.join(output, filename));
    const bytes = await readFile(path.join(output, filename));
    assert.ok(bytes.length > 500);
    const cacheDirectives = new Set((response.headers()["cache-control"] ?? "").split(",").map(value => value.trim().toLowerCase()));
    assert.ok(cacheDirectives.has("private") && cacheDirectives.has("no-store") && !cacheDirectives.has("public"), "Financial export must remain private and non-storable");
    assert.equal(response.headers()["x-nestory-report-scope"], "deposit-rent-only");
    if (format === "pdf") {
      verifyPdfSummary(bytes, expectedAmount);
    }
    else {
      const entries = unzipSync(bytes);
      assert.ok(entries["xl/workbook.xml"]);
      assert.ok(entries["xl/worksheets/sheet1.xml"]);
      verifySheetSummary(strFromU8(entries["xl/worksheets/sheet1.xml"]), expectedAmount);
    }
    exports.push({ filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  await page.screenshot({ path: path.join(output, `report-${suffix}.png`), fullPage: true });
  await record(`real report downloads ${suffix}`, { exports });
  return pdfHref;
}

try {
  fixture = resume ? JSON.parse(await readFile(resume, "utf8")) : await createFixture(harness, saveFixture);
  assert.ok(fixture.runId && fixture.ids.org && fixture.ids.depositLease && fixture.state.setupComplete, "Incomplete synthetic fixture; diagnose before resume");
  assert.equal(harness.sql(`SELECT slug FROM public.organizations WHERE id=${quote(fixture.ids.org)};`), `ips-${fixture.runId}`, "Resume may only use this runner's owned synthetic company");
  assert.equal(harness.sql(`SELECT slug FROM public.organizations WHERE id=${quote(fixture.ids.foreignOrg)};`), `foreign-${fixture.runId}`);
  await record("real Auth and isolated synthetic fixture", { runId: fixture.runId, organizationId: fixture.ids.org, stepUpEnforcement: fixture.stepUpEnforcement, note: "Existing step-up policy is observed without alteration. Volume obligations are seeded, financial activity uses public authenticated commands." });
  const operator = await harness.actor(fixture.actors.operator.email, fixture.password);
  if (resume) await reconcileResume(operator);
  await checkpoint("all rent pages reconcile", async () => {
    const expected = sqlJson(`SELECT json_build_object('count',count(*),'outstanding',sum(balance_due),'collected',sum(paid_through_ips+collected_by_owner)) FROM public.tenant_invoice_balances WHERE organization_id=${quote(fixture.ids.org)} AND property_id=${quote(fixture.ids.volumeProperty)};`);
    assert.equal(expected.count, 1005);
    assert.equal(Number(expected.outstanding), 10060.05);
    const seen = new Set(); let outstandingCents = 0;
    const timings = [];
    for (let page = 1; page <= 21; page++) {
      const start = performance.now();
      const result = await rpc(operator, "get_rent_invoice_page", { p_organization_id: fixture.ids.org, p_property_id: fixture.ids.volumeProperty, p_page: page });
      timings.push(Math.round(performance.now() - start));
      assert.equal(result.pagination.totalCount, 1005);
      assert.equal(result.pagination.totalPages, 21);
      assert.equal(result.invoices.length, page === 21 ? 5 : 50);
      assert.equal(Number(result.totalsByCurrency[0].outstanding), Number(expected.outstanding));
      assert.equal(Number(result.totalsByCurrency[0].collected), 0);
      for (const row of result.invoices) {
        assert.equal(row.organization_id, fixture.ids.org);
        assert.equal(row.property_id, fixture.ids.volumeProperty);
        assert.ok(!seen.has(row.id), "Duplicate invoice across pages");
        seen.add(row.id); outstandingCents += Math.round(Number(row.balance_due) * 100);
      }
    }
    assert.equal(seen.size, expected.count);
    assert.equal(outstandingCents, Math.round(Number(expected.outstanding) * 100));
    const filtered = await rpc(operator, "get_rent_invoice_page", { p_organization_id: fixture.ids.org, p_property_id: fixture.ids.volumeProperty, p_query: "SYN-PAGE-1004" });
    assert.equal(filtered.pagination.totalCount, 1);
    assert.equal(filtered.invoices[0].invoice_number, "SYN-PAGE-1004");
    assert.equal(Number(filtered.totalsByCurrency[0].outstanding), 10.01);
    await record("real local API pagination measurements", { pageRequests: 21, pageRows: seen.size, filterRequests: 1, filterRows: 1, timingsMs: timings, scope: "Local synthetic database; not hosted IPS latency" });
  });
  browser = await chromium.launch({ headless: true });
  await withActor("operator", async page => {
    await checkpoint("bounded rent UI first and final pages", async () => {
      await page.goto(`${target.app}/rent-income?property=${fixture.ids.volumeProperty}`, { waitUntil: "networkidle" });
      const rows = page.locator('[data-slot="rent-invoices-surface"] tbody tr');
      assert.equal(await rows.count(), 50);
      await page.getByText("Page 1 of 21", { exact: true }).waitFor();
      assert.match(await page.locator("main").innerText(), /10,060\.05/);
      await page.goto(`${target.app}/rent-income?property=${fixture.ids.volumeProperty}&page=21`, { waitUntil: "networkidle" });
      assert.equal(await rows.count(), 5);
      await page.getByText("Page 21 of 21", { exact: true }).waitFor();
      assert.match(await page.locator("main").innerText(), /10,060\.05/);
      await page.screenshot({ path: path.join(output, "rent-page-21.png"), fullPage: true });
    });
    if (!fixture.state.received) await checkpoint("deposit receipt through UI", async () => {
      await depositPanel(page);
      await select(page, page, "Deposit activity", "Deposit received");
      await page.locator('input[name="amount"]').fill("600.00");
      await page.locator('input[name="reference"]').fill(`Synthetic receipt ${fixture.runId}`);
      await page.getByRole("button", { name: "Save deposit activity", exact: true }).click();
      await page.getByText("Deposit activity saved.", { exact: true }).waitFor();
      fixture.state.received = true; await saveFixture(fixture);
      const eventId = harness.sql(`SELECT id FROM public.lease_deposit_events WHERE organization_id=${quote(fixture.ids.org)} AND lease_deposit_id=${quote(fixture.ids.depositId)} AND event_type='received';`);
      assert.match(eventId, /^[0-9a-f-]{36}$/);
      fixture.ids.receiptEvent = eventId; await saveFixture(fixture);
    });
    if (!fixture.state.allocated) await checkpoint("receipt allocated through public authority", async () => {
      await rpc(operator, "allocate_owner_event", { p_organization_id: fixture.ids.org, p_source_type: "security_deposit_receipt", p_source_line_id: fixture.ids.receiptEvent, p_idempotency_key: `readiness-${fixture.runId}-allocate` });
      fixture.state.allocated = true; await saveFixture(fixture);
    });
    if (!fixture.state.custody) await checkpoint("custody confirmation through UI", async () => {
      await depositPanel(page);
      await page.getByRole("button", { name: "Confirm deposit custody", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Confirm deposit custody", exact: true });
      await select(page, dialog, "Deposit to verify");
      await select(page, dialog, "Deposit custodian", "IPS holds the deposit");
      await select(page, dialog, "Custody liability account", "Security deposits");
      await today(page, dialog, "Custody verification date");
      await dialog.getByLabel("Verified deposit held", { exact: true }).fill("600.00");
      await dialog.getByLabel("Custody evidence reference", { exact: true }).fill(`Synthetic evidence ${fixture.runId}`);
      await dialog.getByRole("button", { name: "Confirm existing deposit custody", exact: true }).click();
      await page.getByText("Deposit custody confirmed.", { exact: true }).waitFor();
      const snapshot = await candidate(operator);
      assert.equal(snapshot.deposits[0].custodyCurrent, true);
      assert.equal(snapshot.deposits[0].custodyReconciles, true);
      fixture.state.custody = true; await saveFixture(fixture);
    });
    if (!fixture.state.applied) await checkpoint("lost committed response and original retry", async () => {
      await ownerFinancialSnapshot(operator, "before-apply");
      const dialog = await openApply(page);
      await prepareApply(page, dialog);
      await saveIntent(operator, "apply");
      let intercepted = false;
      await page.route("**/*", async route => {
        if (!intercepted && new URL(route.request().url()).origin === target.app && route.request().method() === "POST" && route.request().headers()["next-action"]) {
          intercepted = true;
          const response = await route.fetch();
          assert.equal(response.status(), 200, "Server action response failed before interruption");
          await route.abort("failed");
        } else await route.fallback();
      });
      await dialog.getByRole("button", { name: "Confirm deposit application", exact: true }).click();
      await dialog.getByRole("button", { name: "Retry original action", exact: true }).waitFor();
      // Retry becomes visible immediately; await the actual aborted request too.
      await dialog.getByText(/original action is unconfirmed/i).waitFor();
      await page.unroute("**/*");
      assert.equal(intercepted, true);
      await balances(operator, "500.00", "500.00", 1);
      await ownerFinancialSnapshot(operator, "after-apply");
      const journal = await rpc(operator, "get_deposit_rent_journal", { p_org: fixture.ids.org, p_lease: fixture.ids.depositLease });
      assert.equal(journal.state, "resolved");
      await writeFile(path.join(output, "lost-response-resolved-journal.json"), JSON.stringify(journal, null, 2));
      await dialog.getByRole("button", { name: "Retry original action", exact: true }).dblclick({ delay: 10 });
      await page.getByText(journal.result.message, { exact: true }).waitFor();
      await balances(operator, "500.00", "500.00", 1);
      fixture.state.applied = true; await saveFixture(fixture);
    });
    if (!fixture.state.reversed) {
      await checkpoint("applied report PDF and Excel", async () => {
        fixture.state.appliedReportUrl = await exportReports(page, "applied", "100.00");
        await saveFixture(fixture);
      });
      await checkpoint("reopen resolved journal and reverse through UI", async () => {
        const dialog = await openApply(page);
        await select(page, dialog, "Action", "Reverse a full application");
        await select(page, dialog, "Original application");
        await today(page, dialog, "Reversal date");
        await dialog.getByLabel("Reason", { exact: true }).fill("Synthetic full reversal acceptance");
        await dialog.getByRole("button", { name: "Preview changes", exact: true }).click();
        await dialog.getByRole("button", { name: "Confirm full reversal", exact: true }).waitFor();
        await saveIntent(operator, "reverse");
        await dialog.getByRole("button", { name: "Confirm full reversal", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await balances(operator, "600.00", "600.00", 2);
        await ownerFinancialSnapshot(operator, "after-reversal");
        fixture.state.reversed = true; await saveFixture(fixture);
      });
    }
    if (fixture.state.appliedReportUrl) await checkpoint("stale report fingerprint fails closed after reversal", async () => {
      const stale = await browserGet(page, fixture.state.appliedReportUrl);
      assert.equal(stale.status, 409);
      assert.doesNotMatch(stale.contentType ?? "", /application\/pdf/);
    });
    await checkpoint("reversed report PDF and Excel", () => exportReports(page, "reversed", "0.00"));
    await checkpoint("repeated original command returns same result", async () => {
      const journal = await rpc(operator, "get_deposit_rent_journal", { p_org: fixture.ids.org, p_lease: fixture.ids.depositLease });
      assert.equal(journal.state, "resolved");
      const replay = await rpc(operator, "execute_deposit_rent_journal", { p_org: fixture.ids.org, p_lease: fixture.ids.depositLease, p_token: journal.token, p_key: journal.idempotencyKey, p_payload_hash: journal.payloadHash });
      assert.equal(replay.result.commandId, journal.result.commandId);
      await balances(operator, "600.00", "600.00", 2);
    });
  });
  await checkpoint("real limited-role and foreign API denial", async () => {
    for (const name of ["reader", "leaseOnly", "otherBranch", "foreign"]) {
      const client = await harness.actor(fixture.actors[name].email, fixture.password);
      const denied = await client.rpc("confirm_deposit_rent_custody", { p_org: fixture.ids.org, p_deposit: fixture.ids.depositId,
        p_liability_account: fixture.ids.liabilityAccount, p_custodian: "ips", p_owner: null,
        p_date: fixture.today, p_expected_held: 600, p_evidence: "Synthetic unauthorized evidence", p_key: `deny-${fixture.runId}-${name}` });
      assert.ok(denied.error, `${name} must not confirm custody`);
      assert.equal(denied.error.code, "42501", `${name}: ${denied.error.message}`);
      if (name !== "reader") {
        const read = await client.rpc("get_local_deposit_rent_candidates", { p_organization_id: fixture.ids.org, p_lease_id: fixture.ids.depositLease });
        assert.equal(read.error?.code, "42501", `${name} must not read deposit candidates`);
      }
      if (name === "otherBranch" || name === "foreign") {
        const read = await client.rpc("get_rent_invoice_page", { p_organization_id: fixture.ids.org, p_property_id: fixture.ids.volumeProperty });
        assert.equal(read.error?.code, "42501", `${name} must not read scoped rent`);
      }
      await record(`${name} authenticated public API denial`);
    }
    await balances(operator, "600.00", "600.00", 2);
  });
  for (const name of ["reader", "leaseOnly", "otherBranch", "foreign"]) await withActor(name, async page => {
    await checkpoint(`${name} UI and report access`, async () => {
      await page.goto(`${target.app}/leases/${fixture.ids.depositLease}`, { waitUntil: "networkidle" });
      const depositButton = page.getByRole("button", { name: /^(View|Manage) deposit$/ });
      if (name === "reader" || name === "leaseOnly") {
        await page.getByRole("link", { name: "Rent & deposit", exact: true }).click();
        if (name === "reader") await depositButton.click();
        else assert.equal(await depositButton.count(), 0, "Lease-only access must not expose deposit activity");
      }
      else assert.equal(await depositButton.count(), 0);
      assert.equal(await page.getByRole("button", { name: "Use deposit for rent", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Confirm deposit custody", exact: true }).count(), 0);
      const response = await browserGet(page, `${target.app}/api/reports/deposit-rent?propertyId=${fixture.ids.property}&from=${fixture.monthStart}&to=${fixture.monthEnd}&format=pdf`);
      assert.equal(response.status, name === "reader" ? 200 : 403);
      if (name !== "reader") assert.doesNotMatch(response.contentType ?? "", /application\/pdf/);
      await page.screenshot({ path: path.join(output, `${name}-access.png`), fullPage: true });
    });
  });
  phase = "complete";
  await record("integrated bounded synthetic acceptance complete");
} catch (error) {
  events.push({ name: phase, status: "failed", message: error.message, stack: error.stack });
  await writeFile(path.join(output, "results.json"), JSON.stringify({ target, phase, events }, null, 2));
  if (activePage) await activePage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  console.error(`FAILED ${phase}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  console.log(`Evidence: ${path.relative(cwd, output)}`);
}
