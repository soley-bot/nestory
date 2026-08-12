import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(process.env.NESTORY_BASE_URL ?? "http://localhost:3000");
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const organizationId = "00000000-0000-0000-0000-000000000001";
const actors = {
  financeManager: "finance.manager@nestory.com",
  operationsManager: "operations.manager@nestory.com",
  superAdmin: "nestory@gmail.com",
};
const manifest = JSON.parse(
  readFileSync(new URL("./fixtures/ips-cutover-manifest.json", import.meta.url), "utf8"),
);
const blockedManifest = structuredClone(manifest);
blockedManifest.importRuns[0].sourceClaimHash = "9".repeat(64);

let browser;
try {
  loadBaseline();
  installSyntheticImportAuthority();
  browser = await chromium.launch({ headless: true });

  await withShellActor(actors.superAdmin, async (page) => {
    await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "IPS cutover reconciliation" }).waitFor();
    await page.getByText("No cutover manifest has been staged.", { exact: true }).waitFor();

    await stageManifest(page, blockedManifest, "ips-cutover-browser-blocked-v1");
    await waitForDb("blocked manifest", `SELECT count(*)=1 FROM public.ips_cutover_batches WHERE organization_id='${organizationId}' AND status='blocked';`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("cutover import run not reconciled", { exact: true }).waitFor();
    phase("Super Admin stages a redacted manifest and sees the exact blocking source");

    await stageManifest(page, manifest, "ips-cutover-browser-ready-v1");
    await waitForDb("ready manifest", `SELECT count(*)=1 FROM public.ips_cutover_batches WHERE organization_id='${organizationId}' AND status='staged' AND blocker_count=0;`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("properties: 1 expected / pending actual", { exact: true }).waitFor();
    await page.getByText("875.00 USD", { exact: true }).waitFor();
    await page.getByText("2290.50 USD", { exact: true }).waitFor();
    phase("corrected manifest is frozen with exact counts, months, and opening money");

    const commitForm = page.getByRole("button", { name: "Commit reconciled cutover" }).locator("xpath=ancestor::form");
    await commitForm.getByLabel("Commit request key").fill("ips-cutover-browser-commit-v1");
    await commitForm.getByLabel("Reconciliation sign-off reason").fill("Browser redacted source totals independently checked");
    await commitForm.getByRole("button", { name: "Commit reconciled cutover" }).click();
    await waitForDb("reconciled cutover", `
      SELECT count(*)=1 FROM public.ips_cutover_reconciliations AS reconciliation
      JOIN public.ips_cutover_batches AS batch ON batch.id=reconciliation.batch_id
      WHERE batch.organization_id='${organizationId}' AND batch.status='reconciled'
        AND reconciliation.expected_counts=reconciliation.actual_counts
        AND reconciliation.expected_totals=reconciliation.actual_totals
        AND reconciliation.differences='[]'::jsonb;
    `);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("reconciled", { exact: true }).waitFor();
    const replayForm = page.getByRole("button", { name: "Replay reconciled cutover" }).locator("xpath=ancestor::form");
    await replayForm.getByLabel("Commit request key").fill("ips-cutover-browser-commit-v1");
    await replayForm.getByLabel("Reconciliation sign-off reason").fill("Browser redacted source totals independently checked");
    await replayForm.getByRole("button", { name: "Replay reconciled cutover" }).click();
    await page.waitForTimeout(500);
    assert.equal(dbScalar(`SELECT count(*) FROM public.ips_cutover_reconciliations;`), "1");
    assert.equal(dbScalar(`SELECT count(*) FROM public.ips_cutover_transitions WHERE to_status='reconciled';`), "1");
    phase("commit reconciles once and exact UI replay returns the immutable authority");
  });

  assert.equal(
    dbScalar(`
      SELECT count(*) FILTER (WHERE invoice.billing_period_start IN ('2026-07-01','2026-08-01'))::text || '|' ||
        count(*) FILTER (WHERE invoice.billing_period_start='2026-06-01')::text || '|' ||
        to_char(sum(balance.balance_due) FILTER (WHERE invoice.billing_period_start IN ('2026-07-01','2026-08-01')),'FM999999999990.00')
      FROM public.tenant_invoices AS invoice
      JOIN public.tenant_invoice_balances AS balance ON balance.id=invoice.id
      JOIN public.leases AS lease ON lease.id=invoice.lease_id
      JOIN public.units AS unit ON unit.id=lease.unit_id
      JOIN public.properties AS property ON property.id=lease.property_id
      WHERE property.code='CTR-RES' AND unit.unit_number='A-01';
    `),
    "2|0|875.00",
  );
  assert.equal(dbScalar(`SELECT count(*) FROM app_private.financial_idempotency_requests WHERE status='pending' AND operation LIKE '%ips_cutover_batch';`), "0");
  phase("database effects contain only selected months, exact 875.00, and no pending request");

  for (const [role, email] of [["Finance Manager", actors.financeManager], ["Operations Manager", actors.operationsManager]]) {
    await withShellActor(email, async (page) => {
      await page.goto(`${baseUrl}/import`, { waitUntil: "networkidle" });
      assert.notEqual(new URL(page.url()).pathname, "/import", `${role} reached cutover authority`);
      assert.equal(await page.getByRole("button", { name: "Stage cutover manifest" }).count(), 0);
    });
  }
  phase("Finance and Operations roles are denied cutover route and mutations");
  process.stdout.write("PASS Track 9 browser cutover: block, correct, reconcile, replay, exact DB effects, role denial\n");
} finally {
  await browser?.close();
  loadBaseline();
}

async function stageManifest(page, value, requestKey) {
  const form = page.getByRole("button", { name: "Stage cutover manifest" }).locator("xpath=ancestor::form");
  await form.getByLabel("Authority start date").fill("2026-09-01");
  await form.getByLabel("Redacted data owner").fill("REDACTED-IPS-DATA-OWNER");
  await form.getByLabel("Stage request key").fill(requestKey);
  await form.getByLabel("Manifest JSON").fill(JSON.stringify(value));
  await form.getByRole("button", { name: "Stage cutover manifest" }).click();
}

async function withShellActor(email, run) {
  const context = await browser.newContext({ viewport: { height: 960, width: 1440 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/workspace", { waitUntil: "networkidle" }),
      page.getByRole("link", { name: "Open workspace" }).click(),
    ]);
    await run(page);
  } finally {
    await context.close();
  }
}

function installSyntheticImportAuthority() {
  dbScalar(`
    ALTER TABLE public.import_runs DISABLE TRIGGER USER;
    INSERT INTO public.import_runs (
      id, organization_id, import_type, status, source_file_name, source_file_size,
      source_mime_type, headers, mapping, total_rows, ready_rows, warning_rows,
      error_rows, created_count, updated_count, failed_count, skipped_count,
      committed_at, source_claim_hash, snapshot_hash
    ) VALUES
      ('91000000-0000-4000-8000-000000000001','${organizationId}','properties','committed','redacted-properties.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('1',64),repeat('a',64)),
      ('91000000-0000-4000-8000-000000000002','${organizationId}','units','committed','redacted-units.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('2',64),repeat('b',64)),
      ('91000000-0000-4000-8000-000000000003','${organizationId}','people','committed','redacted-people.csv',1,'text/csv','[]','{}',2,2,0,0,2,0,0,0,now(),repeat('3',64),repeat('c',64)),
      ('91000000-0000-4000-8000-000000000004','${organizationId}','leases','committed','redacted-leases.csv',1,'text/csv','[]','{}',1,1,0,0,1,0,0,0,now(),repeat('4',64),repeat('d',64));
    ALTER TABLE public.import_runs ENABLE TRIGGER USER;
    SELECT 'installed';
  `);
}

function loadBaseline() {
  runNpm("db:reset");
  runNpm("db:test:fixture", 3);
}

function runNpm(script, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const npmCli = process.env.npm_execpath;
    const result = npmCli
      ? spawnSync(process.execPath, [npmCli, "run", script], { cwd, encoding: "utf8", shell: false, timeout: 180_000 })
      : spawnSync("npm", ["run", script], { cwd, encoding: "utf8", shell: false, timeout: 180_000 });
    if (result.status === 0) return;
    if (attempt === attempts) throw new Error(result.stderr || result.stdout || `${script} failed`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
}

function dbScalar(sql) {
  const result = spawnSync(
    "docker",
    ["exec", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { cwd, encoding: "utf8", shell: false, timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}

async function waitForDb(label, sql, timeoutMs = 20_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (dbScalar(sql) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} database effect timed out`);
}

function phase(message) {
  process.stdout.write(`PASS ${message}\n`);
}
