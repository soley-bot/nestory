import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";
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
const superAdminUserId = "00000000-0000-0000-0000-000000000101";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";
const riversidePropertyId = "10000000-0000-0000-0000-000000000002";
const riversideOwnerId = "80000000-0000-0000-0000-000000000005";
const gardenPropertyId = "10000000-0000-0000-0000-000000000003";
const gardenSuccessorId = "80000000-0000-0000-0000-000000000012";
const pendingDepositReference = "BROWSER-OWNER-BALANCE-PENDING";
const contributionReason = "Browser checked owner contribution";
const distributionReference = "BROWSER-OWNER-BALANCE-DISTRIBUTION";
const distributionReversalReason = "Browser safe distribution reversal";

const currentDate = dbScalar("SELECT current_date::text;");
const currentMonth = currentDate.slice(0, 7);
const currentMonthStart = `${currentMonth}-01`;
const nextMonthStart = dbScalar(
  "SELECT (date_trunc('month', current_date) + interval '1 month')::date::text;",
);
const nextMonth = nextMonthStart.slice(0, 7);

let browser;
try {
  loadBaseline();
  const pendingSourceLineId = preparePendingDepositSource();
  browser = await chromium.launch({ headless: true });

  await withBalanceActor(
    actors.finance_manager,
    {
      month: currentMonth,
      ownerPersonId: centralOwnerId,
      propertyId: centralPropertyId,
    },
    async (page) => {
      await assertOpeningComponentsVisible(page);
      phase("opening components visible");

      const pendingRow = page.getByTestId(`owner-remediation-${pendingSourceLineId}`);
      await pendingRow.getByText("Ready", { exact: true }).waitFor();
      await pendingRow.getByRole("button", { name: "Assign to owner balance" }).click();
      await waitForDb("pending source allocated", `
        SELECT count(*) = 1
        FROM public.owner_event_allocation_sets
        WHERE organization_id = '${organizationId}'
          AND source_type = 'security_deposit_receipt'
          AND source_line_id = '${pendingSourceLineId}';
      `);
      phase("pending source allocated");
      await page.reload({ waitUntil: "networkidle" });

      const contribution = formByHeading(page, "Owner contribution");
      await contribution.getByLabel("Amount").fill("125.25");
      await contribution.getByLabel("Date").fill(currentDate);
      await contribution.getByLabel("Reason").fill(contributionReason);
      await contribution.getByRole("button", { name: "Record owner contribution" }).click();
      await waitForDb("checked contribution recorded", `
        SELECT count(*) = 1
        FROM public.owner_cash_events
        WHERE organization_id = '${organizationId}'
          AND property_id = '${centralPropertyId}'
          AND owner_person_id = '${centralOwnerId}'
          AND event_type = 'owner_contribution'
          AND event_date = '${currentDate}'
          AND amount = 125.25
          AND reason = '${contributionReason}';
      `);
      phase("checked contribution recorded");
      await page.reload({ waitUntil: "networkidle" });

      const distribution = formByHeading(page, "Owner distribution");
      await distribution.getByLabel("Amount").fill("80.00");
      await distribution.getByLabel("Date").fill(currentDate);
      await distribution.getByLabel("Reference").fill(distributionReference);
      await distribution.getByRole("button", { name: "Record owner distribution" }).click();
      await waitForDb("distribution recorded", `
        SELECT count(*) = 1
        FROM public.property_withdrawals
        WHERE organization_id = '${organizationId}'
          AND reference = '${distributionReference}'
          AND reversal_of_id IS NULL
          AND amount = 80.00;
      `);
      const withdrawalId = dbScalar(`
        SELECT id::text
        FROM public.property_withdrawals
        WHERE organization_id = '${organizationId}'
          AND reference = '${distributionReference}'
          AND reversal_of_id IS NULL;
      `);
      await page.reload({ waitUntil: "networkidle" });

      const reversal = formByHeading(page, "Reverse owner distribution");
      await reversal.getByLabel("Owner distribution reference").fill(withdrawalId);
      await reversal.getByLabel("Reversal date").fill(currentDate);
      await reversal.getByLabel("Reason").fill(distributionReversalReason);
      await reversal.getByRole("button", { name: "Reverse owner distribution" }).click();
      await waitForDb("safe distribution reversed", `
        SELECT
          (SELECT count(*) = 1
           FROM public.property_withdrawals
           WHERE organization_id = '${organizationId}'
             AND reversal_of_id = '${withdrawalId}'
             AND amount = 80.00
             AND reversal_reason = '${distributionReversalReason}')
          AND
          (SELECT count(*) > 0
           FROM public.owner_cash_source_consumptions AS consumption
           JOIN public.owner_component_movements AS consumer_movement
             ON consumer_movement.id = consumption.consumer_movement_id
           JOIN public.owner_event_owner_allocations AS consumer_owner
             ON consumer_owner.id = consumer_movement.owner_event_owner_allocation_id
           JOIN public.owner_event_allocation_sets AS consumer_set
             ON consumer_set.id = consumer_owner.allocation_set_id
           WHERE consumption.organization_id = '${organizationId}'
             AND consumer_set.source_type = 'owner_distribution'
             AND consumer_set.source_id = '${withdrawalId}')
          AND
          (SELECT coalesce(sum(movement.signed_amount), 0) = 0.00
           FROM public.owner_component_movements AS movement
           JOIN public.owner_event_owner_allocations AS owner_allocation
             ON owner_allocation.id = movement.owner_event_owner_allocation_id
           JOIN public.owner_event_allocation_sets AS allocation_set
             ON allocation_set.id = owner_allocation.allocation_set_id
           WHERE movement.organization_id = '${organizationId}'
             AND (
               allocation_set.source_id = '${withdrawalId}'
               OR allocation_set.reversal_of_allocation_set_id = (
                 SELECT id FROM public.owner_event_allocation_sets
                 WHERE organization_id = '${organizationId}'
                   AND source_type = 'owner_distribution'
                   AND source_id = '${withdrawalId}'
               )
             ));
      `);
      phase("safe distribution reversed");
      await page.reload({ waitUntil: "networkidle" });

      await page.getByRole("button", { name: "Generate month" }).click();
      await waitForExactPeriod("current month regenerated", currentMonthStart);
      phase("current month regenerated");

      await loadBalanceScope(page, {
        month: nextMonth,
        ownerPersonId: centralOwnerId,
        propertyId: centralPropertyId,
      });
      await page.getByRole("button", { name: "Generate month" }).click();
      await waitForExactPeriod("next month regenerated", nextMonthStart);
      phase("next month regenerated");
      await page.reload({ waitUntil: "networkidle" });
      await assertPeriodTable(page, nextMonthStart, {
        "IPS due to owner": "USD 200.50",
        "IPS-held owner cash": "USD 1,980.25",
        "Owner due to IPS": "USD 0.00",
        "Security-deposit custody": "USD 870.00",
      });
      phase("exact two-month balances");

      assert.equal(
        await page.getByRole("button", { name: "Transfer balance" }).count(),
        0,
        "Finance Manager received Super Admin transfer authority",
      );
    },
  );

  await withBalanceActor(
    actors.finance_manager,
    {
      month: currentMonth,
      ownerPersonId: riversideOwnerId,
      propertyId: riversidePropertyId,
    },
    async (page) => {
      const blocked = page.getByRole("row").filter({ hasText: "Management fee occurrence" });
      await blocked.getByText("Technical details", { exact: true }).click();
      await blocked.getByText("owner_share_total_not_100", { exact: true }).waitFor();
      await blocked.getByText("USD 116.00", { exact: true }).waitFor();
    },
  );

  await withBalanceActor(
    actors.super_admin,
    {
      month: nextMonth,
      ownerPersonId: gardenSuccessorId,
      propertyId: gardenPropertyId,
    },
    async (page) => {
      await page.getByText("Owner component transfer", { exact: true }).first().waitFor();
      await assertPeriodTable(page, nextMonthStart, {
        "IPS due to owner": "USD 0.00",
        "IPS-held owner cash": "USD 500.00",
        "Owner due to IPS": "USD 102.80",
        "Security-deposit custody": "USD 0.00",
      });
      assert.equal(
        await page.getByRole("button", { name: "Transfer balance" }).count(),
        1,
        "Super Admin transfer command was not visible",
      );
      phase("explicit transfer source visible");
    },
  );

  await withBalanceActor(
    actors.finance_member,
    {
      month: currentMonth,
      ownerPersonId: centralOwnerId,
      propertyId: centralPropertyId,
    },
    async (page) => {
      for (const action of [
        "Assign to owner balance",
        "Generate month",
        "Record owner contribution",
        "Record owner reimbursement",
        "Record owner distribution",
        "Reverse owner invoice payment",
        "Reverse owner distribution",
        "Transfer balance",
      ]) {
        assert.equal(await page.getByRole("button", { name: action }).count(), 0, `${action} leaked to Finance Member`);
      }
      phase("Finance Member mutation denial");
    },
  );

  for (const deniedRole of [actors.operations_manager, actors.operations_member]) {
    await withShellActor(deniedRole, async (page) => {
      assert.equal(
        await page.locator('nav[aria-label="Global navigation"] a[href="/balances"]').count(),
        0,
        `${deniedRole} saw Owner balances`,
      );
      const response = await page.goto(`${baseUrl}/balances`, { waitUntil: "networkidle" });
      const pathName = new URL(page.url()).pathname;
      assert.ok(
        pathName !== "/balances" || [401, 403, 404].includes(response?.status() ?? 0),
        `${deniedRole} reached the protected Owner balances route`,
      );
      phase("Operations role route denial");
    });
  }

  assertDbPhase("exact two-month balances", `
    SELECT count(*) = 8
      AND bool_and(period.status = 'ready')
    FROM public.owner_balance_periods AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
    WHERE period.organization_id = '${organizationId}'
      AND period.property_id = '${centralPropertyId}'
      AND period.owner_person_id = '${centralOwnerId}'
      AND period.month_start IN ('${currentMonthStart}', '${nextMonthStart}')
      AND (
        (component.component = 'ips_held_owner_cash' AND component.closing_amount = 1980.25)
        OR (component.component = 'owner_due_to_ips' AND component.closing_amount = 0.00)
        OR (component.component = 'ips_due_to_owner' AND component.closing_amount = 200.50)
        OR (component.component = 'security_deposit_custody' AND component.closing_amount = 870.00)
      );
  `);

  process.stdout.write(
    "PASS one authenticated owner-balance lifecycle: opening, sources, allocation/remediation, safe reversal/distribution, transfer lineage, two-month exact roll-forward, and role denial\n",
  );
} finally {
  await browser?.close();
  loadBaseline();
}

async function withBalanceActor(email, scope, run) {
  return withShellActor(email, async (page) => {
    await openOwnerBalancesFromVisibleFinance(page);
    await loadBalanceScope(page, scope);
    await run(page);
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
        waitUntil: "networkidle",
      });
    } catch {
      const alert = page.getByRole("alert");
      const detail = (await alert.count()) > 0
        ? await alert.first().innerText()
        : "login remained on /login";
      throw new Error(`${email}: ${detail}`);
    }
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname !== "/workspace", {
      waitUntil: "networkidle",
    });
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
    page.waitForURL((url) => url.pathname === "/balances", {
      waitUntil: "networkidle",
    }),
    link.click(),
  ]);
  await page.getByRole("heading", { name: "Owner balances", exact: true }).waitFor();
}

async function loadBalanceScope(page, scope) {
  const scopeForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Load balances" }),
  }).first();
  await setHiddenControlValue(scopeForm, "propertyId", scope.propertyId);
  await setHiddenControlValue(scopeForm, "ownerPersonId", scope.ownerPersonId);
  await scopeForm.getByLabel("Month").fill(scope.month);
  await Promise.all([
    page.waitForURL((url) =>
      url.pathname === "/balances" &&
      url.searchParams.get("propertyId") === scope.propertyId &&
      url.searchParams.get("ownerPersonId") === scope.ownerPersonId &&
      url.searchParams.get("month") === scope.month,
    ),
    scopeForm.getByRole("button", { name: "Load balances" }).click(),
  ]);
}

async function assertOpeningComponentsVisible(page) {
  const region = page.getByRole("region", { name: "Opening balance components" });
  const expected = {
    "IPS due to owner": "$240.50",
    "IPS-held owner cash": "$1250.00",
    "Owner due to IPS": "$0.00",
    "Security-deposit custody": "$800.00",
  };
  for (const [component, amount] of Object.entries(expected)) {
    const row = region.getByRole("row").filter({ hasText: component });
    await row.getByText(amount, { exact: true }).waitFor();
  }
}

async function assertPeriodTable(page, monthStart, expected) {
  const period = page.getByTestId(`owner-period-${monthStart}`);
  await period.getByText(/Status:\s*ready/i).waitFor();
  for (const [component, amount] of Object.entries(expected)) {
    const row = period.getByRole("row").filter({ hasText: component });
    const values = await row.getByText(amount, { exact: true }).count();
    assert.ok(values >= 1, `${monthStart} ${component} did not show ${amount}`);
  }
}

function formByHeading(page, heading) {
  return page.locator("form").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  }).first();
}

function preparePendingDepositSource() {
  dbExec(authenticatedDbSql(superAdminUserId, `
    SELECT public.record_lease_deposit_event(
      '${organizationId}', deposit.id, 'received', current_date, 10.00,
      '${pendingDepositReference}'
    )
    FROM public.lease_deposits AS deposit
    JOIN public.leases AS lease
      ON lease.organization_id = deposit.organization_id
     AND lease.id = deposit.lease_id
    WHERE deposit.organization_id = '${organizationId}'
      AND lease.property_id = '${centralPropertyId}'
      AND deposit.amount = 850.00;
  `));
  const sourceLineId = dbScalar(`
    SELECT id::text FROM public.lease_deposit_events
    WHERE organization_id = '${organizationId}'
      AND reference = '${pendingDepositReference}';
  `);
  assert.match(sourceLineId, /^[0-9a-f-]{36}$/);
  return sourceLineId;
}

function authenticatedDbSql(actorId, sql) {
  return `BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${sql}
    COMMIT;`;
}

async function waitForExactPeriod(label, monthStart) {
  try {
    await waitForDb(label, `
      SELECT count(*) = 4
        AND bool_and(period.status = 'ready')
        AND bool_and(component.closing_amount = CASE component.component
          WHEN 'ips_held_owner_cash' THEN 1980.25
          WHEN 'owner_due_to_ips' THEN 0.00
          WHEN 'ips_due_to_owner' THEN 200.50
          WHEN 'security_deposit_custody' THEN 870.00
        END)
      FROM public.owner_balance_periods AS period
      JOIN public.owner_balance_period_components AS component
        ON component.organization_id = period.organization_id
       AND component.owner_balance_period_id = period.id
      WHERE period.organization_id = '${organizationId}'
        AND period.property_id = '${centralPropertyId}'
        AND period.owner_person_id = '${centralOwnerId}'
        AND period.month_start = '${monthStart}';
    `);
  } catch (error) {
    const actual = dbScalar(`
      SELECT coalesce(jsonb_object_agg(component.component, jsonb_build_object(
        'closing_amount', component.closing_amount,
        'status', period.status
      ))::text, '{}')
      FROM public.owner_balance_periods AS period
      JOIN public.owner_balance_period_components AS component
        ON component.organization_id = period.organization_id
       AND component.owner_balance_period_id = period.id
      WHERE period.organization_id = '${organizationId}'
        AND period.property_id = '${centralPropertyId}'
        AND period.owner_person_id = '${centralOwnerId}'
        AND period.month_start = '${monthStart}';
    `);
    throw new Error(`${error.message}; actual period ${actual}`, { cause: error });
  }
}

async function waitForDb(label, sql, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let actual = "";
  while (Date.now() < deadline) {
    actual = dbScalar(sql);
    if (actual === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`authoritative DB phase timed out: ${label} (${actual})`);
}

function phase(label) {
  process.stdout.write(`PASS ${label}\n`);
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

function dbExec(sql) {
  const result = spawnSync(
    "docker",
    ["exec", databaseContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) throw new Error(result.stderr.trim() || "DB command failed");
  return result.stdout.trim();
}

function dbScalar(sql) {
  return dbExec(sql).split(/\r?\n/).map((row) => row.trim()).filter(Boolean).at(-1) ?? "";
}
