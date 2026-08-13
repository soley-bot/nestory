import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseContainer = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const organizationId = "00000000-0000-0000-0000-000000000001";
const actors = {
  financeManager: "finance.manager@nestory.com",
  financeMember: "finance.member@nestory.com",
  operationsManager: "operations.manager@nestory.com",
  superAdmin: "nestory@gmail.com",
};

const originalReference = "TRACK6-BROWSER-ORIGINAL";
const correctedReference = "TRACK6-BROWSER-CORRECTED";
const originalVendor = "Track 6 browser vendor";
const correctedVendor = "Track 6 corrected vendor";
const originalEvidence = Buffer.from(
  "Nestory Track 6 browser verified paid-cost receipt\noriginal\n",
);
const correctedEvidence = Buffer.from(
  "Nestory Track 6 browser verified paid-cost receipt\ncorrected\n",
);

let browser;
try {
  loadBaseline();
  browser = await chromium.launch({ headless: true });

  await withPaidCostActor(actors.financeMember, async (page) => {
    await submitPaidCost(page, {
      amount: "100.00",
      evidence: originalEvidence,
      fileName: "track6-browser-original.pdf",
      reference: originalReference,
      vendor: originalVendor,
    });
    await page.getByText("Paid cost submitted for Finance review.", { exact: true }).waitFor();
    phase("Finance Member records an already-paid owner cost with verified evidence");

    const row = paidCostRow(page, originalReference);
    await row.getByText("Read only", { exact: true }).waitFor();
    assert.equal(await row.getByRole("button", { name: /Approve|Reject|Reverse/ }).count(), 0);
    phase("Finance Member remains read-only after submission");
  });

  const originalHash = createHash("sha256").update(originalEvidence).digest("hex");
  assert.equal(
    dbScalar(`
      SELECT submission.status || '|' || document.content_sha256 || '|' ||
        document.size_bytes::text || '|' || (object.id IS NOT NULL)::text
      FROM public.expense_submissions AS submission
      JOIN public.documents AS document
        ON document.id = submission.supporting_document_id
      LEFT JOIN storage.objects AS object
        ON object.bucket_id = 'nestory-documents'
       AND object.name = document.storage_path
      WHERE submission.organization_id = '${organizationId}'
        AND submission.reference = '${originalReference}';
    `),
    `submitted|${originalHash}|${originalEvidence.byteLength}|true`,
  );

  await withPaidCostActor(actors.financeManager, async (page) => {
    const row = paidCostRow(page, originalReference);
    await row.getByRole("button", { name: `Approve ${originalVendor}` }).click();
    const dialog = page.getByRole("dialog", { name: "Approve paid cost" });
    await dialog.getByText("Audit details", { exact: true }).click();
    await dialog.getByText(originalHash, { exact: true }).waitFor();
    await dialog.getByText("track6-browser-original.pdf", { exact: true }).waitFor();
    await dialog.getByRole("textbox", { name: "Review note" }).fill(
      "Verified receipt, paid amount, source, and property responsibility",
    );
    await dialog.getByRole("button", { name: "Approve paid cost" }).click();
    await page.getByText("Paid cost approved and recorded.", { exact: true }).waitFor();
    phase("Finance Manager approves the exact paid cost after reviewing its fingerprint");
  });

  await withPaidCostActor(actors.superAdmin, async (page) => {
    await page.getByRole("tab", { name: /Approved/ }).click();
    const row = paidCostRow(page, originalReference);
    await row.getByRole("button", { name: `Reverse ${originalVendor}` }).click();
    const dialog = page.getByRole("dialog", { name: "Reverse paid cost" });
    await dialog.getByRole("textbox", { name: "Reason" }).fill(
      "Correct the verified paid amount without deleting evidence",
    );
    await dialog.getByRole("button", { name: "Reverse paid cost" }).click();
    await page.getByText("Paid cost reversed.", { exact: true }).waitFor();
    phase("Super Admin reverses the approved cost without erasing the original");
  });

  await withPaidCostActor(actors.financeMember, async (page) => {
    await submitPaidCost(page, {
      amount: "90.00",
      evidence: correctedEvidence,
      fileName: "track6-browser-corrected.pdf",
      reference: correctedReference,
      vendor: correctedVendor,
    });
    await page.getByText("Paid cost submitted for Finance review.", { exact: true }).waitFor();
  });

  await withPaidCostActor(actors.financeManager, async (page) => {
    const row = paidCostRow(page, correctedReference);
    await row.getByRole("button", { name: `Approve ${correctedVendor}` }).click();
    const dialog = page.getByRole("dialog", { name: "Approve paid cost" });
    await dialog.getByRole("textbox", { name: "Review note" }).fill(
      "Approved corrected exact amount and replacement receipt",
    );
    await dialog.getByRole("button", { name: "Approve paid cost" }).click();
    await page.getByText("Paid cost approved and recorded.", { exact: true }).waitFor();
    phase("corrected paid cost is resubmitted and approved exactly once");
  });

  await withShellActor(actors.operationsManager, async (page) => {
    await page.goto(`${baseUrl}/bills-expenses`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname === "/no-access", {
      timeout: 20_000,
      waitUntil: "networkidle",
    });
    assert.equal(await page.getByRole("button", { name: "Record paid cost" }).count(), 0);
    phase("Operations role is denied the paid-cost route");
  });

  assert.equal(
    dbScalar(`
      SELECT pg_catalog.string_agg(
        submission.reference || ':' || submission.status || ':' ||
          to_char(submission.internal_cost_amount, 'FM999999999990.00'),
        ',' ORDER BY submission.reference
      )
      FROM public.expense_submissions AS submission
      WHERE submission.organization_id = '${organizationId}'
        AND submission.reference IN ('${originalReference}', '${correctedReference}');
    `),
    `${correctedReference}:approved:90.00,${originalReference}:reversed:100.00`,
  );
  assert.equal(
    dbScalar(`
      SELECT count(*)::text || '|' ||
        pg_catalog.bool_and(submission.approved_payment_id IS NOT NULL)::text || '|' ||
        pg_catalog.bool_and(submission.approved_payment_allocation_id IS NOT NULL)::text || '|' ||
        pg_catalog.bool_and(submission.approved_responsibility_id IS NOT NULL)::text || '|' ||
        pg_catalog.bool_and(submission.approved_ledger_entry_id IS NOT NULL)::text
      FROM public.expense_submissions AS submission
      WHERE submission.organization_id = '${organizationId}'
        AND submission.reference IN ('${originalReference}', '${correctedReference}');
    `),
    "2|true|true|true|true",
  );
  assert.equal(
    dbScalar(`
      SELECT count(*)::text || '|' ||
        to_char(sum(adjustment.amount), 'FM999999999990.00') || '|' ||
        count(DISTINCT submission.supporting_document_id)::text
      FROM public.expense_submissions AS submission
      LEFT JOIN public.expense_customer_adjustments AS adjustment
        ON adjustment.submission_id = submission.id
      WHERE submission.organization_id = '${organizationId}'
        AND submission.reference IN ('${originalReference}', '${correctedReference}');
    `),
    "2|-100.00|2",
  );
  assert.equal(
    dbScalar(`
      SELECT count(*)::text
      FROM app_private.financial_idempotency_requests
      WHERE organization_id = '${organizationId}' AND status = 'pending';
    `),
    "0",
  );
  phase("paid-cost browser database effects reconcile and the guarded fixture is restored");
  process.stdout.write(
    "PASS Track 6 browser lifecycle: submit, verified review, approve, reverse, correct, reapprove, role denial, and exact DB effects\n",
  );
} finally {
  await browser?.close();
  loadBaseline(false);
}

async function submitPaidCost(page, input) {
  await page.getByRole("button", { name: "Record paid cost" }).click();
  const dialog = page.getByRole("dialog", { name: "Record paid cost" });
  await dialog.getByText("Already paid", { exact: true }).waitFor();
  await dialog.getByLabel("Paid to").fill(input.vendor);
  await dialog.getByLabel("Amount paid").fill(input.amount);
  await dialog.getByLabel("Receipt or payment reference").fill(input.reference);
  await dialog.locator('input[name="evidenceFile"]').setInputFiles({
    buffer: input.evidence,
    mimeType: "application/pdf",
    name: input.fileName,
  });
  await dialog.getByRole("button", { name: "Submit for review" }).click();
}

async function withPaidCostActor(email, run) {
  return withShellActor(email, async (page) => {
    await navigateFinanceChild(page, "/bills-expenses");
    await page.getByRole("tablist", { name: "Paid cost status" }).waitFor();
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
      timeout: 20_000,
      waitUntil: "networkidle",
    });
    await run(page);
  } finally {
    await context.close();
  }
}

async function navigateFinanceChild(page, href) {
  const toggle = page.getByRole("button", {
    name: /(?:Expand|Collapse) Finance navigation/,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const link = page.locator(`nav[aria-label="Global navigation"] a[href="${href}"]`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === href, {
      timeout: 20_000,
      waitUntil: "networkidle",
    }),
    link.click(),
  ]);
}

function paidCostRow(page, reference) {
  return page.getByRole("row").filter({ hasText: `Ref: ${reference}` });
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

function phase(message) {
  process.stdout.write(`PASS ${message}\n`);
}
