import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseContainer = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const actors = {
  finance_manager: "finance.manager@nestory.com",
  finance_member: "finance.member@nestory.com",
  operations_manager: "operations.manager@nestory.com",
  operations_member: "operations.member@nestory.com",
  super_admin: "nestory@gmail.com",
};
const organizationId = "00000000-0000-0000-0000-000000000001";
const superAdminId = "00000000-0000-0000-0000-000000000101";
const centralPropertyId = "10000000-0000-0000-0000-000000000001";
const centralOwnerId = "80000000-0000-0000-0000-000000000004";
const correctionAmount = "-25.00";
const correctionEvidence = "a".repeat(64);
const correctionReference = "BROWSER-CLOSE-BANK-CHARGE-001";
const currentDate = dbScalar("SELECT current_date::text;");
const currentMonth = currentDate.slice(0, 7);
const currentMonthStart = `${currentMonth}-01`;
const currentMonthEnd = dbScalar(
  "SELECT (date_trunc('month', current_date) + interval '1 month - 1 day')::date::text;",
);
const nextMonthStart = dbScalar(
  "SELECT (date_trunc('month', current_date) + interval '1 month')::date::text;",
);
const nextMonth = nextMonthStart.slice(0, 7);

let browser;
try {
  loadBaseline();
  browser = await chromium.launch({ headless: true });

  await withBalanceActor(
    actors.super_admin,
    { month: currentMonth, ownerPersonId: centralOwnerId, propertyId: centralPropertyId },
    async (page) => {
      await page.getByRole("heading", { name: "Close owner month", exact: true }).waitFor();
      await page.getByText("Opening balance review is pending", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Load balances" }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Generate month" }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Close owner month" }).count(), 0);
      phase("rendered selector audit before mutation");
    },
  );
  prepareCentralCloseReadiness();

  let revisionOneId;
  let revisionOneHash;
  let revisionOneSnapshot;

  await withBalanceActor(
    actors.super_admin,
    { month: currentMonth, ownerPersonId: centralOwnerId, propertyId: centralPropertyId },
    async (page) => {
      await page.getByText("Ready to close owner month · revision 1", { exact: true }).waitFor();
      await assertReadinessComponents(page, {
        "IPS due to owner": "USD 200.50",
        "IPS-held owner cash": "USD 1,855.00",
        "Owner due to IPS": "USD 0.00",
        "Security-deposit custody": "USD 860.00",
      });
      phase("Super Admin exact readiness");

      const closeOne = formByButton(page, "Close owner month");
      await closeOne.getByLabel("Close reason").fill(
        "Browser revision one reconciled to bank and owner authority",
      );
      await closeOne.getByRole("button", { name: "Close owner month" }).click();
      await waitForDb("revision one close", `
        SELECT count(*) = 1
          AND bool_and(revision.status = 'closed')
          AND bool_and(revision.revision_number = 1)
        FROM public.owner_close_revisions AS revision
        JOIN public.owner_close_series AS series
          ON series.organization_id = revision.organization_id
         AND series.id = revision.owner_close_series_id
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND series.month_start = '${currentMonthStart}';
      `);
      revisionOneId = dbScalar(`
        SELECT revision.id::text
        FROM public.owner_close_revisions AS revision
        JOIN public.owner_close_series AS series
          ON series.id = revision.owner_close_series_id
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND series.month_start = '${currentMonthStart}'
          AND revision.revision_number = 1;
      `);
      revisionOneHash = dbScalar(`
        SELECT content_hash FROM public.owner_close_revisions
        WHERE id = '${revisionOneId}';
      `);
      revisionOneSnapshot = frozenRevisionSnapshot(revisionOneId);
      assert.match(revisionOneHash, /^[0-9a-f]{64}$/);
      phase("immutable revision one close");

      await page.reload({ waitUntil: "networkidle" });
      const revisionOne = page.getByTestId("owner-close-revision-1");
      await revisionOne.getByText("Revision 1 - Closed", { exact: true }).waitFor();
      await revisionOne.getByText("Audit details", { exact: true }).first().click();
      await revisionOne.getByText(revisionOneHash, { exact: true }).waitFor();
      const frozenLine = revisionOne.locator("details.px-4.py-3").first();
      assert.ok(await frozenLine.count() > 0, "revision one source drill-through was empty");
      await frozenLine.locator(":scope > summary").click();
      await frozenLine.getByText("Audit details", { exact: true }).first().click();
      await frozenLine.getByText("Source line", { exact: true }).first().waitFor();

      const reopen = formByButton(page, "Reopen month");
      await reopen.getByLabel("Reopen reason").fill(
        "Late evidenced bank charge belongs to the closed owner month",
      );
      await reopen.getByRole("button", { name: "Reopen month" }).click();
      await waitForDb("revision two preparing and continuity stale", `
        SELECT
          series.state = 'preparing'
          AND current_revision.revision_number = 2
          AND current_revision.status = 'preparing'
          AND current_revision.supersedes_revision_id = '${revisionOneId}'
          AND (SELECT count(*) = 2 FROM public.owner_balance_periods AS period
            WHERE period.organization_id = '${organizationId}'
              AND period.property_id = '${centralPropertyId}'
              AND period.owner_person_id = '${centralOwnerId}'
              AND period.month_start IN ('${currentMonthStart}', '${nextMonthStart}')
              AND period.status = 'stale')
        FROM public.owner_close_series AS series
        JOIN public.owner_close_revisions AS current_revision
          ON current_revision.id = series.active_revision_id
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND series.month_start = '${currentMonthStart}';
      `);
      assert.equal(frozenRevisionSnapshot(revisionOneId), revisionOneSnapshot);
      phase("reasoned reopen preserves revision one and stales continuity");

      await page.reload({ waitUntil: "networkidle" });
      await page.getByText("Owner balance month must be recalculated", { exact: true }).waitFor();
      const correction = formByButton(page, "Record correction");
      await correction.getByLabel("Component").click();
      await page.getByRole("option", { name: "IPS-held owner cash", exact: true }).click();
      await correction.getByLabel("Effective date").fill(currentMonthEnd);
      await correction.getByLabel("Signed correction amount").fill(correctionAmount);
      await correction.getByLabel("Source reference").fill(correctionReference);
      await correction.getByLabel("Reason").fill(
        "Record late bank charge after immutable revision one",
      );
      await correction.getByText("Audit evidence", { exact: true }).click();
      await correction.getByLabel("Evidence file fingerprint").fill(correctionEvidence);
      await correction.getByRole("button", { name: "Record correction" }).click();
      await waitForDb("append-only close correction", `
        SELECT count(*) = 1
          AND bool_and(correction.signed_amount = ${correctionAmount})
          AND bool_and(correction.evidence_sha256 = '${correctionEvidence}')
          AND bool_and(allocation_set.source_type = 'owner_close_correction')
          AND bool_and(movement.signed_amount = ${correctionAmount})
        FROM public.owner_close_corrections AS correction
        JOIN public.owner_event_allocation_sets AS allocation_set
          ON allocation_set.organization_id = correction.organization_id
         AND allocation_set.source_line_id = correction.id
        JOIN public.owner_event_owner_allocations AS owner_allocation
          ON owner_allocation.organization_id = allocation_set.organization_id
         AND owner_allocation.allocation_set_id = allocation_set.id
        JOIN public.owner_component_movements AS movement
          ON movement.organization_id = owner_allocation.organization_id
         AND movement.owner_event_owner_allocation_id = owner_allocation.id
        JOIN public.owner_close_series AS series
          ON series.organization_id = correction.organization_id
         AND series.id = correction.owner_close_series_id
        WHERE series.property_id = '${centralPropertyId}'
          AND series.owner_person_id = '${centralOwnerId}'
          AND correction.source_reference = '${correctionReference}';
      `);
      assert.equal(frozenRevisionSnapshot(revisionOneId), revisionOneSnapshot);
      phase("checked append-only correction");

      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Generate month" }).click();
      await waitForDb("target month reroll", `
        SELECT period.status = 'ready'
          AND component.closing_amount = 1830.00
        FROM public.owner_balance_periods AS period
        JOIN public.owner_balance_period_components AS component
          ON component.organization_id = period.organization_id
         AND component.owner_balance_period_id = period.id
         AND component.component = 'ips_held_owner_cash'
        WHERE period.organization_id = '${organizationId}'
          AND period.property_id = '${centralPropertyId}'
          AND period.owner_person_id = '${centralOwnerId}'
          AND period.month_start = '${currentMonthStart}';
      `);
      phase("target month rerolled");

      await loadBalanceScope(page, {
        month: nextMonth,
        ownerPersonId: centralOwnerId,
        propertyId: centralPropertyId,
      });
      await page.getByRole("button", { name: "Generate month" }).click();
      await waitForDb("later dependent month reroll", `
        SELECT period.status = 'ready'
          AND component.opening_amount = 1830.00
          AND component.closing_amount = 1830.00
        FROM public.owner_balance_periods AS period
        JOIN public.owner_balance_period_components AS component
          ON component.organization_id = period.organization_id
         AND component.owner_balance_period_id = period.id
         AND component.component = 'ips_held_owner_cash'
        WHERE period.organization_id = '${organizationId}'
          AND period.property_id = '${centralPropertyId}'
          AND period.owner_person_id = '${centralOwnerId}'
          AND period.month_start = '${nextMonthStart}';
      `);
      phase("later dependent month rerolled in order");

      await loadBalanceScope(page, {
        month: currentMonth,
        ownerPersonId: centralOwnerId,
        propertyId: centralPropertyId,
      });
      await page.getByText("Ready to close owner month · revision 2", { exact: true }).waitFor();
      const closeTwo = formByButton(page, "Close owner month");
      await closeTwo.getByLabel("Close reason").fill(
        "Browser revision two reconciled after correction and ordered reroll",
      );
      await closeTwo.getByRole("button", { name: "Close owner month" }).click();
      await waitForDb("revision two close", finalCloseSql());
      assert.equal(frozenRevisionSnapshot(revisionOneId), revisionOneSnapshot);
      phase("revision two close preserves revision one byte for byte");

      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("owner-close-revision-2")
        .getByText("Revision 2 - Closed", { exact: true }).waitFor();
      const retainedRevisionOne = page.getByTestId("owner-close-revision-1");
      await retainedRevisionOne.getByText("Audit details", { exact: true }).first().click();
      await retainedRevisionOne.getByText(revisionOneHash, { exact: true }).waitFor();
      await page.getByText(correctionReference, { exact: false }).waitFor();
      phase("both frozen revisions and correction visible");
    },
  );

  for (const financeActor of [actors.finance_manager, actors.finance_member]) {
    await withBalanceActor(
      financeActor,
      { month: currentMonth, ownerPersonId: centralOwnerId, propertyId: centralPropertyId },
      async (page) => {
        await page.getByTestId("owner-close-revision-2").waitFor();
        await page.getByTestId("owner-close-revision-1").waitFor();
        for (const action of ["Reopen month", "Record correction"]) {
          assert.equal(
            await page.getByRole("button", { name: action }).count(),
            0,
            `${financeActor} received ${action}`,
          );
        }
        assert.equal(
          await page.getByRole("button", { name: "Close owner month" }).count(),
          0,
          `${financeActor} received close authority`,
        );
        phase("Finance role frozen-history safeguards");
      },
    );
  }

  for (const operationsActor of [actors.operations_manager, actors.operations_member]) {
    await withShellActor(operationsActor, async (page) => {
      assert.equal(
        await page.locator('nav[aria-label="Global navigation"] a[href="/balances"]').count(),
        0,
        `${operationsActor} saw Owner balances navigation`,
      );
      const response = await page.goto(`${baseUrl}/balances`, { waitUntil: "networkidle" });
      const pathname = new URL(page.url()).pathname;
      assert.ok(
        pathname !== "/balances" || [401, 403, 404].includes(response?.status() ?? 0),
        `${operationsActor} reached protected owner close authority`,
      );
      phase("Operations role route denial");
    });
  }

  assert.equal(dbScalar(finalCloseSql()), "t", "final close database oracle failed");
  assert.equal(frozenRevisionSnapshot(revisionOneId), revisionOneSnapshot);
  process.stdout.write(
    "PASS one authenticated owner-close lifecycle: readiness, R1, reopen, correction, ordered reroll, R2, immutable evidence, Finance read-only, and Operations denial\n",
  );
} finally {
  await browser?.close();
  loadBaseline();
}

function prepareCentralCloseReadiness() {
  dbExec(authenticatedDbSql(superAdminId, `
    SELECT public.set_financial_month_lock(
      '${organizationId}',
      '${currentMonthStart}',
      true,
      'Owner close browser acceptance prerequisite'
    );
    SELECT public.review_owner_opening_balance(
      request.organization_id,
      request.id,
      'reject',
      'Resolve pending fixture correction before owner close acceptance',
      'browser-close-reject-pending-opening'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '${organizationId}'
      AND request.property_id = '${centralPropertyId}'
      AND request.owner_person_id = '${centralOwnerId}'
      AND request.currency = 'USD'
      AND request.effective_date = '${currentMonthStart}'
      AND request.status = 'submitted';
  `));
  assert.equal(dbScalar(authenticatedDbSql(superAdminId, `
    SELECT public.get_owner_close_readiness(
      '${organizationId}', '${centralPropertyId}', '${centralOwnerId}', 'USD',
      '${currentMonthStart}'
    )->>'is_ready';
  `)).split(/\r?\n/).at(-1), "true");
}

function finalCloseSql() {
  return `
    SELECT
      series.state = 'closed'
      AND current_revision.revision_number = 2
      AND current_revision.status = 'closed'
      AND current_revision.supersedes_revision_id = '${revisionId(1)}'
      AND current_revision.content_hash ~ '^[0-9a-f]{64}$'
      AND current_revision.input_hash ~ '^[0-9a-f]{64}$'
      AND (SELECT count(*) = 2 FROM public.owner_close_revisions AS revision
        WHERE revision.organization_id = series.organization_id
          AND revision.owner_close_series_id = series.id
          AND revision.status = 'closed')
      AND (SELECT count(*) = 0 FROM app_private.financial_idempotency_requests AS request
        WHERE request.organization_id = series.organization_id
          AND request.status = 'pending')
      AND (SELECT period.status = 'closed'
        FROM public.owner_balance_periods AS period
        WHERE period.organization_id = series.organization_id
          AND period.property_id = series.property_id
          AND period.owner_person_id = series.owner_person_id
          AND period.currency = series.currency
          AND period.month_start = series.month_start)
      AND (SELECT period.status = 'ready' AND component.opening_amount = 1830.00
        FROM public.owner_balance_periods AS period
        JOIN public.owner_balance_period_components AS component
          ON component.organization_id = period.organization_id
         AND component.owner_balance_period_id = period.id
         AND component.component = 'ips_held_owner_cash'
        WHERE period.organization_id = series.organization_id
          AND period.property_id = series.property_id
          AND period.owner_person_id = series.owner_person_id
          AND period.month_start = '${nextMonthStart}')
    FROM public.owner_close_series AS series
    JOIN public.owner_close_revisions AS current_revision
      ON current_revision.id = series.current_closed_revision_id
    WHERE series.organization_id = '${organizationId}'
      AND series.property_id = '${centralPropertyId}'
      AND series.owner_person_id = '${centralOwnerId}'
      AND series.month_start = '${currentMonthStart}';
  `;
}

function revisionId(revisionNumber) {
  return dbScalar(`
    SELECT revision.id::text
    FROM public.owner_close_revisions AS revision
    JOIN public.owner_close_series AS series
      ON series.id = revision.owner_close_series_id
    WHERE series.organization_id = '${organizationId}'
      AND series.property_id = '${centralPropertyId}'
      AND series.owner_person_id = '${centralOwnerId}'
      AND series.month_start = '${currentMonthStart}'
      AND revision.revision_number = ${revisionNumber};
  `);
}

function frozenRevisionSnapshot(revisionIdValue) {
  return dbScalar(`
    SELECT pg_catalog.jsonb_build_object(
      'revision', pg_catalog.to_jsonb(revision),
      'lines', coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.line_number)
        FROM public.owner_close_lines AS line
        WHERE line.owner_close_revision_id = revision.id
      ), '[]'::jsonb),
      'sources', coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(source)
          ORDER BY source.close_line_id, source.source_type, source.source_line_id, source.id)
        FROM public.owner_close_line_sources AS source
        WHERE source.owner_close_revision_id = revision.id
      ), '[]'::jsonb)
    )::text
    FROM public.owner_close_revisions AS revision
    WHERE revision.id = '${revisionIdValue}';
  `);
}

async function withBalanceActor(email, scope, run) {
  return withShellActor(email, async (page) => {
    await openOwnerBalancesFromVisibleFinance(page);
    await loadBalanceScope(page, scope);
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
    await page.waitForURL((url) => url.pathname !== "/login", {
      timeout: 15_000,
      waitUntil: "networkidle",
    });
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
    page.waitForURL((url) => url.pathname === "/balances", { waitUntil: "networkidle" }),
    link.click(),
  ]);
  await page.getByRole("heading", { name: "Owner balances", exact: true }).waitFor();
}

async function loadBalanceScope(page, scope) {
  const form = formByButton(page, "Load balances");
  await setHiddenControlValue(form, "propertyId", scope.propertyId);
  await setHiddenControlValue(form, "ownerPersonId", scope.ownerPersonId);
  await form.getByLabel("Month").fill(scope.month);
  await Promise.all([
    page.waitForURL((url) =>
      url.pathname === "/balances" &&
      url.searchParams.get("propertyId") === scope.propertyId &&
      url.searchParams.get("ownerPersonId") === scope.ownerPersonId &&
      url.searchParams.get("month") === scope.month,
    ),
    form.getByRole("button", { name: "Load balances" }).click(),
  ]);
  await page.getByTestId("owner-close-readiness").waitFor();
}

async function assertReadinessComponents(page, expected) {
  const readiness = page.getByTestId("owner-close-readiness");
  for (const [component, amount] of Object.entries(expected)) {
    const row = readiness.getByRole("row").filter({ hasText: component });
    assert.ok(
      await row.getByText(amount, { exact: true }).count() > 0,
      `${component} did not show ${amount}`,
    );
  }
}

function formByButton(page, name) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name, exact: typeof name === "string" }),
  }).first();
}

function authenticatedDbSql(actorId, sql) {
  return `BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${actorId}', true);
    SET LOCAL ROLE authenticated;
    ${sql}
    COMMIT;`;
}

async function waitForDb(label, sql, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let actual = "";
  while (Date.now() < deadline) {
    actual = dbScalar(sql);
    if (actual === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`owner close DB phase timed out: ${label} (${actual})`);
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

function dbExec(sql) {
  const result = spawnSync(
    "docker",
    [
      "exec", databaseContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-c", sql,
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Owner close database command failed");
  }
  return result.stdout.trim();
}

function dbScalar(sql) {
  return dbExec(sql).split(/\r?\n/).map((row) => row.trim()).filter(Boolean).at(-1) ?? "";
}
