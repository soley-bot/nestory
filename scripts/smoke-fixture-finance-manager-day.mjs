import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

export const financeManagerDaySmokeContract = Object.freeze({
  email: "finance.manager@nestory.com",
  allowed: Object.freeze([
    "unique-finance-manager-membership",
    "record-payment",
    "confirm-owner-direct-collection",
    "record-owner-invoice-payment",
    "record-capacity-withdrawal",
    "retry-current-rent",
    "review-paid-cost",
    "create-petty-cash-entry",
    "post-petty-cash-entry",
    "lock-financial-month",
    "read-ledger",
    "export-pdf",
    "export-excel",
  ]),
  forbidden: Object.freeze([
    "lease-configuration",
    "historical-rent-recovery",
    "submit-paid-cost",
    "finance-correction-or-reversal",
    "finance-correction-or-reversal-expense",
    "petty-cash-account-or-float-configuration",
    "petty-cash-rollover",
    "petty-cash-update",
    "petty-cash-void",
    "unlock-financial-month",
    "owner-statement-unavailable",
    "reconciliation-source-configuration",
  ]),
});

const safeFailureReasons = new Set([
  "database assertion failed",
  "export failed",
  "forbidden control visible",
  "login did not complete",
  "required control missing",
  "route did not load",
  "mutation failed",
]);

export function resolveFinanceManagerDayConfig(environment = process.env) {
  return {
    baseUrl: validateLocalBaseUrl(
      environment.NESTORY_BASE_URL ?? "http://localhost:3000",
    ),
    email: financeManagerDaySmokeContract.email,
    password: environment.NESTORY_TEST_PASSWORD ?? "123456789",
  };
}

export function formatFinanceManagerDayFailure(stage, reason) {
  const safeReason = safeFailureReasons.has(reason) ? reason : "journey failed";
  return `Finance Manager day ${stage}: ${safeReason}`;
}

async function main() {
  const config = resolveFinanceManagerDayConfig();
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");

  resetLocalFixture(cwd);
  assertDatabaseValue(
    cwd,
    `SELECT count(*)::text || '|' || min(membership.role)
       FROM public.organization_members AS membership
       JOIN auth.users AS users ON users.id = membership.user_id
      WHERE users.email = 'finance.manager@nestory.com'`,
    "1|finance_manager",
    "unique-finance-manager-membership",
  );
  pass("unique-finance-manager-membership");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();

  try {
    await authenticate(page, config);
    await assertFinanceWork(page, config.baseUrl);
    await assertPaidCostReview(page, config.baseUrl);
    await assertOwnerCash(page, config.baseUrl);
    await createAndPostPettyCash(page, config.baseUrl);
    await lockCurrentMonth(page, config.baseUrl);
    await assertReportExports(page, config.baseUrl);

    for (const [stage, sql, expected] of [
      [
        "record-payment",
        `SELECT count(*)::text || '|' || bool_and(created_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.tenant_invoice_payments WHERE reference = 'FM-DAY-TENANT' AND reversal_of_id IS NULL`,
        "1|true",
      ],
      [
        "confirm-owner-direct-collection",
        `SELECT count(*)::text || '|' || bool_and(created_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.owner_collection_confirmations WHERE reference = 'FM-DAY-OWNER-DIRECT' AND reversal_of_id IS NULL`,
        "1|true",
      ],
      [
        "record-owner-invoice-payment",
        `SELECT count(*)::text || '|' || bool_and(created_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.owner_payments WHERE reference = 'FM-DAY-OWNER-PAYMENT'`,
        "1|true",
      ],
      [
        "record-capacity-withdrawal",
        `SELECT count(*)::text || '|' || bool_and(created_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.property_withdrawals WHERE reference = 'FM-DAY-WITHDRAWAL'`,
        "1|true",
      ],
      [
        "review-paid-cost",
        `SELECT count(*)::text || '|' || bool_and(status = 'approved')::text || '|' || bool_and(reviewed_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.expense_submissions WHERE reference = 'GDN-PUMP-2088' AND source_type = 'general'`,
        "1|true|true",
      ],
      [
        "retry-current-rent",
        `SELECT count(*)::text || '|' || bool_and(resolved_at IS NOT NULL)::text || '|' || bool_and(last_attempted_by = '00000000-0000-0000-0000-000000000701'::uuid)::text FROM public.rent_generation_exceptions WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND billing_period_start = date_trunc('month', app_private.rent_business_date('00000000-0000-0000-0000-000000000001', now()))::date AND last_attempted_by = '00000000-0000-0000-0000-000000000701'::uuid`,
        "1|true|true",
      ],
    ]) {
      assertDatabaseValue(cwd, sql, expected, stage);
      pass(`${stage}-database-effect`);
    }

    assertDatabaseValue(
      cwd,
      `SELECT count(*)::text || '|' || count(entry.ledger_entry_id)::text || '|' || bool_and(entry.created_by = '00000000-0000-0000-0000-000000000701'::uuid)::text
         FROM public.petty_cash_entries AS entry
        WHERE entry.category = 'FM-DAY-CASH'`,
      "1|1|true",
      "post-petty-cash-entry",
    );
    assertDatabaseValue(
      cwd,
      `SELECT count(*)::text || '|' || bool_and(month_lock.is_locked)::text || '|' || bool_and(month_lock.locked_by = '00000000-0000-0000-0000-000000000701'::uuid)::text
         FROM public.financial_month_locks AS month_lock
        WHERE month_lock.organization_id = '00000000-0000-0000-0000-000000000001'
          AND month_lock.month_start = date_trunc('month', app_private.rent_business_date('00000000-0000-0000-0000-000000000001', now()))::date`,
      "1|true|true",
      "lock-financial-month",
    );
    pass("database-effects-verified");
  } finally {
    await context.close();
    await browser.close();
  }
}

function resetLocalFixture(cwd) {
  runCommand(cwd, ["run", "db:reset"]);
  runCommand(cwd, ["run", "db:test:fixture"]);
}

function runCommand(cwd, args) {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], {
        cwd,
        encoding: "utf8",
        shell: false,
      })
    : spawnSync("npm", args, { cwd, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(formatFinanceManagerDayFailure("fixture-reset", "database assertion failed"));
  }
}

function findDatabaseContainer(cwd) {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.error || result.status !== 0) {
    throw new Error(formatFinanceManagerDayFailure("database", "database assertion failed"));
  }
  return selectLocalDatabaseContainer(
    cwd,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

function assertDatabaseValue(cwd, sql, expected, stage) {
  const result = spawnSync(
    "docker",
    ["exec", findDatabaseContainer(cwd), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.error || result.status !== 0 || result.stdout.trim() !== expected) {
    throw new Error(formatFinanceManagerDayFailure(stage, "database assertion failed"));
  }
}

async function authenticate(page, config) {
  try {
    const response = await page.goto(new URL("/login", config.baseUrl).toString(), {
      timeout: 30_000,
      waitUntil: "networkidle",
    });
    if (!response?.ok()) throw new Error("login");
    await page.getByLabel("Email").fill(config.email);
    await page.getByLabel("Password").fill(config.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 }),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);
  } catch {
    throw new Error(formatFinanceManagerDayFailure("login", "login did not complete"));
  }
}

async function gotoPath(page, baseUrl, route, stage) {
  const response = await page.goto(new URL(route, baseUrl).toString(), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const pathName = new URL(page.url()).pathname;
  if (!response?.ok() || ["/login", "/no-access"].includes(pathName)) {
    throw new Error(formatFinanceManagerDayFailure(stage, "route did not load"));
  }
}

async function requireVisible(locator, stage) {
  try {
    await locator.first().waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    throw new Error(formatFinanceManagerDayFailure(stage, "required control missing"));
  }
  pass(stage);
}

async function requireAbsent(locator, stage) {
  if (await locator.count()) {
    throw new Error(formatFinanceManagerDayFailure(stage, "forbidden control visible"));
  }
  pass(stage);
}

async function assertFinanceWork(page, baseUrl) {
  await gotoPath(page, baseUrl, "/finance", "finance-work");
  await requireVisible(page.getByRole("button", { name: "Record payment" }), "record-payment-control");
  await requireVisible(page.getByText("Confirm owner collection", { exact: true }), "confirm-owner-direct-collection-control");
  await requireVisible(page.getByText("Owner payment", { exact: true }), "record-owner-invoice-payment-control");
  await requireVisible(page.getByRole("button", { name: /^Retry rent for / }), "retry-current-rent-control");
  await requireAbsent(page.getByRole("button", { name: "Set up" }), "lease-configuration");
  await requireAbsent(page.getByRole("button", { name: "Recover missed month" }), "historical-rent-recovery");
  await requireAbsent(page.getByRole("button", { name: /Reverse/i }), "finance-correction-or-reversal");

  const tenantRow = page.getByRole("row").filter({ hasText: "Tenant payment" }).first();
  await tenantRow.getByRole("button", { name: "Record" }).click();
  let dialog = page.getByRole("dialog", { name: "Record payment" });
  await dialog.locator('input[name="reconciliationSourceId"] + button').click();
  await page.getByRole("option").first().click();
  await dialog.locator('input[name="reference"]').fill("FM-DAY-TENANT");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await requireVisible(page.getByText("Payment recorded.", { exact: true }), "record-payment");

  const directRow = page.getByRole("row").filter({ hasText: "Confirm owner collection" }).first();
  await directRow.getByRole("button", { name: "Confirm" }).click();
  dialog = page.getByRole("dialog", { name: "Confirm owner collection" });
  await dialog.locator('input[name="reference"]').fill("FM-DAY-OWNER-DIRECT");
  await dialog.getByRole("button", { name: "Confirm collected" }).click();
  await requireVisible(page.getByText("Owner collection confirmed.", { exact: true }), "confirm-owner-direct-collection");

  const ownerRow = page.getByRole("row").filter({ hasText: "Owner payment" }).first();
  await ownerRow.getByRole("button", { name: "Record" }).click();
  dialog = page.getByRole("dialog", { name: "Owner payment" });
  await dialog.locator('input[name="reference"]').fill("FM-DAY-OWNER-PAYMENT");
  await dialog.getByRole("button", { name: "Record owner payment" }).click();
  await requireVisible(page.getByText("Owner payment recorded.", { exact: true }), "record-owner-invoice-payment");

  const retryButton = page.getByRole("button", { name: /^Retry rent for / });
  await retryButton.click();
  try {
    await retryButton.waitFor({ state: "hidden", timeout: 15_000 });
  } catch {
    throw new Error(formatFinanceManagerDayFailure("retry-current-rent", "resolved exception remained actionable"));
  }
  pass("retry-current-rent");
}

async function assertPaidCostReview(page, baseUrl) {
  await gotoPath(page, baseUrl, "/bills-expenses", "paid-cost-review");
  await requireVisible(page.getByRole("button", { name: /^Approve / }), "review-paid-cost-control");
  await requireAbsent(page.getByRole("button", { name: "Add expense" }), "submit-paid-cost");
  await requireAbsent(page.getByRole("button", { name: /Reverse/i }), "finance-correction-or-reversal-expense");

  const paidCostRow = page.getByRole("row").filter({
    hasNotText: "Maintenance cost",
    hasText: "Ref: GDN-PUMP-2088",
  });
  await paidCostRow.getByRole("button", { name: /^Approve / }).click();
  const dialog = page.getByRole("dialog", { name: "Approve expense" });
  await dialog.getByRole("textbox", { name: "Review note" }).fill("FM day review");
  await dialog.getByRole("button", { name: "Approve expense" }).click();
  await requireVisible(page.getByText("Expense approved and recorded.", { exact: true }), "review-paid-cost");
}

async function assertOwnerCash(page, baseUrl) {
  await gotoPath(page, baseUrl, "/balances", "owner-balances");
  await requireVisible(page.getByRole("button", { name: "Withdrawal" }), "record-capacity-withdrawal-control");
  await page.getByRole("button", { name: "Withdrawal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Owner withdrawal" });
  await dialog.locator('input[name="amount"]').fill("1");
  await dialog.locator('input[name="reference"]').fill("FM-DAY-WITHDRAWAL");
  await dialog.getByRole("button", { name: "Record withdrawal" }).click();
  await requireVisible(page.getByText("Withdrawal recorded.", { exact: true }), "record-capacity-withdrawal");
}

async function createAndPostPettyCash(page, baseUrl) {
  await gotoPath(page, baseUrl, "/petty-cash", "petty-cash");
  await requireVisible(page.getByRole("button", { name: "Add cash row" }), "create-petty-cash-entry-control");
  await requireAbsent(page.getByRole("button", { name: "Add account" }), "petty-cash-account-or-float-configuration");
  await requireAbsent(page.getByRole("button", { name: "Open next month" }), "petty-cash-rollover");

  await page.getByRole("button", { name: "Add cash row" }).first().click();
  await chooseSelect(page, "Status", "Cleared");
  await page.getByRole("combobox", { name: "Property" }).click();
  await page.getByRole("option", { name: /Garden Court/ }).click();
  await page.getByRole("textbox", { name: "Category" }).fill("FM-DAY-CASH");
  await page.getByRole("textbox", { name: "Amount", exact: true }).fill("11.25");
  const paidTo = page.getByRole("combobox", { name: "Petty cash recipient" });
  await paidTo.fill("External party");
  await page.getByRole("option", { name: /External party/ }).click();
  await page.getByRole("textbox", { name: "External party name" }).fill("FM day vendor");
  await page.getByRole("textbox", { name: "Description" }).fill("Finance Manager daily field purchase");
  await page.getByRole("textbox", { name: "Receipt / invoice reference" }).fill("FM-DAY-001");
  await page.getByRole("button", { name: "Add cash row" }).last().click();
  await requireVisible(page.getByText("Petty cash row added.", { exact: true }), "create-petty-cash-entry");

  await page.getByRole("button", { name: "Preview FM-DAY-CASH" }).click();
  const inspector = page.getByRole("dialog", { name: "FM-DAY-CASH cash quick view" });
  await requireAbsent(inspector.getByRole("button", { name: "Edit" }), "petty-cash-update");
  await requireAbsent(inspector.getByRole("button", { name: "Void" }), "petty-cash-void");
  await inspector.getByRole("button", { name: "Post to ledger" }).click();
  await page.getByRole("dialog", { name: "Post to ledger" }).getByRole("button", { name: "Post to ledger" }).click();
  await requireVisible(page.getByText("Petty cash expense posted to ledger.", { exact: true }), "post-petty-cash-entry");
}

async function chooseSelect(page, label, option) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function lockCurrentMonth(page, baseUrl) {
  await gotoPath(page, baseUrl, "/ledger", "ledger");
  await requireVisible(page.getByRole("heading", { name: "Financial Ledger" }), "read-ledger");
  await page.getByRole("button", { name: "Month lock" }).click();
  const state = page.getByRole("combobox", { name: "State" });
  await state.click();
  await requireAbsent(page.getByRole("option", { name: "Unlock" }), "unlock-financial-month");
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Reason" }).fill("Finance Manager daily close smoke");
  await page.getByRole("button", { name: "Update month" }).click();
  await requireVisible(page.getByText("Month locked.", { exact: true }), "lock-financial-month");
}

async function assertReportExports(page, baseUrl) {
  await gotoPath(page, baseUrl, "/reports/unit-profit-loss", "report-detail");
  await requireAbsent(page.getByText("Owner Statement", { exact: true }), "owner-statement-unavailable");
  await page.getByRole("button", { name: "Export" }).click();
  const pdfHref = await page.getByRole("menuitem", { name: "PDF" }).getAttribute("href");
  const excelHref = await page.getByRole("menuitem", { name: "Excel" }).getAttribute("href");
  for (const [stage, href, contentType] of [
    ["export-pdf", pdfHref, "application/pdf"],
    ["export-excel", excelHref, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ]) {
    const response = href ? await page.request.get(new URL(href, baseUrl).toString()) : null;
    if (!response?.ok() || !response.headers()["content-type"]?.includes(contentType)) {
      throw new Error(formatFinanceManagerDayFailure(stage, "export failed"));
    }
    pass(stage);
  }
  await requireAbsent(page.getByRole("button", { name: /reconciliation source/i }), "reconciliation-source-configuration");
}

function pass(stage) {
  process.stdout.write(`PASS Finance Manager day ${stage}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Finance Manager day journey failed"}\n`);
    process.exitCode = 1;
  });
}
