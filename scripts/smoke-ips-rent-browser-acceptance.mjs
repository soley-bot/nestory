import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import {
  queryGuardedRentFixture,
  runScenarioContract,
  validateGuardedRentFixture,
} from "./smoke-ips-rent-scenarios.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseContainer = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const organizationId = "00000000-0000-0000-0000-000000000001";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";
const actors = {
  financeManager: "finance.manager@nestory.com",
  financeMember: "finance.member@nestory.com",
  operationsManager: "operations.manager@nestory.com",
  superAdmin: "nestory@gmail.com",
};
const actorIds = {
  financeManager: "00000000-0000-0000-0000-000000000701",
  superAdmin: "00000000-0000-0000-0000-000000000101",
};
const currentDate = dbScalar("SELECT current_date::text;");

let browser;
try {
  loadBaseline();
  runScenarioContract();
  validateGuardedRentFixture(queryGuardedRentFixture());
  phase("ten literal rent scenarios pass and guarded fixture is restored");

  browser = await chromium.launch({ headless: true });

  await withRentActor(actors.financeManager, async (page) => {
    const fullRow = rentRow(page, "RIV-SHP", "R-01");
    const unpaidRow = rentRow(page, "GDN-CRT", "G-01");
    const partialRow = rentRow(page, "CTR-RES", "A-01");
    const directRow = rentRow(page, "CTR-RES", "A-02");
    await fullRow.getByText("Overdue", { exact: true }).waitFor();
    await unpaidRow.getByText("Overdue", { exact: true }).waitFor();
    await partialRow.getByText("Partly paid · overdue", { exact: true }).waitFor();
    await directRow.getByText("Partly paid · overdue", { exact: true }).waitFor();

    await partialRow.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByLabel("Amount").fill("25.00");
    await dialog.locator('input[name="reconciliationSourceId"] + button').click();
    await page.getByRole("option").first().click();
    await dialog.getByLabel("Reference").fill("TRACK5-BROWSER-LATE");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await page.getByText("Payment recorded.", { exact: true }).waitFor();
    await rentRow(page, "CTR-RES", "A-01")
      .getByText("Paid late", { exact: true })
      .waitFor();
    phase("Finance Manager completes the exact late payment and sees Paid late");
  });

  assert.equal(
    dbScalar(`
      SELECT balance.payment_status || '|' ||
        to_char(balance.balance_due, 'FM999999999990.00') || '|' ||
        payment.received_date::text || '|' || count(allocation.id)::text
      FROM public.tenant_invoice_payments AS payment
      JOIN public.tenant_invoice_payment_allocations AS allocation
        ON allocation.payment_id = payment.id
      JOIN public.tenant_invoice_balances AS balance ON balance.id = payment.invoice_id
      WHERE payment.reference = 'TRACK5-BROWSER-LATE'
      GROUP BY balance.payment_status, balance.balance_due, payment.received_date;
    `),
    `paid|0.00|${currentDate}|1`,
  );
  phase("tenant obligation and settlement remain separate immutable records");

  advanceOwnerAccounting();
  phase("late IPS receipt allocates and rerolls the authoritative owner period");

  await withRentActor(actors.superAdmin, async (page) => {
    await page.getByRole("button", { name: "Recover missed month" }).click();
    const drawer = page.getByRole("dialog", { name: "Recover missed rent" });
    await drawer.locator('input[name="leaseId"] + button').click();
    await page.getByRole("option").filter({ hasText: /R-01/ }).click();
    await drawer.getByRole("button", { name: "Generate selected month" }).click();
    await page.getByText("Historical rent month generated.", { exact: true }).waitFor();
    phase("Super Admin recovers only the selected historical month through visible controls");
  });

  assert.equal(
    dbScalar(`
      SELECT count(*) FILTER (WHERE invoice.billing_period_start = '2026-07-01')::text || '|' ||
        count(*) FILTER (WHERE invoice.billing_period_start = '2026-06-01')::text
      FROM public.tenant_invoices AS invoice
      JOIN public.properties AS property ON property.id = invoice.property_id
      WHERE property.code = 'RIV-SHP';
    `),
    "1|0",
  );

  await withBalanceActor(actors.superAdmin, async (page) => {
    await page.getByText("Ready to close owner month · revision 1", { exact: true }).waitFor();
    const close = formByButton(page, "Close owner month");
    await close.getByLabel("Close reason").fill(
      "Track 5 rent-to-statement browser acceptance",
    );
    await close.getByRole("button", { name: "Close owner month" }).click();
    await waitForDb(
      "owner close",
      `SELECT count(*) = 1 FROM public.owner_close_revisions AS revision
       JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
       WHERE series.organization_id = '${organizationId}'
         AND series.property_id = '${centralPropertyId}'
         AND series.owner_person_id = '${centralOwnerId}'
         AND series.month_start = date_trunc('month', current_date)::date
         AND revision.revision_number = 1 AND revision.status = 'closed';`,
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Ready to publish the owner statement", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Publish owner statement" }).click();
    await waitForDb(
      "owner statement publication",
      `SELECT count(*) = 1 AND max(artifact_count) = 2
       FROM (
         SELECT publication.id, count(artifact.id)::integer AS artifact_count
         FROM public.owner_statement_publications AS publication
         JOIN public.owner_close_revisions AS revision ON revision.id = publication.owner_close_revision_id
         JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
         LEFT JOIN public.owner_statement_artifacts AS artifact ON artifact.publication_id = publication.id
         WHERE series.organization_id = '${organizationId}'
           AND series.property_id = '${centralPropertyId}'
           AND series.owner_person_id = '${centralOwnerId}'
           AND series.month_start = date_trunc('month', current_date)::date
         GROUP BY publication.id
       ) AS publication_rows;`,
      30_000,
    );
    await page.reload({ waitUntil: "networkidle" });
    const statementNumber = dbScalar(`
      SELECT publication.statement_number
      FROM public.owner_statement_publications AS publication
      JOIN public.owner_close_revisions AS revision ON revision.id = publication.owner_close_revision_id
      JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
      WHERE series.organization_id = '${organizationId}'
        AND series.property_id = '${centralPropertyId}'
        AND series.owner_person_id = '${centralOwnerId}'
        AND series.month_start = date_trunc('month', current_date)::date;
    `);
    const card = page.locator("article").filter({
      has: page.getByText(statementNumber, { exact: true }),
    });
    for (const name of ["Download PDF", "Download Excel"]) {
      const href = await card.getByRole("link", { name }).getAttribute("href");
      assert.ok(href);
      const response = await page.request.get(new URL(href, baseUrl).toString());
      assert.equal(response.status(), 200);
      const bytes = await response.body();
      const expected = JSON.parse(dbScalar(`
        SELECT json_build_object('size', size_bytes, 'sha256', sha256)::text
        FROM public.owner_statement_artifacts AS artifact
        JOIN public.owner_statement_publications AS publication ON publication.id = artifact.publication_id
        WHERE publication.statement_number = '${statementNumber}'
          AND artifact.format = '${name === "Download PDF" ? "pdf" : "xlsx"}';
      `));
      assert.equal(bytes.byteLength, expected.size);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256);
    }
    phase("Super Admin closes and publishes byte-verified official PDF and Excel");
  });

  await withRentActor(actors.financeMember, async (page) => {
    await rentRow(page, "CTR-RES", "A-01")
      .getByText("Paid late", { exact: true })
      .waitFor();
    assert.equal(await page.getByRole("button", { name: "Record payment" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Recover missed month" }).count(), 0);
    phase("Finance Member reads the lifecycle without mutation authority");
  });

  await withShellActor(actors.operationsManager, async (page) => {
    assert.equal(
      await page.locator('nav[aria-label="Global navigation"] a[href="/rent-income"]').count(),
      0,
    );
    await page.goto(`${baseUrl}/rent-income`, { waitUntil: "networkidle" });
    assert.notEqual(new URL(page.url()).pathname, "/rent-income");
    phase("Operations Manager is denied Rent navigation and direct route");
  });

  assert.equal(
    dbScalar(`SELECT count(*) FROM app_private.financial_idempotency_requests
      WHERE status = 'pending' AND organization_id = '${organizationId}';`),
    "0",
  );
  assert.equal(
    dbScalar(`
      SELECT count(*)
      FROM public.owner_close_line_sources AS source
      JOIN public.owner_close_revisions AS revision ON revision.id = source.owner_close_revision_id
      JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
      WHERE series.organization_id = '${organizationId}'
        AND series.property_id = '${centralPropertyId}'
        AND series.owner_person_id = '${centralOwnerId}'
        AND series.month_start = date_trunc('month', current_date)::date
        AND source.source_type = 'tenant_rent_receipt'
        AND source.source_line_id = (
          SELECT allocation.id
          FROM public.tenant_invoice_payment_allocations AS allocation
          JOIN public.tenant_invoice_payments AS payment ON payment.id = allocation.payment_id
          WHERE payment.reference = 'TRACK5-BROWSER-LATE'
        );
    `),
    "1",
  );
  process.stdout.write(
    "PASS Track 5 browser lifecycle: 10 scenarios, late payment, historical recovery, owner close, official Statement, role denials\n",
  );
} finally {
  await browser?.close();
  loadBaseline(false);
}

function loadBaseline(reset = true) {
  if (reset) runNpm("db:reset");
  runNpm("db:test:fixture", 3);
}

function runNpm(script, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const npmCli = process.env.npm_execpath;
    const result = npmCli
      ? spawnSync(process.execPath, [npmCli, "run", script], {
          cwd,
          encoding: "utf8",
          shell: false,
          timeout: 120_000,
        })
      : spawnSync("npm", ["run", script], {
          cwd,
          encoding: "utf8",
          shell: false,
          timeout: 120_000,
        });
    if (result.status === 0) return;
    if (attempt === attempts) {
      throw new Error(result.stderr || result.stdout || `${script} failed`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
}

function dbScalar(sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { cwd, encoding: "utf8", shell: false, timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}

function runAuthenticated(actorId, sql) {
  dbScalar(`BEGIN;
    SELECT pg_catalog.set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${sql}
    COMMIT;`);
}

function advanceOwnerAccounting() {
  const allocationId = dbScalar(`
    SELECT allocation.id
    FROM public.tenant_invoice_payment_allocations AS allocation
    JOIN public.tenant_invoice_payments AS payment ON payment.id = allocation.payment_id
    WHERE payment.reference = 'TRACK5-BROWSER-LATE';
  `);
  runAuthenticated(actorIds.financeManager, `
    SELECT public.allocate_owner_event(
      '${organizationId}', 'tenant_rent_receipt', '${allocationId}',
      'track-5-browser-owner-allocation'
    );
    SELECT public.generate_owner_balance_period(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      date_trunc('month', current_date)::date,
      'track-5-browser-owner-period'
    );
  `);
  runAuthenticated(actorIds.superAdmin, `
    SELECT public.set_financial_month_lock(
      '${organizationId}', date_trunc('month', current_date)::date, true,
      'Track 5 browser rent lifecycle close'
    );
    SELECT public.review_owner_opening_balance(
      request.organization_id, request.id, 'reject',
      'Resolve pending fixture correction before Track 5 browser close',
      'track-5-browser-reject-pending-opening'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${centralPropertyId}'
      AND request.owner_person_id = '${centralOwnerId}'
      AND request.status = 'submitted';
  `);
}

async function withRentActor(email, run) {
  return withShellActor(email, async (page) => {
    await navigateFinanceChild(page, "/rent-income");
    await page.locator('[data-slot="rent-invoices-surface"]').waitFor();
    await run(page);
  });
}

async function withBalanceActor(email, run) {
  return withShellActor(email, async (page) => {
    await navigateFinanceChild(page, "/balances");
    const month = dbScalar(
      "SELECT to_char(date_trunc('month', current_date), 'YYYY-MM');",
    );
    const form = formByButton(page, "Load balances");
    await setHiddenControlValue(form, "propertyId", centralPropertyId);
    await setHiddenControlValue(form, "ownerPersonId", centralOwnerId);
    await form.getByLabel("Month").fill(month);
    await form.getByRole("button", { name: "Load balances" }).click();
    await page.getByTestId("owner-close-readiness").waitFor();
    await run(page);
  });
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
    await page.waitForURL((url) => url.pathname !== "/workspace", {
      waitUntil: "networkidle",
    });
    await run(page);
  } finally {
    await context.close();
  }
}

async function navigateFinanceChild(page, href) {
  const toggle = page.getByRole("button", { name: /(?:Expand|Collapse) Finance navigation/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const link = page.locator(`nav[aria-label="Global navigation"] a[href="${href}"]`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === href, { waitUntil: "networkidle" }),
    link.click(),
  ]);
}

function rentRow(page, propertyCode, unitNumber) {
  return page.getByRole("row").filter({ hasText: propertyCode }).filter({ hasText: unitNumber });
}

function formByButton(page, name) {
  return page.getByRole("button", { name }).locator("xpath=ancestor::form");
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
