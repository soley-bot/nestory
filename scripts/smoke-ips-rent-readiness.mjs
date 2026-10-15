// Dedicated synthetic rent journey. Never starts services, loads a baseline,
// resets a database, deletes fixtures, or changes existing organization grants.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { localHarness, quote as q, rpc as callRpc, target } from "./ips-integrated-readiness-fixture.mjs";
import { sha256 } from "./ips-readiness-recovery-core.mjs";
import { openRetainedRentTarget, rentArtifactRoot } from "./rent-readiness-target.mjs";
import { downloadDailyArtifact } from "./daily-workflow-download.mjs";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function assertInvoicePage(page, ids, expected, excluded = false) {
  assert.equal(page.totalVisibleCount, 1);
  assert.deepEqual(page.pagination, { page: 1, pageSize: 50, totalCount: excluded ? 0 : 1,
    totalPages: 1, from: excluded ? 0 : 1, to: excluded ? 0 : 1 });
  assert.equal(page.invoices.length, excluded ? 0 : 1);
  assert.deepEqual(page.totalsByCurrency, excluded ? [] : [{ currency: "USD", collected: expected.cash, outstanding: expected.balance }]);
  for (const row of [...page.invoices, page.selectedInvoice]) {
    assert.equal(row?.id, ids.invoice); assert.equal(row.organization_id, ids.org);
    assert.equal(row.property_id, ids.property); assert.equal(row.lease_id, ids.lease);
    assert.equal(row.currency, "USD"); assert.equal(Number(row.total_amount), expected.charge);
    assert.equal(Number(row.paid_through_ips), expected.cash); assert.equal(Number(row.collected_by_owner), 0);
    assert.equal(Number(row.balance_due), expected.balance); assert.equal(row.payment_status, expected.status);
  }
}

// Pure guard checks are intentionally available without reading manifests,
// loading credentials, opening Docker, or contacting an app.
function selfTest() {
  const ids = { invoice: randomUUID(), org: randomUUID(), property: randomUUID(), lease: randomUUID() };
  const expected = { charge: 100, cash: 0, balance: 100, status: "unpaid" };
  const row = { id: ids.invoice, organization_id: ids.org, property_id: ids.property, lease_id: ids.lease,
    currency: "USD", total_amount: 100, paid_through_ips: 0, collected_by_owner: 0, balance_due: 100, payment_status: "unpaid" };
  const page = { totalVisibleCount: 1, pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1, from: 1, to: 1 },
    invoices: [row], selectedInvoice: row, totalsByCurrency: [{ currency: "USD", collected: 0, outstanding: 100 }] };
  assertInvoicePage(page, ids, expected);
  for (const change of [{ paid_through_ips: 40 }, { balance_due: 60 }, { organization_id: randomUUID() }]) {
    assert.throws(() => assertInvoicePage({ ...page, selectedInvoice: { ...row, ...change } }, ids, expected));
  }
  assert.throws(() => assertInvoicePage({ ...page, selectedInvoice: null }, ids, expected));
  const excluded = { ...page, invoices: [], pagination: { ...page.pagination, totalCount: 0, from: 0, to: 0 }, totalsByCurrency: [] };
  assertInvoicePage(excluded, ids, expected, true);
  assert.throws(() => assertInvoicePage({ ...excluded, invoices: [row] }, ids, expected, true));
  console.log("PASS rent financial reconciliation self-test (5 rejection cases); target guards have separate contract tests");
}

async function main() {
  assert.equal(process.argv.length, 2, "Alternate runtime targets or arguments are unsupported");
  const retained = await openRetainedRentTarget({ cwd });
  const manifest = retained.manifest, candidate = manifest.gitSha;
  // Existing private local status is read in memory only. No status command,
  // copying, refresh or credential persistence is performed by this runner.
  let status;
  try { status = JSON.parse(readFileSync(path.join(cwd, ".codex-artifacts/isolated-local-status.json"), "utf8").replace(/^\uFEFF/, "")); }
  catch { throw Error("Existing local Auth status is unavailable or invalid"); }
  assert.equal(status.API_URL, target.api, "Existing local Auth status targets another API");
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, "Existing local Auth keys are unavailable");
  const runId = randomUUID(), ids = { org: randomUUID(), branch: randomUUID(), role: randomUUID() }, actors = {};
  const password = randomBytes(24).toString("base64url") + "aA1!";
  const redact = value => [password, status.ANON_KEY, status.SERVICE_ROLE_KEY].reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), String(value));
  const output = path.join(cwd, rentArtifactRoot, "runs", runId); mkdirSync(output, { recursive: true });
  const report = { runId, candidate, target, sourceContainerId: manifest.containerId, ids, actors,
    startedAt: new Date().toISOString(), completed: false, phases: [],
    cleanup: "Only fresh generated fixtures were created; retained for review. No global cleanup.",
    retainedManifestPath: retained.manifestPath, retainedManifestSha256: process.env.IPS_RENT_MANIFEST_SHA256,
    provenance: "Approved retained census, exact migration bodies, repository SHA and disk build ID recorded; root must attest the served build separately." };
  try { report.diskBuildId = readFileSync(path.join(cwd, ".next/BUILD_ID"), "utf8").trim(); } catch { /* Optional disk provenance. */ }
  const save = () => writeFileSync(path.join(output, "report.json"), redact(JSON.stringify(report, null, 2)));
  const phase = (name, evidence = {}) => { report.phases.push({ name, ...evidence }); save(); console.log(`PASS ${name}`); };
  let browser, context, page, boundaryError, stage = "guarded setup";
  save();
  try {
    const harness = await localHarness(cwd);
    const sql = statement => { retained.check(); return retained.rawSql(`SET statement_timeout='20s';\n${statement}`); };
    const rpc = (client, name, args) => { retained.check(); return callRpc(client, name, args); };
    assert.equal(sql("SELECT current_database();"), "postgres");
    const json = statement => JSON.parse(sql(statement));
    const expectedManagerPermissions = ["leases.view", "leases.prepare", "leases.activate", "leases.change_terms", "leases.close", "leases.archive",
      "finance.view", "finance.record_payments", "finance.approve_expenses", "finance.submit_expenses", "finance.correct_records", "finance.close_periods", "finance.publish"].sort();
    assert.deepEqual(json("SELECT coalesce(jsonb_agg(permission_key::text ORDER BY permission_key::text),'[]') FROM public.organization_role_permissions WHERE organization_id='00000000-0000-0000-0000-000000000001' AND role_id='00000000-0000-0000-0000-000000000311';"), expectedManagerPermissions,
      "Retained Finance Manager role differs from the reviewed fixture; no actor will be created");
    // Harmless real Auth read binds the API to the approved full database census
    // before creating any account; never rely on an API key alone as identity.
    const apiUsers = new Set();
    for (let page = 1; ; page++) {
      const result = await harness.admin.auth.admin.listUsers({ page, perPage: 500 });
      assert.equal(result.error, null, "Existing local Auth binding could not be verified");
      assert.ok(Array.isArray(result.data.users)); if (result.data.users.length === 0) break;
      for (const user of result.data.users) { assert.ok(!apiUsers.has(user.id), "Auth census page repeated"); apiUsers.add(user.id); }
      assert.ok(apiUsers.size <= manifest.census.authUserIds.length, "API contains an unapproved Auth identity");
    }
    assert.deepEqual([...apiUsers].sort(), manifest.census.authUserIds, "API Auth census differs from approved database");
    for (const name of ["admin", "manager"]) {
      retained.check();
      const email = `rent-${runId}-${name}@example.test`;
      const created = await harness.admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null, "Synthetic local Auth provisioning failed");
      assert.match(created.data.user.id, uuid); actors[name] = { id: created.data.user.id, email };
      retained.additions.authUserIds.push(created.data.user.id); retained.additions.authUserIds.sort(); save();
    }
    sql(`BEGIN;
      INSERT INTO public.organizations(id,name,slug) VALUES(${q(ids.org)},'Synthetic rent readiness',${q(`rent-${runId}`)});
      INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
        VALUES(${q(ids.org)},true,false) ON CONFLICT(organization_id) DO UPDATE SET ordinary_access_enabled=true,transition_manifest_required=false;
      INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES(${q(ids.branch)},${q(ids.org)},'Rent readiness','RENT');
      INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(${q(ids.org)},${q(actors.admin.id)},'super_admin');
      INSERT INTO public.organization_roles(id,organization_id,name)
        SELECT ${q(ids.role)},${q(ids.org)},name FROM public.organization_roles WHERE organization_id='00000000-0000-0000-0000-000000000001' AND id='00000000-0000-0000-0000-000000000311';
      INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
        SELECT ${q(ids.org)},${q(ids.role)},permission_key FROM public.organization_role_permissions WHERE organization_id='00000000-0000-0000-0000-000000000001' AND role_id='00000000-0000-0000-0000-000000000311';
      INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES(${q(ids.org)},${q(actors.manager.id)},'custom',${q(ids.branch)},${q(ids.role)});
      COMMIT;`);
    retained.additions.organizationIds.push(ids.org); retained.additions.organizationIds.sort();
    retained.check();
    const admin = await harness.actor(actors.admin.email, password);
    retained.check();
    const manager = await harness.actor(actors.manager.email, password);
    for (const role of ["owner", "tenant"]) {
      ids[role] = await rpc(admin, "create_person", { p_organization_id: ids.org, p_branch_id: ids.branch,
        p_display_name: `Synthetic rent ${role} ${runId.slice(0, 8)}`, p_legal_name: null, p_party_type: "individual",
        p_primary_email: null, p_primary_phone: null, p_tax_identifier: null, p_notes: `readiness:${runId}`, p_roles: [role] });
      save();
    }
    const today = await rpc(admin, "get_lease_rent_business_date", { p_organization_id: ids.org });
    const month = `${today.slice(0, 7)}-01`, end = new Date(`${month}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 6);
    report.businessDate = today;
    ids.property = await rpc(admin, "create_property_minimal", { p_organization_id: ids.org, p_branch_id: ids.branch,
      p_name: `Synthetic rent property ${runId.slice(0, 8)}`, p_code: `RENT-${runId.slice(0, 8)}`, p_property_type: "Residential apartment",
      p_address: null, p_registered_date: null, p_idempotency_key: `${runId}:property`, p_owner_person_id: ids.owner,
      p_owner_started_on: month, p_owner_ownership_percent: 100 }); save();
    await rpc(admin, "set_property_rental_structure", { p_organization_id: ids.org, p_property_id: ids.property, p_rental_structure: "single_space" });
    const lease = await rpc(admin, "create_lease_with_deposit_receipt", {
      p_organization_id: ids.org, p_property_id: ids.property, p_unit_id: null, p_primary_tenant_person_id: ids.tenant,
      p_lease_start_date: month, p_lease_end_date: end.toISOString().slice(0, 10), p_rent_amount: 120,
      p_rent_currency: "USD", p_rent_due_day: 1, p_payment_frequency: "monthly", p_term_status: "draft",
      p_deposit_amount: null, p_deposit_currency: null, p_lease_status: "draft", p_relationship_payload: {},
      p_billing_rule: { billingRecipientKind: "individual", billingRecipientPersonId: ids.tenant,
        chargeManagementFeeWhenActive: false, chargeThroughLeaseEnd: true, collectionRoute: "through_ips",
        finalPeriodProratedAmount: null, firstPeriodProratedAmount: null, fullManagementFeeDuringProration: false,
        leaseEndProrationRule: "actual_days", leaseStartProrationRule: "actual_days", managementFeeMode: "percentage",
        managementFeeValue: 0, midPeriodRentChangeRule: "next_full_month", rentCalculationTimezone: "Asia/Phnom_Penh", shortMonthDueDayRule: "last_calendar_day" },
      p_deposit_received: false, p_deposit_received_amount: null, p_deposit_received_on: null, p_idempotency_key: `${runId}:lease` });
    ids.lease = lease.leaseId; assert.match(ids.lease, uuid); save();
    const occupancy = sql(`SELECT id FROM public.lease_occupancies WHERE organization_id=${q(ids.org)} AND lease_id=${q(ids.lease)} AND archived_at IS NULL AND evidence_state='accepted';`);
    assert.match(occupancy, uuid);
    await rpc(admin, "transition_lease_lifecycle", { p_organization_id: ids.org, p_lease_id: ids.lease,
      p_expected_status: "draft", p_expected_occupancy_id: occupancy, p_transition: "activate", p_effective_date: month,
      p_scheduled_move_out_date: null, p_reason: "Synthetic current month rent acceptance", p_idempotency_key: `${runId}:activate` });
    // Activation must issue the current period. No recovery call masks a failed trigger.
    const invoice = json(`SELECT to_jsonb(i) FROM public.tenant_invoices i WHERE organization_id=${q(ids.org)} AND lease_id=${q(ids.lease)} AND billing_period_start=${q(month)};`);
    ids.invoice = invoice.id; assert.match(ids.invoice, uuid); assert.equal(Number(invoice.total_amount), 120);
    const account = json(`SELECT jsonb_build_object('id',id,'name',display_name) FROM public.finance_accounts WHERE organization_id=${q(ids.org)} AND system_role='operating_bank' AND archived_at IS NULL;`);
    assert.match(account.id, uuid); ids.account = account.id;
    const originalInvoice = sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by') FROM public.tenant_invoices i WHERE id=${q(ids.invoice)};`);
    const originalTerms = sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=${q(ids.org)} AND lease_id=${q(ids.lease)};`);
    async function reconcile(name, expected) {
      assert.equal(await rpc(manager, "get_lease_rent_business_date", { p_organization_id: ids.org }), today, "Business date changed during the journey");
      const args = { p_organization_id: ids.org, p_property_id: ids.property, p_selected_invoice_id: ids.invoice, p_page_size: 50 };
      const register = await rpc(manager, "get_rent_invoice_page", args); assertInvoicePage(register, ids, expected);
      const excluded = await rpc(manager, "get_rent_invoice_page", { ...args, p_status: "paid" }); assertInvoicePage(excluded, ids, expected, true);
      const cash = await rpc(manager, "get_property_cash_events_page", { p_organization_id: ids.org, p_property_id: ids.property,
        p_currency: "USD", p_period_start: month, p_period_end: today, p_after_event_date: null,
        p_after_source_id: null, p_after_source_type: null, p_page_size: 50 });
      assert.ok(cash.length < 50, "Synthetic cash evidence unexpectedly exceeds its bounded page");
      assert.ok(cash.every(row => row.organization_id === ids.org && row.property_id === ids.property && row.resolution_state === "resolved"));
      assert.equal(cash.reduce((sum, row) => sum + Number(row.amount), 0), expected.cash);
      writeFileSync(path.join(output, `${name}-register.json`), JSON.stringify({ register, excluded, cash }, null, 2));
      phase(name, expected);
    }
    await reconcile("issued-charge", { charge: 120, cash: 0, balance: 120, status: "unpaid" });
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    await context.route("**/*", route => {
      if (![target.app, target.api].includes(new URL(route.request().url()).origin)) return route.abort("blockedbyclient");
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        try { retained.check(); } catch (error) { boundaryError = error; return route.abort("blockedbyclient"); }
      }
      return route.continue();
    });
    page = await context.newPage(); page.setDefaultTimeout(30_000);
    await page.goto(`${target.app}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(actors.manager.email); await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click(); await page.waitForURL(url => url.pathname !== "/login");
    await page.goto(`${target.app}/workspace`, { waitUntil: "networkidle" }); await page.waitForURL(url => url.pathname !== "/workspace");
    const cookies = (await context.cookies()).filter(c => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name)).sort((a, b) => Number(a.name.match(/\.(\d+)$/)?.[1] ?? 0) - Number(b.name.match(/\.(\d+)$/)?.[1] ?? 0));
    assert.ok(cookies.length, "App did not establish its local Auth session");
    const value = decodeURIComponent(cookies.map(c => c.value).join(""));
    const session = JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString() : value);
    await harness.verifySessionToken(session.access_token, actors.manager.id);
    async function details() {
      await page.goto(`${target.app}/rent-income?propertyId=${ids.property}&invoiceId=${ids.invoice}`, { waitUntil: "networkidle" });
      const dialog = page.getByRole("dialog", { name: "Invoice details", exact: true });
      await dialog.getByText(invoice.invoice_number, { exact: true }).waitFor(); return dialog;
    }
    async function waitSql(statement, expected) {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) { if (sql(statement) === expected) return; await new Promise(resolve => setTimeout(resolve, 300)); }
      throw Error(`Expected financial effect was not observed during ${stage}`);
    }
    stage = "payment and receipt";
    await (await details()).getByRole("button", { name: "Record payment", exact: true }).click();
    const paymentDialog = page.getByRole("dialog", { name: "Record payment", exact: true });
    await paymentDialog.getByLabel("Amount", { exact: true }).fill("40");
    await setHiddenControlValue(paymentDialog, "settlementDate", today);
    await paymentDialog.getByRole("combobox", { name: /^Received into(?:\s*\(required\))?$/ }).click();
    await page.getByRole("option", { name: account.name, exact: true }).click();
    assert.equal(await paymentDialog.locator('input[name="receivingAccountId"]').inputValue(), account.id);
    const reference = `rent-readiness:${runId}`; await paymentDialog.locator('input[name="reference"]').fill(reference);
    const paymentKey = await paymentDialog.locator('input[name="idempotencyKey"]').inputValue();
    await paymentDialog.getByRole("button", { name: "Record payment", exact: true }).click();
    const paymentWhere = `organization_id=${q(ids.org)} AND reference=${q(reference)} AND reversal_of_id IS NULL`;
    await waitSql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE ${paymentWhere};`, "1");
    const payment = json(`SELECT to_jsonb(p) FROM public.tenant_invoice_payments p WHERE ${paymentWhere};`);
    ids.payment = payment.id; save(); assert.equal(payment.created_by, actors.manager.id); assert.equal(Number(payment.amount), 40);
    await waitSql(`SELECT count(*) FROM public.tenant_commercial_document_artifacts WHERE organization_id=${q(ids.org)} AND source_kind='receipt' AND source_id=${q(ids.payment)} AND publication_status='published';`, "1");
    const receipt = json(`SELECT to_jsonb(a) FROM public.tenant_commercial_document_artifacts a WHERE organization_id=${q(ids.org)} AND source_kind='receipt' AND source_id=${q(ids.payment)} AND publication_status='published';`);
    ids.receipt = receipt.id; save();
    const receiptHref = `/api/finance/documents/${receipt.id}`;
    await page.locator(`a[href="${receiptHref}"]`).first().waitFor();
    const receiptHash = await downloadDailyArtifact(page, target.app, receiptHref, receipt);
    // Actual visible download retained in the evidence packet as well as browser fetch verification.
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`a[href="${receiptHref}"]`).first().click()]);
    const receiptFile = path.join(output, "original-receipt.pdf"); await download.saveAs(receiptFile);
    assert.equal(sha256(readFileSync(receiptFile)), receiptHash);
    assert.equal(await rpc(manager, "record_tenant_invoice_payment_with_account", { p_organization_id: ids.org,
      p_invoice_id: ids.invoice, p_amount: 40, p_received_date: today, p_receiving_account_id: account.id,
      p_reference: reference, p_allocations: null, p_idempotency_key: paymentKey }), ids.payment);
    assert.equal(sql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE ${paymentWhere};`), "1");
    await reconcile("published-receipt-and-payment-replay", { charge: 120, cash: 40, balance: 80, status: "partly_paid" });
    report.receipt = { id: receipt.id, sha256: receiptHash, sizeBytes: receipt.size_bytes }; save();
    const allocation = sql(`SELECT id FROM public.tenant_invoice_payment_allocations WHERE organization_id=${q(ids.org)} AND payment_id=${q(ids.payment)} AND amount=40 AND reversal_of_allocation_id IS NULL;`);
    assert.match(allocation, uuid);
    const originalAllocations = sql(`SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.tenant_invoice_payment_allocations a WHERE organization_id=${q(ids.org)} AND payment_id=${q(ids.payment)};`);
    await rpc(manager, "allocate_owner_event", { p_organization_id: ids.org, p_source_type: "tenant_rent_receipt", p_source_line_id: allocation, p_idempotency_key: `${runId}:owner-source` });
    stage = "current month correction";
    await (await details()).getByRole("link", { name: "Edit this month's rent", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Edit this month's rent", exact: true });
    const correctionReason = `Synthetic issued rent correction ${runId}`;
    await correction.getByLabel("Corrected rent amount", { exact: true }).fill("100");
    await correction.getByLabel("Reason", { exact: true }).fill(correctionReason);
    await correction.getByRole("button", { name: "Preview correction", exact: true }).click();
    const preview = correction.getByRole("region", { name: "Correction preview" }); await preview.getByText("60.00", { exact: true }).waitFor();
    const correctionForm = preview.locator("form");
    const correctionFields = await correctionForm.evaluate(form => Object.fromEntries(new FormData(form)));
    await correction.getByRole("button", { name: "Save this month's rent", exact: true }).click();
    await waitSql(`SELECT count(*) FROM public.tenant_invoice_corrections WHERE organization_id=${q(ids.org)} AND tenant_invoice_id=${q(ids.invoice)} AND reason=${q(correctionReason)} AND created_by=${q(actors.manager.id)};`, "1");
    const reapplied = json(`SELECT to_jsonb(r) FROM public.historical_rent_settlement_reapplications r WHERE organization_id=${q(ids.org)} AND original_settlement_id=${q(ids.payment)};`);
    assert.equal(reapplied.settlement_kind, "ips_payment"); assert.equal(Number(reapplied.original_amount), 40); assert.equal(Number(reapplied.reapplied_amount), 40); assert.equal(Number(reapplied.credit_amount), 0);
    ids.replacement = reapplied.replacement_settlement_id; assert.match(ids.replacement, uuid); assert.notEqual(ids.replacement, ids.payment); save();
    assert.equal(sql(`SELECT binding.primary_account_id FROM app_private.financial_idempotency_requests request
      JOIN app_private.finance_chart_workflow_idempotency_bindings binding ON binding.organization_id=request.organization_id
        AND binding.operation=request.operation AND binding.idempotency_key=request.idempotency_key
      WHERE request.organization_id=${q(ids.org)} AND request.operation='record_tenant_invoice_payment'
        AND request.result_ids->>'paymentId'=${q(ids.replacement)};`), ids.account, "Reapplication must retain the original receiving account");
    await rpc(manager, "correct_historical_rent", { p_organization_id: ids.org, p_invoice_id: ids.invoice,
      p_corrected_rent_amount: 100, p_corrected_due_day: Number(correctionFields.correctedDueDay),
      p_reason: correctionReason, p_preview_hash: correctionFields.previewHash, p_idempotency_key: correctionFields.idempotencyKey });
    assert.equal(sql(`SELECT count(*) FROM public.historical_rent_settlement_reapplications WHERE organization_id=${q(ids.org)} AND original_settlement_id=${q(ids.payment)};`), "1");
    await reconcile("corrected-rent-and-reapplication-replay", { charge: 100, cash: 40, balance: 60, status: "partly_paid" });
    stage = "replacement payment reversal with lost response";
    await (await details()).getByRole("button", { name: "Reverse payment record", exact: true }).click();
    const reversal = page.getByRole("dialog", { name: "Reverse payment record", exact: true });
    assert.equal(await reversal.locator('input[name="settlementId"]').inputValue(), ids.replacement, "Only the effective replacement may be reversed");
    const reversalReason = `Synthetic payment reversal ${runId}`;
    await reversal.getByLabel("Reason", { exact: true }).fill(reversalReason); await setHiddenControlValue(reversal, "reversalDate", today);
    const reversalKey = await reversal.locator('input[name="idempotencyKey"]').inputValue();
    let interrupted = false, interruptionError, finishInterruption;
    const interruptionComplete = new Promise(resolve => { finishInterruption = resolve; });
    const reverseRoute = `${target.app}/rent-income**`;
    const reverseHandler = async route => {
      if (interrupted || route.request().method() !== "POST" || !route.request().headers()["next-action"]) return route.fallback();
      interrupted = true;
      try {
        retained.check();
        const response = await route.fetch(); assert.equal(response.status(), 200, "Reversal server action failed");
        // Observe the committed append before discarding its browser response.
        await waitSql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=${q(ids.org)} AND reversal_of_id=${q(ids.replacement)};`, "1");
      } catch (error) { interruptionError = error; }
      finally { try { await route.abort("failed"); } finally { finishInterruption(); } }
    };
    await context.route(reverseRoute, reverseHandler);
    await reversal.getByRole("button", { name: "Reverse payment record", exact: true }).click();
    await waitSql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=${q(ids.org)} AND reversal_of_id=${q(ids.replacement)};`, "1");
    await interruptionComplete;
    await context.unroute(reverseRoute, reverseHandler);
    assert.equal(interrupted, true, "The intended browser response was not interrupted"); if (interruptionError) throw interruptionError;
    const reversalId = await rpc(manager, "reverse_tenant_invoice_payment", { p_organization_id: ids.org, p_payment_id: ids.replacement,
      p_reversal_date: today, p_reason: reversalReason, p_idempotency_key: reversalKey });
    ids.reversal = reversalId; assert.match(reversalId, uuid); save();
    assert.equal(sql(`SELECT count(*) FROM public.tenant_invoice_payments WHERE organization_id=${q(ids.org)} AND reversal_of_id=${q(ids.replacement)};`), "1");
    const reversedPayment = json(`SELECT to_jsonb(p) FROM public.tenant_invoice_payments p WHERE organization_id=${q(ids.org)} AND id=${q(reversalId)};`);
    assert.equal(reversedPayment.reversal_of_id, ids.replacement); assert.equal(reversedPayment.created_by, actors.manager.id);
    // The payment record keeps an unsigned amount plus reversal identity; the
    // canonical cash projection supplies its negative economic effect.
    assert.equal(Number(reversedPayment.amount), 40); assert.equal(reversedPayment.received_date, today);
    assert.equal(reversedPayment.reversal_reason, reversalReason);
    await reconcile("reversed-replacement-and-lost-response-replay", { charge: 100, cash: 0, balance: 100, status: "unpaid" });
    assert.deepEqual(json(`SELECT to_jsonb(p) FROM public.tenant_invoice_payments p WHERE id=${q(ids.payment)};`), payment);
    assert.equal(sql(`SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.tenant_invoice_payment_allocations a WHERE organization_id=${q(ids.org)} AND payment_id=${q(ids.payment)};`), originalAllocations);
    assert.equal(sql(`SELECT (to_jsonb(i)-'updated_at'-'updated_by') FROM public.tenant_invoices i WHERE id=${q(ids.invoice)};`), originalInvoice);
    assert.equal(sql(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.lease_terms t WHERE organization_id=${q(ids.org)} AND lease_id=${q(ids.lease)};`), originalTerms);
    assert.deepEqual(json(`SELECT to_jsonb(a) FROM public.tenant_commercial_document_artifacts a WHERE id=${q(ids.receipt)};`), receipt);
    await details(); await page.locator(`a[href="${receiptHref}"]`).first().waitFor();
    assert.equal(await downloadDailyArtifact(page, target.app, receiptHref, receipt), receiptHash);
    const audit = json(`SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY created_at,id),'[]') FROM public.activity_logs a WHERE organization_id=${q(ids.org)} AND entity_type='tenant_invoice' AND entity_id=${q(ids.invoice)};`);
    const correctionAudit = audit.filter(row => row.action === "historical_rent_corrected" && row.actor_id === actors.manager.id);
    const reversalAudit = audit.filter(row => row.action === "tenant_invoice_payment_reversed" && row.new_values?.paymentId === ids.replacement);
    assert.equal(correctionAudit.length, 1); assert.equal(correctionAudit[0].new_values.reason, correctionReason);
    assert.equal(reversalAudit.length, 1); assert.equal(reversalAudit[0].actor_id, actors.manager.id); assert.equal(reversalAudit[0].new_values.reason, reversalReason);
    writeFileSync(path.join(output, "audit-and-immutable-evidence.json"), JSON.stringify({ originalPayment: payment, originalAllocations: JSON.parse(originalAllocations), receipt, reapplied, reversedPayment, audit }, null, 2));
    await page.screenshot({ path: path.join(output, "final-unpaid-invoice.png"), fullPage: true });
    phase("immutable original receipt, source payment, issued header, future terms and actor/reason audit retained");
    report.completed = true; report.completedAt = new Date().toISOString(); save(); console.log(`PASS rent readiness ${runId}`);
  } catch (error) {
    report.failure = { stage, message: redact(boundaryError?.message ?? error?.message ?? error) }; save();
    if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    throw Error(`Rent readiness failed during ${stage}; credential-free evidence: ${output}`, { cause: undefined });
  } finally { await context?.close(); await browser?.close(); }
}

if (process.argv.length === 3 && process.argv[2] === "--self-test") selfTest();
else await main();
