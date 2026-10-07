import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";
import { assertDailyCompletion, assertDailyContainer, assertDailyOrigin, dailyOrigins, resolveDailyRun } from "./daily-workflow-policy.mjs";
import { dailyActors, dailyFixture, dailyInvoiceHref, dailyOwnerHref, inspectDailyFixture, prepareDailyCorrectionSource, readDailyBusinessDate } from "./daily-workflow-contract.mjs";
import { downloadDailyArtifact } from "./daily-workflow-download.mjs";

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

const { org, branch, property, unit, owner, tenant } = dailyFixture;
const admin = dailyActors.setup.id;
const manager = dailyActors.finance.id;
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
let paymentEvidence;
const sql = statement => execFileSync("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: statement, encoding: "utf8", timeout: 15000 }).trim();
const json = statement => JSON.parse(sql(statement).split(/\r?\n/).filter(Boolean).at(-1));
const authenticated = (actor, statement) => sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${actor}',true); SET LOCAL ROLE authenticated; ${statement} COMMIT;`);
const fixture = inspectDailyFixture(sql);
const { dates } = fixture;
const oldStatements = sql(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]')::text FROM public.owner_statement_artifacts a;`);
const authoritySnapshot = () => sql(`SELECT jsonb_build_object(${["organization_members", "organization_roles", "organization_role_permissions", "organization_authorization_states", "organization_branches"].map(table => `'${table}',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.${table} t)`).join(",")},'propertyBranches',(SELECT jsonb_agg(jsonb_build_array(id,branch_id) ORDER BY id) FROM public.properties))::text;`);
const originalAuthority = authoritySnapshot();

// Only new nonfinancial identities are seeded here. All lease/payment/correction
// submissions below go through visible UI. The fixture is never reset mid-journey.
assert.equal(sql(`SELECT count(*) FROM public.current_leases WHERE unit_id='${unit}' AND status IN ('active','draft','notice_given');`), "0");
sql(`BEGIN;
INSERT INTO public.people(id,organization_id,display_name,party_type,created_by,updated_by) VALUES('${tenant}','${org}','Daily Workflow Tenant','individual','${admin}','${admin}');
INSERT INTO public.person_roles(organization_id,person_id,role,status,created_by,updated_by) VALUES('${org}','${tenant}','tenant','active','${admin}','${admin}');
COMMIT;`);

const browser = await chromium.launch({ headless: true });
async function login(actor) {
  await context?.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", route => {
    const origin = new URL(route.request().url()).origin;
    return [dailyOrigins.app, dailyOrigins.api].includes(origin) ? route.continue() : route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(45000);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill("123456789");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(url => !["/login", "/no-access"].includes(url.pathname));
}
async function navigate(href) {
  await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, new URL(href, base).pathname, `Unexpected redirect during ${stage}`);
}
function assertSameBusinessMonth() {
  assert.equal(`${readDailyBusinessDate(sql, "finance").slice(0, 7)}-01`, dates.month, "Business month changed during the run; no correction or locking across the boundary");
}
async function waitSql(statement, expected, effect) {
  assert.ok(effect, "Every database wait must name its expected effect");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (sql(statement) === expected) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`Database effect not observed during ${stage}: ${effect}`);
}
function saveResult(extra = {}) {
  fs.writeFileSync(path.join(artifactDir, "result.json"), JSON.stringify({ sha: run.sha, phases, complete: false, paymentEvidence, ...extra }, null, 2));
}
async function passed(name, evidence) {
  phases.push({ name, passed: true, evidence });
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
  saveResult();
  console.log(`PASS ${name}`);
}
async function select(scope, name, option) {
  // RecordField's aria-labelledby includes its required marker in the name.
  const accessibleName = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*\\(required\\))?$`);
  await scope.getByRole("combobox", { name: accessibleName }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}
async function invoiceDetails() {
  await navigate(dailyInvoiceHref(invoice.id));
  const details = page.getByRole("dialog", { name: "Invoice details", exact: true });
  await details.getByText(invoice.invoice_number, { exact: true }).waitFor();
  return details;
}
async function ownerCloseDialog() {
  await navigate(dailyOwnerHref(dates.month));
  await page.getByRole("button", { name: "Account actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Close month", exact: true }).click();
  return page.getByRole("dialog", { name: "Close month", exact: true });
}
async function download(href, metadata) {
  return downloadDailyArtifact(page, base, href, metadata);
}

try {
  stage = "move-in";
  // Setup requires properties.view as well as leases.activate. The existing
  // Finance Manager deliberately lacks properties.view; do not change its grants.
  await login(dailyActors.setup);
  await navigate(`/properties/setup?step=3&ownerId=${owner}&propertyId=${property}&unitId=${unit}&tenantId=${tenant}`);
  await page.getByRole("button", { name: "Create new lease", exact: true }).click();
  const form = page.getByRole("form", { name: "Add lease form" });
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await setHiddenControlValue(form, "leaseStartDate", dates.month);
  await setHiddenControlValue(form, "leaseEndDate", dates.end);
  await select(form, "Move-in status", "Tenant moved in on the lease start date");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.locator('input[name="monthlyRentAmount"]').fill("120");
  await form.locator('input[name="rentDueDay"]').fill("1");
  await form.locator('input[name="depositAmount"]').fill("0");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByRole("button", { name: "Change billing setup", exact: true }).click();
  await select(form, "Who collects rent?", /^Collected by (?!owner$)/);
  await select(form, "Management fee", "Percentage");
  await form.locator('input[name="managementFeeValue"]').fill("8");
  await form.getByRole("button", { name: "Save tenant and lease", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.current_leases WHERE unit_id='${unit}' AND primary_tenant_person_id='${tenant}' AND status='active';`, "1", "active lease");
  leaseId = sql(`SELECT id FROM public.current_leases WHERE unit_id='${unit}' AND primary_tenant_person_id='${tenant}' AND status='active';`);
  assert.match(leaseId, /^[a-f0-9-]{36}$/);
  assert.equal(sql(`SELECT count(*) FROM public.lease_occupancies WHERE lease_id='${leaseId}' AND actual_move_in_date='${dates.month}' AND actual_move_in_confidence='confirmed' AND business_lifecycle='occupied';`), "1");
  await navigate(`/leases/${leaseId}?section=occupancy`);
  await page.getByRole("heading", { name: "Move-in & move-out", exact: true }).waitFor();
  await passed(stage, { leaseId, property, unit, month: dates.month, deposit: 0 });

  stage = "payment";
  await login(dailyActors.finance);
  assertSameBusinessMonth();
  // Active lease creation and billing-rule triggers must issue this rent. Do not
  // hide a failed creation behind an unrelated recovery action or a SQL insert.
  await waitSql(`SELECT count(*) FROM public.tenant_invoices WHERE lease_id='${leaseId}' AND billing_period_start='${dates.month}';`, "1", "issued monthly invoice");
  invoice = json(`SELECT to_jsonb(i)::text FROM public.tenant_invoices i WHERE lease_id='${leaseId}' AND billing_period_start='${dates.month}';`);
  assert.equal(invoice.collection_route, "through_ips");
  assert.equal(invoice.currency, "USD");
  assert.equal(Number(invoice.total_amount), 120);
  const terms = sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.lease_terms t WHERE lease_id='${leaseId}';`);
  const invoiceBefore = sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by')::text FROM public.tenant_invoices i WHERE id='${invoice.id}';`);
  await (await invoiceDetails()).getByRole("button", { name: "Record payment", exact: true }).click();
  const paymentDialog = page.getByRole("dialog", { name: "Record payment", exact: true });
  await paymentDialog.getByLabel("Amount", { exact: true }).fill("40");
  await setHiddenControlValue(paymentDialog, "settlementDate", dates.businessDate);
  await select(paymentDialog, "Received into", fixture.account.name);
  assert.equal(await paymentDialog.locator('input[name="receivingAccountId"]').inputValue(), fixture.account.id);
  await paymentDialog.locator('input[name="reference"]').fill(reference);
  await paymentDialog.getByRole("button", { name: "Record payment", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id='${org}' AND reference='${reference}';`, "1", "recorded payment");
  payment = json(`SELECT to_jsonb(p)::text FROM public.tenant_invoice_payments p WHERE organization_id='${org}' AND reference='${reference}';`);
  assert.equal(payment.created_by, manager); assert.equal(Number(payment.amount), 40);
  assert.equal(payment.invoice_id, invoice.id); assert.equal(payment.received_date, dates.businessDate);
  assert.equal(Number(sql(`SELECT balance_due FROM public.tenant_invoice_balances WHERE id='${invoice.id}';`)), 80);
  paymentEvidence = { persisted: true, paymentId: payment.id, invoiceId: invoice.id, createdBy: payment.created_by, amount: 40, balance: 80, receivedDate: payment.received_date, receiptVerified: false };
  saveResult(); // Incomplete checkpoint: receipt publication/download are still required.
  await waitSql(`SELECT count(*) FROM public.tenant_commercial_document_artifacts WHERE organization_id='${org}' AND source_kind='receipt' AND source_id='${payment.id}' AND publication_status='published';`, "1", "published receipt artifact");
  receipt = json(`SELECT to_jsonb(a)::text FROM public.tenant_commercial_document_artifacts a WHERE source_kind='receipt' AND source_id='${payment.id}' AND publication_status='published';`);
  const receiptHref = `/api/finance/documents/${receipt.id}`;
  await page.locator(`a[href="${receiptHref}"]`).first().waitFor();
  const receiptHash = await download(receiptHref, receipt);
  paymentEvidence = { ...paymentEvidence, receiptVerified: true, receiptId: receipt.id, receiptSha256: receiptHash };
  await passed(stage, { paymentId: payment.id, invoiceId: invoice.id, amount: 40, balance: 80 });

  stage = "monthly-correction";
  assertSameBusinessMonth();
  const allocation = prepareDailyCorrectionSource(sql, authenticated, invoice.id, payment.id);
  // Prove read-only role denial while this invoice is still eligible to edit.
  await login(dailyActors.reader);
  await navigate(`/leases/${leaseId}?action=edit-current-rent&invoiceId=${invoice.id}&section=rent`);
  await page.getByRole("heading", { level: 1, name: /Daily Workflow Tenant/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Manage lease", exact: true }).count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "Edit this month's rent", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Preview correction", exact: true }).count(), 0);
  assert.equal(sql(`SELECT count(*) FROM public.tenant_invoice_corrections WHERE tenant_invoice_id='${invoice.id}';`), "0");
  await login(dailyActors.finance);
  await invoiceDetails();
  await page.getByRole("link", { name: "Edit this month's rent", exact: true }).click();
  const correction = page.getByRole("dialog", { name: "Edit this month's rent", exact: true });
  await correction.getByLabel("Corrected rent amount", { exact: true }).fill("100");
  await correction.getByRole("button", { name: "Preview correction", exact: true }).click();
  assert.equal(await correction.locator('input[name="reason"]').evaluate(input => input.validity.valueMissing), true);
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
  await waitSql(`SELECT count(*) FROM public.tenant_invoice_corrections WHERE tenant_invoice_id='${invoice.id}' AND reason='${reason}' AND created_by='${manager}';`, "1", "audited monthly correction");
  assert.equal(sql(`SELECT count(*) FROM public.activity_logs WHERE organization_id='${org}' AND entity_type='tenant_invoice' AND entity_id='${invoice.id}' AND action='historical_rent_corrected' AND actor_id='${manager}';`), "1");
  assert.equal(Number(sql(`SELECT balance_due FROM public.tenant_invoice_balances WHERE id='${invoice.id}';`)), 60);
  assert.deepEqual(json(`SELECT to_jsonb(p)::text FROM public.tenant_invoice_payments p WHERE id='${payment.id}';`), payment);
  assert.equal(sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text FROM public.lease_terms t WHERE lease_id='${leaseId}';`), terms);
  assert.equal(sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by')::text FROM public.tenant_invoices i WHERE id='${invoice.id}';`), invoiceBefore);
  await passed(stage, { reason, correctedRent: 100, balance: 60, originalPaymentOwnerSourceId: allocation, paymentRetained: true, futureTermsUnchanged: true });

  stage = "receipt";
  await invoiceDetails();
  const retainedReceipt = page.locator(`a[href="${receiptHref}"]`);
  await retainedReceipt.first().waitFor();
  assert.equal(await download(await retainedReceipt.first().getAttribute("href"), receipt), receiptHash);
  assert.deepEqual(json(`SELECT to_jsonb(a)::text FROM public.tenant_commercial_document_artifacts a WHERE id='${receipt.id}';`), receipt);
  await passed(stage, { artifactId: receipt.id, sha256: receiptHash, originalReceiptUnchanged: true });

  stage = "owner-statement";
  assertSameBusinessMonth();
  // These are the existing checked allocation/period commands also used by the
  // rent-browser acceptance helper, not direct ledger writes or a UI fallback.
  for (let pass = 0; pass < 4; pass++) {
    const queue = JSON.parse(authenticated(manager, `SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY event_date,source_type,source_line_id),'[]')::text FROM public.get_owner_event_allocation_queue('${org}','${property}','USD','${dates.month}',('${dates.month}'::date+interval '1 month - 1 day')::date) q;`).split(/\r?\n/).at(-1));
    assert.equal(queue.filter(item => item.allocation_state === "blocked").length, 0, `Owner source blocked: ${JSON.stringify(queue.filter(item => item.allocation_state === "blocked"))}`);
    const pending = queue.filter(item => item.allocation_state === "pending");
    if (!pending.length) break;
    assert.ok(pass < 3, "Owner allocation queue did not settle");
    for (const item of pending) {
      assert.match(item.source_type, /^[a-z_]+$/); assert.match(item.source_line_id, /^[a-f0-9-]{36}$/);
      authenticated(manager, `SELECT public.allocate_owner_event('${org}','${item.source_type}','${item.source_line_id}','daily-owner-${item.source_type}-${item.source_line_id}');`);
    }
  }
  authenticated(manager, `SELECT public.generate_owner_balance_period('${org}','${property}','${owner}','USD','${dates.month}','daily-owner-period');`);
  // Existing baseline opening correction was submitted by Finance Manager.
  // Preserve the independent-review guard; Super Admin only reviews those exact
  // preflight-pinned fixture requests, never this journey's payment or correction.
  for (const request of fixture.pendingOpeningReviews) {
    assert.match(request.id, /^[a-f0-9-]{36}$/);
    authenticated(admin, `SELECT public.review_owner_opening_balance('${org}','${request.id}','reject','Resolve pending synthetic opening before close','daily-opening-review-${request.id}');`);
  }
  authenticated(manager, `SELECT public.set_financial_month_lock('${org}','${branch}','${dates.month}',true,'Synthetic daily owner close');`);
  const readiness = JSON.parse(authenticated(manager, `SELECT public.get_owner_close_readiness('${org}','${property}','${owner}','USD','${dates.month}')::text;`).split(/\r?\n/).at(-1));
  assert.equal(readiness.is_ready, true, `Owner close blocked: ${JSON.stringify(readiness.blockers)}`);
  const closing = await ownerCloseDialog();
  const closeForm = closing.getByRole("button", { name: "Close owner month", exact: true }).locator("xpath=ancestor::form");
  await closeForm.getByLabel("Close reason", { exact: true }).fill("Synthetic daily workflow statement proof");
  await closeForm.getByRole("button", { name: "Close owner month", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.owner_close_revisions r JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}' AND r.status='closed';`, "1", "closed owner revision");
  assert.equal(sql(`SELECT r.closed_by FROM public.owner_close_revisions r JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}' AND r.status='closed';`), manager);
  const publishing = await ownerCloseDialog();
  await publishing.getByText("Ready to publish the owner statement", { exact: true }).waitFor();
  await publishing.getByRole("button", { name: "Publish owner statement", exact: true }).click();
  await waitSql(`SELECT count(*) FROM public.owner_statement_publications p JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`, "1", "owner statement publication");
  await waitSql(`SELECT count(*) FROM public.owner_statement_artifacts a JOIN public.owner_statement_publications p ON p.id=a.publication_id JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`, "2", "both owner statement artifacts");
  const publication = json(`SELECT to_jsonb(p)::text FROM public.owner_statement_publications p JOIN public.owner_close_revisions r ON r.id=p.owner_close_revision_id JOIN public.owner_close_series s ON s.id=r.owner_close_series_id WHERE s.property_id='${property}' AND s.owner_person_id='${owner}' AND s.month_start='${dates.month}';`);
  assert.equal(publication.generated_by, manager);
  const published = await ownerCloseDialog();
  const card = published.locator("article").filter({ has: page.getByText(publication.statement_number, { exact: true }) });
  for (const [label, format] of [["Download PDF", "pdf"], ["Download Excel", "xlsx"]]) {
    const artifact = json(`SELECT to_jsonb(a)::text FROM public.owner_statement_artifacts a WHERE publication_id='${publication.id}' AND format='${format}';`);
    await download(await card.getByRole("link", { name: label, exact: true }).getAttribute("href"), artifact);
  }
  assert.equal(sql(`SELECT count(*) FROM public.owner_close_line_sources WHERE owner_close_revision_id='${publication.owner_close_revision_id}' AND source_type='tenant_rent_receipt' AND source_line_id='${allocation}';`), "1");
  assert.equal(sql(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]')::text FROM public.owner_statement_artifacts a WHERE publication_id<>'${publication.id}';`), oldStatements);
  assert.equal(authoritySnapshot(), originalAuthority);
  await passed(stage, { publicationId: publication.id, retainedPaymentIncludedOnce: true, priorArtifactsUnchanged: true, authorizationUnchanged: true, financialActor: manager, independentFixtureReviewer: admin });
  assertDailyCompletion(phases);
  saveResult({ complete: true });
} catch (error) {
  await page?.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
  saveResult({ failedStage: stage, message: error.message.slice(0,1500) });
  throw new Error(`Daily workflow failed at ${stage}; see synthetic evidence.`);
} finally { await browser.close(); }
