import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";
import { assertDailyCompletion, assertDailyContainer, assertDailyOrigin, dailyOrigins, resolveDailyRun } from "./daily-workflow-policy.mjs";

const run = resolveDailyRun(process.env);
const root = process.cwd();
const artifactDir = path.join(root, "ci-reports/daily-workflow");
const manifest = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP, run.project, "manifest.json"), "utf8"));
const db = findLocalDatabaseContainer(root);
assert.equal(db, `supabase_db_${run.project}`);
assertDailyContainer(JSON.parse(execFileSync("docker", ["inspect", db], { encoding: "utf8" }))[0], run.project, manifest.createdAt);
const base = assertDailyOrigin(process.env.NESTORY_BASE_URL, dailyOrigins.app);
const attestation = await fetch(`${base}/api/local-smoke-target`, { signal: AbortSignal.timeout(10000) });
assert.equal(attestation.status, 200);
assertDailyOrigin((await attestation.json()).supabaseOrigin, dailyOrigins.api);

const org = "00000000-0000-0000-0000-000000000001";
const property = "10000000-0000-0000-0000-000000000001";
const unit = "20000000-0000-0000-0000-000000000003";
const owner = "80000000-0000-0000-0000-000000000004";
const tenant = "d1000000-0000-0000-0000-000000000001";
const admin = "00000000-0000-0000-0000-000000000101";
const manager = "00000000-0000-0000-0000-000000000701";
const reference = "DAILY-WORKFLOW-PAYMENT";
const reason = "Synthetic signed single-month rent correction";
const phases = [];
let stage = "setup";
let page;
let context;
let leaseId;
let invoice;
let payment;
let receipt;
const sql = statement => execFileSync("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: statement, encoding: "utf8", timeout: 15000 }).trim();
const json = statement => JSON.parse(sql(statement).split(/\r?\n/).filter(Boolean).at(-1));
const authenticated = (actor, statement) => sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated; ${statement} COMMIT;`);
const dates = json(`BEGIN; SELECT set_config('request.jwt.claim.sub','${admin}',true); SELECT json_build_object('month', date_trunc('month',public.get_lease_rent_business_date('${org}'))::date::text,'end',(date_trunc('month',public.get_lease_rent_business_date('${org}'))+interval '6 months')::date::text)::text; COMMIT;`);
const oldStatements = sql(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]')::text FROM public.owner_statement_artifacts a;`);
const originalMemberships = sql(`SELECT jsonb_agg(to_jsonb(m) ORDER BY m.user_id)::text FROM public.organization_members m;`);

// Only new nonfinancial identities are seeded here. All lease/payment/correction
// submissions below go through visible UI. The fixture is never reset mid-journey.
assert.equal(sql(`SELECT count(*) FROM public.current_leases WHERE unit_id='${unit}' AND status IN ('active','draft','notice_given');`), "0");
sql(`BEGIN;
INSERT INTO public.people(id,organization_id,display_name,party_type,created_by,updated_by) VALUES('${tenant}','${org}','Daily Workflow Tenant','individual','${admin}','${admin}');
INSERT INTO public.person_roles(organization_id,person_id,role,status,created_by,updated_by) VALUES('${org}','${tenant}','tenant','active','${admin}','${admin}');
COMMIT;`);

const browser = await chromium.launch({ headless: true });
async function login(email) {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    return [dailyOrigins.app, dailyOrigins.api].includes(origin) ? route.continue() : route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(45000);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("123456789");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(url => !["/login", "/no-access"].includes(url.pathname));
}
async function waitSql(statement, expected) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (sql(statement) === expected) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`Database effect not observed during ${stage}`);
}
async function passed(name, evidence) {
  phases.push({ name, passed: true, evidence });
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
  fs.writeFileSync(path.join(artifactDir, "result.json"), JSON.stringify({ sha: run.sha, phases, complete: false }, null, 2));
  console.log(`PASS ${name}`);
}
async function select(scope, name, option) {
  await scope.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}
async function invoiceDetails() {
  await page.goto(`${base}/rent-income?q=A-03`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: `View invoice ${invoice.invoice_number}`, exact: true }).click();
}
async function download(href, metadata) {
  const url = new URL(href, base); assert.equal(url.origin, base);
  const response = await page.request.get(url.href); assert.equal(response.status(), 200);
  const bytes = await response.body();
  assert.equal(bytes.length, Number(metadata.size_bytes));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256);
  return metadata.sha256;
}

try {
  stage = "move-in";
  // The released fixture grants lease preparation/activation to Finance Manager;
  // do not add these permissions to Operations Manager or alter any membership.
  await login("finance.manager@nestory.com");
  await page.goto(`${base}/properties/setup?step=3&ownerId=${owner}&propertyId=${property}&unitId=${unit}&tenantId=${tenant}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create new lease", exact: true }).click();
  const form = page.getByRole("form", { name: "Add lease form" });
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await setHiddenControlValue(form, "leaseStartDate", dates.month);
  await setHiddenControlValue(form, "leaseEndDate", dates.end);
  await select(form, "Move-in status", "Tenant moved in on the lease start date");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Monthly rent", { exact: true }).fill("120");
  await form.getByLabel("Due each month on", { exact: true }).fill("1");
  await form.getByLabel("Deposit required", { exact: true }).fill("0");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByRole("button", { name: "Change billing setup", exact: true }).click();
  await select(form, "Who collects rent?", /^Collected by (?!owner$)/);
  await select(form, "Management fee", "Percentage");
  await form.getByLabel("Fee percentage", { exact: true }).fill("8");
  await form.getByRole("button", { name: "Save tenant and lease", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.current_leases WHERE unit_id='${unit}' AND primary_tenant_person_id='${tenant}' AND status='active';`, "1");
  leaseId = sql(`SELECT id FROM public.current_leases WHERE unit_id='${unit}' AND primary_tenant_person_id='${tenant}' AND status='active';`);
  assert.match(leaseId, /^[a-f0-9-]{36}$/);
  assert.equal(sql(`SELECT count(*) FROM public.lease_occupancies WHERE lease_id='${leaseId}' AND actual_move_in_date='${dates.month}' AND actual_move_in_confidence='confirmed' AND business_lifecycle='occupied';`), "1");
  await page.goto(`${base}/leases/${leaseId}?section=occupancy`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Move-in & move-out", exact: true }).waitFor();
  await passed(stage, { leaseId, property, unit, month: dates.month, deposit: 0 });

  stage = "payment";
  await login("finance.manager@nestory.com");
  await page.goto(`${base}/finance?view=transactions`, { waitUntil: "domcontentloaded" });
  if (sql(`SELECT count(*) FROM public.tenant_invoices WHERE lease_id='${leaseId}' AND billing_period_start='${dates.month}';`) === "0") {
    await page.getByRole("button", { name: /Retry rent for .*A-03/ }).click();
  }
  await waitSql(`SELECT count(*) FROM public.tenant_invoices WHERE lease_id='${leaseId}' AND billing_period_start='${dates.month}';`, "1");
  invoice = json(`SELECT to_jsonb(i)::text FROM public.tenant_invoices i WHERE lease_id='${leaseId}' AND billing_period_start='${dates.month}';`);
  const terms = sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.lease_terms t WHERE lease_id='${leaseId}';`);
  const invoiceBefore = sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by')::text FROM public.tenant_invoices i WHERE id='${invoice.id}';`);
  await page.goto(`${base}/rent-income?q=A-03`, { waitUntil: "domcontentloaded" });
  const row = page.getByRole("row").filter({ hasText: "A-03" });
  await row.getByRole("button", { name: "Record payment", exact: true }).click();
  const paymentDialog = page.getByRole("dialog", { name: "Record payment", exact: true });
  await paymentDialog.getByLabel("Amount", { exact: true }).fill("40");
  await paymentDialog.getByRole("combobox", { name: "Received into", exact: true }).click();
  await page.getByRole("option").first().click();
  await paymentDialog.locator('input[name="reference"]').fill(reference);
  await paymentDialog.getByRole("button", { name: "Record payment", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE reference='${reference}';`, "1");
  payment = json(`SELECT to_jsonb(p)::text FROM public.tenant_invoice_payments p WHERE reference='${reference}';`);
  assert.equal(payment.created_by, manager); assert.equal(Number(payment.amount), 40);
  assert.equal(sql(`SELECT balance_due FROM public.tenant_invoice_balances WHERE id='${invoice.id}';`), "80.00");
  await page.getByRole("link", { name: "Download receipt", exact: true }).waitFor();
  const receiptHref = await page.getByRole("link", { name: "Download receipt", exact: true }).getAttribute("href");
  receipt = json(`SELECT to_jsonb(a)::text FROM public.tenant_commercial_document_artifacts a WHERE source_kind='receipt' AND source_id='${payment.id}' AND publication_status='published';`);
  const receiptHash = await download(receiptHref, receipt);
  await passed(stage, { paymentId: payment.id, invoiceId: invoice.id, amount: 40, balance: 80 });

  stage = "monthly-correction";
  await invoiceDetails();
  await page.getByRole("link", { name: "Edit this month's rent", exact: true }).click();
  const correction = page.getByRole("dialog", { name: "Edit this month's rent", exact: true });
  await correction.getByLabel("Corrected rent amount", { exact: true }).fill("100");
  await correction.getByRole("button", { name: "Preview correction", exact: true }).click();
  assert.equal(await correction.getByRole("button", { name: "Save this month's rent", exact: true }).count(), 0, "Reason is required");
  await correction.getByLabel("Reason", { exact: true }).fill(reason);
  await correction.getByRole("button", { name: "Preview correction", exact: true }).click();
  const preview = correction.getByRole("region", { name: "Correction preview" });
  await preview.getByText("Rent balance after edit", { exact: true }).waitFor();
  await preview.getByText("60.00", { exact: true }).waitFor();
  await preview.getByText("40.00", { exact: true }).waitFor();
  await correction.getByLabel("Corrected rent amount", { exact: true }).fill("101");
  await correction.getByText("The inputs changed after preview. Preview again before applying.", { exact: true }).waitFor();
  assert.equal(await correction.getByRole("button", { name: "Save this month's rent", exact: true }).count(), 0, "Changed input invalidates preview");
  await correction.getByLabel("Corrected rent amount", { exact: true }).fill("100");
  await correction.getByRole("button", { name: "Preview correction", exact: true }).click();
  await preview.getByText("60.00", { exact: true }).waitFor();
  await correction.getByRole("button", { name: "Save this month's rent", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.tenant_invoice_corrections WHERE tenant_invoice_id='${invoice.id}' AND reason='${reason}' AND created_by='${manager}';`, "1");
  assert.equal(sql(`SELECT balance_due FROM public.tenant_invoice_balances WHERE id='${invoice.id}';`), "60.00");
  assert.deepEqual(json(`SELECT to_jsonb(p)::text FROM public.tenant_invoice_payments p WHERE id='${payment.id}';`), payment);
  assert.equal(sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.lease_terms t WHERE lease_id='${leaseId}';`), terms);
  assert.equal(sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by')::text FROM public.tenant_invoices i WHERE id='${invoice.id}';`), invoiceBefore);
  await passed(stage, { reason, correctedRent: 100, balance: 60, paymentRetained: true, futureTermsUnchanged: true });

  stage = "receipt";
  await invoiceDetails();
  const retainedReceipt = page.locator(`a[href="${receiptHref}"]`);
  await retainedReceipt.first().waitFor();
  assert.equal(await download(await retainedReceipt.first().getAttribute("href"), receipt), receiptHash);
  assert.deepEqual(json(`SELECT to_jsonb(a)::text FROM public.tenant_commercial_document_artifacts a WHERE id='${receipt.id}';`), receipt);
  await passed(stage, { artifactId: receipt.id, sha256: receiptHash, originalReceiptUnchanged: true });

  // UI denial is bounded to the deployed Finance Member capability. Broader
  // cross-property/closed/stale/duplicate guards run in the focused pgTAP files.
  await login("finance.member@nestory.com");
  await page.goto(`${base}/leases/${leaseId}?action=edit-current-rent&invoiceId=${invoice.id}&section=rent`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByRole("button", { name: "Preview correction", exact: true }).count(), 0);

  stage = "owner-statement";
  const allocation = sql(`SELECT id FROM public.tenant_invoice_payment_allocations WHERE payment_id='${payment.id}';`);
  assert.match(allocation, /^[a-f0-9-]{36}$/);
  // These are the existing checked allocation/period commands also used by the
  // rent-browser acceptance helper, not direct ledger writes or a UI fallback.
  authenticated(manager, `SELECT public.allocate_owner_event('${org}','tenant_rent_receipt','${allocation}','daily-owner-allocation'); SELECT public.generate_owner_balance_period('${org}','${property}','${owner}','USD','${dates.month}','daily-owner-period');`);
  authenticated(admin, `SELECT public.set_financial_month_lock('${org}','${dates.month}',true,'Synthetic daily owner close'); SELECT public.review_owner_opening_balance(organization_id,id,'reject','Resolve pending synthetic opening before close','daily-opening-review') FROM public.owner_opening_balance_requests WHERE organization_id='${org}' AND property_id='${property}' AND owner_person_id='${owner}' AND status='submitted';`);
  await login("nestory@gmail.com");
  await page.goto(`${base}/balances`, { waitUntil: "domcontentloaded" });
  const balanceForm = page.getByRole("button", { name: "Load balances", exact: true }).locator("xpath=ancestor::form");
  await setHiddenControlValue(balanceForm, "propertyId", property);
  await setHiddenControlValue(balanceForm, "ownerPersonId", owner);
  await balanceForm.getByLabel("Month", { exact: true }).fill(dates.month.slice(0,7));
  await balanceForm.getByRole("button", { name: "Load balances", exact: true }).click();
  const closeForm = page.getByRole("button", { name: "Close owner month", exact: true }).locator("xpath=ancestor::form");
  await closeForm.getByLabel("Close reason", { exact: true }).fill("Synthetic daily workflow statement proof");
  await closeForm.getByRole("button", { name: "Close owner month", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.owner_close_revisions r JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}' AND r.status='closed';`, "1");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Ready to publish the owner statement", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Publish owner statement", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.owner_statement_publications p JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`, "1");
  await waitSql(`SELECT count(*) FROM public.owner_statement_artifacts a JOIN public.owner_statement_publications p ON p.id=a.publication_id JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`, "2");
  const publication = json(`SELECT to_jsonb(p)::text FROM public.owner_statement_publications p JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`);
  await page.reload({ waitUntil: "domcontentloaded" });
  const card = page.locator("article").filter({ has: page.getByText(publication.statement_number, { exact: true }) });
  for (const [label, format] of [["Download PDF", "pdf"], ["Download Excel", "xlsx"]]) {
    const artifact = json(`SELECT to_jsonb(a)::text FROM public.owner_statement_artifacts a WHERE publication_id='${publication.id}' AND format='${format}';`);
    await download(await card.getByRole("link", { name: label, exact: true }).getAttribute("href"), artifact);
  }
  assert.equal(sql(`SELECT count(*) FROM public.owner_close_line_sources WHERE owner_close_revision_id='${publication.owner_close_revision_id}' AND source_type='tenant_rent_receipt' AND source_line_id='${allocation}';`), "1");
  assert.equal(sql(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]')::text FROM public.owner_statement_artifacts a WHERE publication_id<>'${publication.id}';`), oldStatements);
  assert.equal(sql(`SELECT jsonb_agg(to_jsonb(m) ORDER BY m.user_id)::text FROM public.organization_members m;`), originalMemberships);
  await passed(stage, { publicationId: publication.id, retainedPaymentIncludedOnce: true, priorArtifactsUnchanged: true, membershipsUnchanged: true });
  assertDailyCompletion(phases);
  fs.writeFileSync(path.join(artifactDir, "result.json"), JSON.stringify({ sha: run.sha, phases, complete: true }, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(artifactDir, "result.json"), JSON.stringify({ sha: run.sha, phases, complete: false, failedStage: stage, message: error.message.slice(0,1500) }, null, 2));
  throw new Error(`Daily workflow failed at ${stage}; see synthetic evidence.`);
} finally { await browser.close(); }
