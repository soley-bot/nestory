import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

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
    "navigate-to-reports",
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
  replayCoverage: Object.freeze({
    sameRequestKey: Object.freeze([
      "record-payment",
      "confirm-owner-direct-collection",
      "record-owner-invoice-payment",
      "record-capacity-withdrawal",
      "review-paid-cost",
      "create-petty-cash-entry",
    ]),
    naturalIdentity: Object.freeze([
      "retry-current-rent",
      "post-petty-cash-entry",
    ]),
    rejectedReplay: Object.freeze(["lock-financial-month"]),
    unavailable: Object.freeze([]),
  }),
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

const localFixturePassword = ["123", "456", "789"].join("");

export function resolveFinanceManagerDayConfig(environment = process.env) {
  return {
    baseUrl: validateLocalBaseUrl(
      environment.NESTORY_BASE_URL ?? "http://localhost:3000",
    ),
    email: financeManagerDaySmokeContract.email,
    password: environment.NESTORY_TEST_PASSWORD ?? localFixturePassword,
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
    const financeRequests = await assertFinanceWork(page, config.baseUrl);
    const paidCostRequest = await assertPaidCostReview(page, config.baseUrl);
    const ownerCashRequest = await assertOwnerCash(page, config.baseUrl);
    const pettyCashRequests = await createAndPostPettyCash(page, config.baseUrl);
    const authenticatedRpc = await createAuthenticatedRpcClient(cwd, config);
    await replayOrdinaryFinanceRequests(cwd, authenticatedRpc, {
      ...financeRequests,
      ownerCashRequest,
      paidCostRequest,
      ...pettyCashRequests,
    });
    const monthLockRequest = await lockCurrentMonth(page, config.baseUrl);
    await assertRejectedMonthLockReplay(authenticatedRpc, monthLockRequest);
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
  const actual = queryDatabaseValue(cwd, sql, stage);
  if (actual !== expected) {
    throw new Error(formatFinanceManagerDayFailure(stage, "database assertion failed"));
  }
}

function queryDatabaseValue(cwd, sql, stage) {
  const result = spawnSync(
    "docker",
    ["exec", findDatabaseContainer(cwd), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.error || result.status !== 0) {
    throw new Error(formatFinanceManagerDayFailure(stage, "database assertion failed"));
  }
  return result.stdout.trim();
}

async function createAuthenticatedRpcClient(cwd, config) {
  const runtime = readLocalSupabaseRuntime(cwd);
  const client = createClient(runtime.apiUrl, runtime.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  if (error) {
    throw new Error(formatFinanceManagerDayFailure("rpc-login", "login did not complete"));
  }
  return client;
}

function readLocalSupabaseRuntime(cwd) {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(
        process.execPath,
        [npmCli, "exec", "--", "supabase", "status", "-o", "env"],
        { cwd, encoding: "utf8", shell: false },
      )
    : spawnSync(
        "npx",
        ["supabase", "status", "-o", "env"],
        { cwd, encoding: "utf8", shell: false },
      );
  if (result.error || result.status !== 0) {
    throw new Error(formatFinanceManagerDayFailure("rpc-runtime", "database assertion failed"));
  }
  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );
  const apiUrl = values.API_URL;
  const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;
  if (!apiUrl || !anonKey) {
    throw new Error(formatFinanceManagerDayFailure("rpc-runtime", "database assertion failed"));
  }
  return { anonKey, apiUrl };
}

async function readFormRequest(container) {
  const entries = await container.evaluate((element) => {
    const form = element instanceof HTMLFormElement
      ? element
      : element.querySelector("form");
    if (!form) throw new Error("Form not found");
    return Array.from(new FormData(form).entries(), ([key, value]) => [
      key,
      typeof value === "string" ? value : value.name,
    ]);
  });
  return entries;
}

function requestValue(entries, name) {
  return entries.find(([key]) => key === name)?.[1] ?? "";
}

function requestNumber(entries, name) {
  return Number(requestValue(entries, name));
}

function requestAllocations(entries) {
  return entries
    .filter(([key]) => key.startsWith("allocation:"))
    .map(([key, value]) => ({
      amount: Number(value),
      lineId: key.slice("allocation:".length),
    }))
    .filter((allocation) => allocation.amount > 0);
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
  const tenantPaymentRequest = await readFormRequest(dialog);
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await requireVisible(page.getByText("Payment recorded.", { exact: true }), "record-payment");

  const directRow = page.getByRole("row").filter({ hasText: "Confirm owner collection" }).first();
  await directRow.getByRole("button", { name: "Confirm" }).click();
  dialog = page.getByRole("dialog", { name: "Confirm owner collection" });
  await dialog.locator('input[name="reference"]').fill("FM-DAY-OWNER-DIRECT");
  const ownerCollectionRequest = await readFormRequest(dialog);
  await dialog.getByRole("button", { name: "Confirm collected" }).click();
  await requireVisible(page.getByText("Owner collection confirmed.", { exact: true }), "confirm-owner-direct-collection");

  const ownerRow = page.getByRole("row").filter({ hasText: "Owner payment" }).first();
  await ownerRow.getByRole("button", { name: "Record" }).click();
  dialog = page.getByRole("dialog", { name: "Owner payment" });
  await dialog.locator('input[name="reference"]').fill("FM-DAY-OWNER-PAYMENT");
  const ownerPaymentRequest = await readFormRequest(dialog);
  await dialog.getByRole("button", { name: "Record owner payment" }).click();
  await requireVisible(page.getByText("Owner payment recorded.", { exact: true }), "record-owner-invoice-payment");

  const retryButton = page.getByRole("button", { name: /^Retry rent for / });
  const retryRequest = await readFormRequest(
    retryButton.locator("xpath=ancestor::form"),
  );
  await retryButton.click();
  try {
    await retryButton.waitFor({ state: "hidden", timeout: 15_000 });
  } catch {
    throw new Error(formatFinanceManagerDayFailure("retry-current-rent", "resolved exception remained actionable"));
  }
  pass("retry-current-rent");
  return {
    ownerCollectionRequest,
    ownerPaymentRequest,
    retryRequest,
    tenantPaymentRequest,
  };
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
  const paidCostRequest = await readFormRequest(dialog);
  await dialog.getByRole("button", { name: "Approve expense" }).click();
  await requireVisible(page.getByText("Expense approved and recorded.", { exact: true }), "review-paid-cost");
  return paidCostRequest;
}

async function assertOwnerCash(page, baseUrl) {
  await gotoPath(page, baseUrl, "/balances", "owner-balances");
  await requireVisible(page.getByRole("button", { name: "Withdrawal" }), "record-capacity-withdrawal-control");
  await page.getByRole("button", { name: "Withdrawal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Owner withdrawal" });
  await dialog.locator('input[name="amount"]').fill("1");
  await dialog.locator('input[name="reference"]').fill("FM-DAY-WITHDRAWAL");
  const ownerCashRequest = await readFormRequest(dialog);
  await dialog.getByRole("button", { name: "Record withdrawal" }).click();
  await requireVisible(page.getByText("Withdrawal recorded.", { exact: true }), "record-capacity-withdrawal");
  return ownerCashRequest;
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
  const addCashRowButton = page.getByRole("button", { name: "Add cash row" }).last();
  const pettyCashCreateRequest = await readFormRequest(
    addCashRowButton.locator("xpath=ancestor::form"),
  );
  await addCashRowButton.click();
  await requireVisible(page.getByText("Petty cash row added.", { exact: true }), "create-petty-cash-entry");

  await page.getByRole("button", { name: "Preview FM-DAY-CASH" }).click();
  const inspector = page.getByRole("dialog", { name: "FM-DAY-CASH cash quick view" });
  await requireAbsent(inspector.getByRole("button", { name: "Edit" }), "petty-cash-update");
  await requireAbsent(inspector.getByRole("button", { name: "Void" }), "petty-cash-void");
  await inspector.getByRole("button", { name: "Post to ledger" }).click();
  const postDialog = page.getByRole("dialog", { name: "Post to ledger" });
  const pettyCashPostRequest = await readFormRequest(postDialog);
  await postDialog.getByRole("button", { name: "Post to ledger" }).click();
  await requireVisible(page.getByText("Petty cash expense posted to ledger.", { exact: true }), "post-petty-cash-entry");
  return { pettyCashCreateRequest, pettyCashPostRequest };
}

async function replayOrdinaryFinanceRequests(cwd, client, requests) {
  const organizationId = "00000000-0000-0000-0000-000000000001";
  const tenantAllocations = requestAllocations(requests.tenantPaymentRequest);
  await assertStableRpcReplay(
    cwd,
    client,
    "record-payment",
    "record_tenant_invoice_payment",
    {
      p_allocations: tenantAllocations.length ? tenantAllocations : null,
      p_amount: requestNumber(requests.tenantPaymentRequest, "amount"),
      p_idempotency_key: requestValue(requests.tenantPaymentRequest, "idempotencyKey"),
      p_invoice_id: requestValue(requests.tenantPaymentRequest, "invoiceId"),
      p_organization_id: organizationId,
      p_received_date: requestValue(requests.tenantPaymentRequest, "settlementDate"),
      p_reconciliation_source_id: requestValue(
        requests.tenantPaymentRequest,
        "reconciliationSourceId",
      ),
      p_reference: requestValue(requests.tenantPaymentRequest, "reference"),
    },
    `SELECT id::text FROM public.tenant_invoice_payments WHERE reference = 'FM-DAY-TENANT' AND reversal_of_id IS NULL`,
  );

  const collectionAllocations = requestAllocations(requests.ownerCollectionRequest);
  await assertStableRpcReplay(
    cwd,
    client,
    "confirm-owner-direct-collection",
    "confirm_owner_collected_rent",
    {
      p_allocations: collectionAllocations.length ? collectionAllocations : null,
      p_amount: requestNumber(requests.ownerCollectionRequest, "amount"),
      p_confirmed_date: requestValue(requests.ownerCollectionRequest, "settlementDate"),
      p_idempotency_key: requestValue(requests.ownerCollectionRequest, "idempotencyKey"),
      p_invoice_id: requestValue(requests.ownerCollectionRequest, "invoiceId"),
      p_organization_id: organizationId,
      p_reference: requestValue(requests.ownerCollectionRequest, "reference"),
    },
    `SELECT id::text FROM public.owner_collection_confirmations WHERE reference = 'FM-DAY-OWNER-DIRECT' AND reversal_of_id IS NULL`,
  );

  await assertStableRpcReplay(
    cwd,
    client,
    "record-owner-invoice-payment",
    "record_owner_invoice_payment",
    {
      p_amount: requestNumber(requests.ownerPaymentRequest, "amount"),
      p_idempotency_key: requestValue(requests.ownerPaymentRequest, "idempotencyKey"),
      p_organization_id: organizationId,
      p_owner_invoice_id: requestValue(requests.ownerPaymentRequest, "ownerInvoiceId"),
      p_received_date: requestValue(requests.ownerPaymentRequest, "receivedDate"),
      p_reference: requestValue(requests.ownerPaymentRequest, "reference"),
    },
    `SELECT id::text FROM public.owner_payments WHERE reference = 'FM-DAY-OWNER-PAYMENT'`,
  );

  await assertStableRpcReplay(
    cwd,
    client,
    "record-capacity-withdrawal",
    "record_property_withdrawal",
    {
      p_amount: requestNumber(requests.ownerCashRequest, "amount"),
      p_idempotency_key: requestValue(requests.ownerCashRequest, "idempotencyKey"),
      p_organization_id: organizationId,
      p_property_id: requestValue(requests.ownerCashRequest, "propertyId"),
      p_reference: requestValue(requests.ownerCashRequest, "reference"),
      p_withdrawal_date: requestValue(requests.ownerCashRequest, "withdrawalDate"),
    },
    `SELECT id::text FROM public.property_withdrawals WHERE reference = 'FM-DAY-WITHDRAWAL'`,
  );

  await assertStableRpcReplay(
    cwd,
    client,
    "review-paid-cost",
    "review_expense",
    {
      p_decision: requestValue(requests.paidCostRequest, "decision"),
      p_idempotency_key: requestValue(requests.paidCostRequest, "idempotencyKey"),
      p_organization_id: organizationId,
      p_reason: requestValue(requests.paidCostRequest, "reason") || null,
      p_reconciliation_source_id:
        requestValue(requests.paidCostRequest, "reconciliationSourceId") || null,
      p_submission_id: requestValue(requests.paidCostRequest, "submissionId"),
    },
    `SELECT id::text FROM public.expense_submissions WHERE reference = 'GDN-PUMP-2088' AND source_type = 'general'`,
  );

  const petty = requests.pettyCashCreateRequest;
  const counterpartyIsLinked = requestValue(petty, "counterpartyMode") === "linked";
  await assertStableRpcReplay(
    cwd,
    client,
    "create-petty-cash-entry",
    "create_petty_cash_entry",
    {
      p_account_id: requestValue(petty, "accountId"),
      p_amount: requestNumber(petty, "amount"),
      p_category: requestValue(petty, "category"),
      p_clear_date: requestValue(petty, "clearDate") || null,
      p_company_loss_amount: requestNumber(petty, "companyLossAmount") || 0,
      p_counterparty_person_id: counterpartyIsLinked
        ? requestValue(petty, "counterpartyPersonId")
        : null,
      p_description: requestValue(petty, "description"),
      p_economic_scope: requestValue(petty, "economicScope") || "property_expense",
      p_entry_kind: requestValue(petty, "entryKind"),
      p_idempotency_key: requestValue(petty, "idempotencyKey"),
      p_invoice_date: requestValue(petty, "invoiceDate"),
      p_organization_id: organizationId,
      p_owner_bill_status: requestValue(petty, "ownerBillStatus") || "not_billable",
      p_owner_reimbursable_amount:
        requestNumber(petty, "ownerReimbursableAmount") || 0,
      p_owner_reimbursed_amount: requestNumber(petty, "ownerReimbursedAmount") || 0,
      p_period_id: requestValue(petty, "periodId"),
      p_property_id: requestValue(petty, "propertyId") || null,
      p_receipt_reference: requestValue(petty, "receiptReference") || null,
      p_remark: requestValue(petty, "remark") || null,
      p_status: requestValue(petty, "status"),
      p_supplier: counterpartyIsLinked ? null : requestValue(petty, "supplier"),
      p_unit_id: requestValue(petty, "unitId") || null,
    },
    `SELECT id::text FROM public.petty_cash_entries WHERE category = 'FM-DAY-CASH'`,
  );

  await assertStableRpcReplay(
    cwd,
    client,
    "post-petty-cash-entry",
    "post_petty_cash_entry",
    {
      p_entry_id: requestValue(requests.pettyCashPostRequest, "entryId"),
      p_organization_id: organizationId,
    },
    `SELECT ledger_entry_id::text FROM public.petty_cash_entries WHERE category = 'FM-DAY-CASH'`,
  );

  await assertStableRpcReplay(
    cwd,
    client,
    "retry-current-rent",
    "recover_rent_generation_exception",
    {
      p_exception_id: requestValue(requests.retryRequest, "exceptionId"),
      p_organization_id: organizationId,
    },
    `SELECT resolved_invoice_id::text FROM public.rent_generation_exceptions WHERE id = '${requestValue(requests.retryRequest, "exceptionId")}'`,
  );
}

async function assertStableRpcReplay(cwd, client, stage, rpc, args, sourceSql) {
  const originalSourceId = queryDatabaseValue(cwd, sourceSql, stage);
  if (!originalSourceId) {
    throw new Error(formatFinanceManagerDayFailure(stage, "database assertion failed"));
  }
  const { error } = await client.rpc(rpc, args);
  if (error) {
    throw new Error(formatFinanceManagerDayFailure(stage, "mutation failed"));
  }
  const replaySourceId = queryDatabaseValue(cwd, sourceSql, stage);
  if (replaySourceId !== originalSourceId) {
    throw new Error(formatFinanceManagerDayFailure(stage, "database assertion failed"));
  }
  pass(`${stage}-same-request-replay`);
}

async function assertRejectedMonthLockReplay(client, request) {
  const { error } = await client.rpc("set_financial_month_lock", {
    p_locked: requestValue(request, "lockState") === "locked",
    p_month_start: `${requestValue(request, "periodStart")}-01`,
    p_organization_id: "00000000-0000-0000-0000-000000000001",
    p_reason: requestValue(request, "reason"),
  });
  if (!error?.message.includes("Financial month is already locked")) {
    throw new Error(formatFinanceManagerDayFailure("lock-financial-month", "mutation failed"));
  }
  pass("lock-financial-month-rejected-replay");
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
  const monthLockRequest = await readFormRequest(
    page.getByRole("dialog", { name: "Month lock" }),
  );
  await page.getByRole("button", { name: "Update month" }).click();
  await requireVisible(page.getByText("Month locked.", { exact: true }), "lock-financial-month");
  return monthLockRequest;
}

async function assertReportExports(page, baseUrl) {
  const globalNavigation = page.getByRole("navigation", {
    name: "Global navigation",
  });
  await requireVisible(
    globalNavigation.getByRole("link", { name: "Reports", exact: true }),
    "reports-navigation-control",
  );
  await globalNavigation.getByRole("link", { name: "Reports", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/reports", { timeout: 20_000 });
  pass("navigate-to-reports");
  await page.getByRole("link", { name: /Monthly Unit Profit & Loss/ }).click();
  await page.waitForURL((url) => url.pathname === "/reports/unit-profit-loss", {
    timeout: 20_000,
  });
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