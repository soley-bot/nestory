import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(scriptDirectory, "..");
const databaseContainer = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const actors = {
  finance_member: "finance.member@nestory.com",
  finance_manager: "finance.manager@nestory.com",
  super_admin: "nestory@gmail.com",
  operations_manager: "operations.manager@nestory.com",
  operations_member: "operations.member@nestory.com",
};
const organizationId = "00000000-0000-0000-0000-000000000001";
const fixturePropertyId = "10000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000002";
const ownerId = "80000000-0000-0000-0000-000000000005";
const component = "owner_due_to_ips";
const componentLabel = "Owner due to IPS";
const evidenceHash = "9".repeat(64);

let browser;
try {
  loadBaseline();
  assertNoEvidenceArtifacts();
  browser = await chromium.launch({ headless: true });

  await assertEqualTimestampFixtureCurrentLineage();

  await withActor(actors.finance_member, async (page) => {
    await submitOpening(page, {
      amount: "0.00",
      reason: "Authenticated zero opening acceptance",
      source: "BROWSER-ZERO-INITIAL-001",
    });
    await expectSuccessFocus(page, /submitted for review/i);
  });
  assertDbPhase("initial submitted", `
    SELECT count(*) = 1
    FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
      AND owner_person_id = '${ownerId}' AND component = '${component}'
      AND request_kind = 'initial' AND status = 'submitted'
      AND proposed_amount = 0.00 AND supporting_document_id IS NULL;
  `);

  await withActor(actors.super_admin, async (page) => {
    await reviewCurrent(page, "approve", "Independent zero opening approval");
    await expectSuccessFocus(page, /approved/i);
  });
  assertDbPhase("initial approved", `
    SELECT count(*) = 1
      AND min(signed_amount) = 0.00
    FROM public.owner_opening_balance_entries
    WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
      AND owner_person_id = '${ownerId}' AND component = '${component}'
      AND entry_kind = 'opening';
  `);

  await withActor(actors.finance_manager, async (page) => {
    await submitCorrection(page, {
      amount: "0.00",
      reason: "Authenticated zero correction acceptance",
      source: "BROWSER-ZERO-CORRECTION-001",
    });
    await expectSuccessFocus(page, /submitted for review/i);
  });
  assertDbPhase("zero correction submitted", `
    SELECT count(*) = 1
      AND bool_and(correction_of_entry_id IS NOT NULL)
    FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
      AND component = '${component}' AND request_kind = 'correction'
      AND status = 'submitted' AND proposed_amount = 0.00;
  `);

  await withActor(actors.super_admin, async (page) => {
    await reviewCurrent(page, "reject", "Correction source needs clarification");
    await expectSuccessFocus(page, /rejected/i);
  });
  assertDbPhase("zero correction rejected", `
    SELECT count(*) = 1
    FROM public.owner_opening_balance_requests
    WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
      AND component = '${component}' AND request_kind = 'correction'
      AND status = 'rejected' AND review_reason = 'Correction source needs clarification';
  `);

  await withActor(actors.finance_manager, async (page) => {
    const row = currentComponentRow(page);
    await row.getByRole("button", { name: "Resubmit rejected opening" }).click();
    const dialog = page.getByRole("dialog", { name: "Request opening correction" });
    assert.equal(await dialog.getByLabel("Replacement amount").inputValue(), "0.00");
    assert.equal(
      await dialog.getByLabel("Reason").inputValue(),
      "Authenticated zero correction acceptance",
    );
    assert.equal(
      await dialog.getByLabel("Source reference").inputValue(),
      "BROWSER-ZERO-CORRECTION-001",
    );
    await dialog.getByLabel("Source snapshot fingerprint").fill(evidenceHash);
    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await expectSuccessFocus(page, /submitted for review/i);
  });
  assertDbPhase("linked correction resubmitted", `
    SELECT count(*) = 1
    FROM public.owner_opening_balance_requests AS successor
    JOIN public.owner_opening_balance_requests AS predecessor
      ON predecessor.id = successor.resubmission_of_request_id
    WHERE successor.organization_id = '${organizationId}'
      AND successor.property_id = '${propertyId}'
      AND successor.component = '${component}'
      AND successor.status = 'submitted' AND predecessor.status = 'rejected'
      AND successor.correction_of_entry_id = predecessor.correction_of_entry_id;
  `);

  await withActor(actors.super_admin, async (page) => {
    await reviewCurrent(page, "approve", "Clarified zero correction approved");
    await expectSuccessFocus(page, /approved/i);
  });
  assertDbPhase("zero correction approved", `
    SELECT
      (SELECT count(*) = 3 FROM public.owner_opening_balance_entries
       WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
         AND component = '${component}' AND signed_amount = 0.00)
      AND
      (SELECT count(*) = 2 FROM public.owner_opening_balance_entries
       WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
         AND component = '${component}'
         AND entry_kind IN ('correction_reversal', 'correction_replacement'))
      AND
      (SELECT authority_state = 'known' AND current_amount = 0.00
       FROM public.owner_opening_balance_known_authority_v1
       WHERE organization_id = '${organizationId}' AND property_id = '${propertyId}'
         AND owner_person_id = '${ownerId}' AND component = '${component}');
  `);

  for (const deniedRole of [actors.operations_manager, actors.operations_member]) {
    await withShellActor(deniedRole, async (page) => {
      const ownerBalances = page.locator(
        'nav[aria-label="Global navigation"] a[href="/balances"]',
      );
      assert.equal(await ownerBalances.count(), 0, `${deniedRole} saw Owner balances`);
    });
  }

  assertNoEvidenceArtifacts();
  process.stdout.write(
    "PASS authenticated owner-opening shell journey, zero correction lineage, role denial, and DB effects\n",
  );
} finally {
  await browser?.close();
  loadBaseline();
  assertNoEvidenceArtifacts();
}

async function withActor(email, run) {
  return withShellActor(email, async (page) => {
    await openOwnerBalancesFromVisibleFinance(page);
    await page.getByLabel("Opening property").selectOption(propertyId);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/balances" && url.searchParams.get("propertyId") === propertyId),
      page.getByRole("button", { name: "Apply" }).click(),
    ]);
    await page.getByText(componentLabel, { exact: true }).waitFor();
    await run(page);
  });
}

async function assertEqualTimestampFixtureCurrentLineage() {
  await withShellActor(actors.finance_manager, async (page) => {
    await openOwnerBalancesFromVisibleFinance(page);
    await page.getByLabel("Opening property").selectOption(fixturePropertyId);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/balances" && url.searchParams.get("propertyId") === fixturePropertyId),
      page.getByRole("button", { name: "Apply" }).click(),
    ]);

    const deposit = page.getByRole("row").filter({ hasText: "Security-deposit custody" });
    await deposit.getByText("Current — Submitted correction", { exact: true }).waitFor();
    assert.equal(
      await deposit.getByRole("button", { name: "Request correction" }).count(),
      0,
      "pending deposit correction exposed a second correction action",
    );
    await deposit.getByText("Independent review required", { exact: true }).waitFor();

    const zero = page.getByRole("row").filter({ hasText: "Owner due to IPS" });
    await zero.getByText("Current — Approved correction", { exact: true }).waitFor();
    await zero.getByText("Lineage — Rejected correction", { exact: true }).waitFor();
    assert.equal(
      await zero.locator("summary").first().innerText(),
      "Current — Approved correction",
      "approved zero resubmission did not outrank its rejected predecessor",
    );
  });
}

async function withShellActor(email, run) {
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    try {
      await page.waitForURL((url) => url.pathname !== "/login", {
        timeout: 15_000,
      });
    } catch {
      const alert = page.getByRole("alert");
      const detail = (await alert.count()) > 0 ? await alert.first().innerText() : "login remained on /login";
      throw new Error(`${email}: ${detail}`);
    }
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "domcontentloaded" });
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/workspace"),
      page.getByRole("link", { name: "Open workspace" }).click(),
    ]);
    await run(page);
  } finally {
    await context.close();
  }
}

async function openOwnerBalancesFromVisibleFinance(page) {
  const financeToggle = page.getByRole("button", {
    name: /(?:Expand|Collapse) Finance navigation/,
  });
  if ((await financeToggle.getAttribute("aria-expanded")) !== "true") {
    await financeToggle.click();
  }
  const link = page.locator(
    'nav[aria-label="Global navigation"] a[href="/balances"]',
  ).filter({ hasText: "Owner balances" });
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/balances"),
    link.click(),
  ]);
}

function currentComponentRow(page) {
  return page.getByRole("row").filter({ hasText: componentLabel });
}

async function submitOpening(page, { amount, reason, source }) {
  await currentComponentRow(page)
    .getByRole("button", { name: "Submit opening balance" })
    .click();
  await fillOpeningDialog(page, "Submit opening balance", "Opening amount", {
    amount,
    reason,
    source,
  });
}

async function submitCorrection(page, { amount, reason, source }) {
  await currentComponentRow(page)
    .getByRole("button", { name: "Request correction" })
    .click();
  await fillOpeningDialog(page, "Request opening correction", "Replacement amount", {
    amount,
    reason,
    source,
  });
}

async function fillOpeningDialog(page, title, amountLabel, values) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByLabel(amountLabel).fill(values.amount);
  await dialog.getByLabel("Reason").fill(values.reason);
  await dialog.getByLabel("Source snapshot fingerprint").fill(evidenceHash);
  await dialog.getByLabel("Source reference").fill(values.source);
  await dialog.getByRole("button", { name: "Submit for review" }).click();
}

async function reviewCurrent(page, decision, reason) {
  const label = decision === "approve" ? "Approve opening balance" : "Reject opening balance";
  await currentComponentRow(page).getByRole("button", { name: label }).click();
  const title = decision === "approve" ? "Approve opening balance" : "Reject opening balance";
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.getByLabel("Review reason").fill(reason);
  await dialog.getByRole("button", { name: decision === "approve" ? "Approve" : "Reject" }).click();
}

async function expectSuccessFocus(page, message) {
  const status = page.locator('[role=status]');
  await status.filter({ hasText: message }).waitFor({ state: "visible" });
  assert.equal(
    await status.evaluate((element) => document.activeElement === element),
    true,
    "success status did not receive focus",
  );
}

function loadBaseline() {
  const result = spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    path.join(cwd, "scripts", "load-test-fixture.mjs"),
  ], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_DB_CONTAINER: databaseContainer },
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function assertDbPhase(label, sql) {
  assert.equal(dbScalar(sql), "t", `authoritative DB phase failed: ${label}`);
}

function assertNoEvidenceArtifacts() {
  assertDbPhase("no owner-opening evidence artifacts", `
    SELECT
      NOT EXISTS (SELECT 1 FROM public.documents WHERE category = 'owner_opening_balance_evidence')
      AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'nestory-documents' AND name LIKE '%owner-opening%');
  `);
}

function dbScalar(sql) {
  const result = spawnSync(
    "docker",
    ["exec", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "DB assertion failed");
  return result.stdout.trim();
}
