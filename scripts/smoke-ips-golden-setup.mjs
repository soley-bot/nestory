import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { isExpectedNextDevPerformancePageError } from "./smoke-ui-redesign-policy.mjs";
import {
  goldenSetupPhases,
  makeGoldenSetupNames,
  readGoldenSetupSmokeConfig,
  validateLocalRuntimeAttestation,
} from "./ips-golden-setup-browser-contract.mjs";

const config = readGoldenSetupSmokeConfig();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(scriptDirectory, "..");
findLocalDatabaseContainer(cwd);
const localRuntime = readLocalSupabaseRuntime(cwd);
const names = makeGoldenSetupNames();
const dates = getGoldenDates();
const fingerprint = "7".repeat(64);
const componentCount = 4;

let browser;
try {
  await attestLocalApp(config.baseUrl);
  browser = await chromium.launch({ headless: true });

  const setup = await withActor(config.superAdminEmail, async (page, origin) => {
    return createSetupRecords(page, origin);
  });

  await withActor(config.managerEmail, async (page, origin) => {
    await activateBilling(page, origin, setup);
  });

  await withActor(config.submitterEmail, async (page, origin) => {
    await submitOpeningBalances(page, origin, setup.propertyId);
  });

  await withActor(config.superAdminEmail, async (page, origin) => {
    await approveOpeningBalances(page, origin, setup.propertyId);
    await assertRentReadyAndDownstream(page, origin, setup);
  });

  process.stdout.write(
    `PASS ${goldenSetupPhases.length}-phase local golden setup (${names.propertyCode})\n`,
  );
} finally {
  await browser?.close();
}

async function createSetupRecords(page, origin) {
  await gotoOk(page, `${origin}/properties/setup`);
  await page.getByRole("heading", { name: "Set up property" }).waitFor();

  await page.getByRole("button", { name: "Create new owner" }).click();
  let dialog = page.getByRole("dialog", { name: "Create owner" });
  await dialog.locator('input[name="displayName"]').fill(names.owner);
  await dialog.locator('input[name="primaryEmail"]').fill(`${names.propertyCode.toLowerCase()}-owner@example.test`);
  await submitCreation(page, dialog, "Add owner", 2, "ownerId");
  const ownerId = getRequiredSearchParam(page, "ownerId");

  await page.getByRole("button", { name: "Create new property" }).click();
  dialog = page.getByRole("dialog", { name: "Create property" });
  await dialog.locator('input[name="name"]').fill(names.property);
  await dialog.locator('input[name="code"]').fill(names.propertyCode);
  await dialog.locator('input[name="propertyType"]').fill("Residential");
  await selectOption(page, dialog, "Status", "Active");
  await dialog.locator('input[name="ownershipPercent"]').fill("100");
  await dialog.locator('input[name="address"]').fill("Local acceptance fixture");
  await setHiddenFormValue(dialog, "ownerStartedOn", dates.monthStart);
  await submitCreation(page, dialog, "Add property", 3, "propertyId");
  const propertyId = getRequiredSearchParam(page, "propertyId");

  await page.getByRole("button", { name: "Create new unit" }).click();
  dialog = page.getByRole("dialog", { name: "Create unit" });
  await dialog.locator('input[name="unitNumber"]').fill(names.unit);
  await dialog.locator('input[name="currentRentAmount"]').fill("875");
  await submitCreation(page, dialog, "Add unit", 4, "unitId");
  const unitId = getRequiredSearchParam(page, "unitId");

  await page.getByRole("button", { name: "Create new tenant" }).click();
  dialog = page.getByRole("dialog", { name: "Create tenant" });
  await dialog.locator('input[name="displayName"]').fill(names.tenant);
  await dialog.locator('input[name="primaryEmail"]').fill(`${names.propertyCode.toLowerCase()}-tenant@example.test`);
  await dialog.getByRole("button", { name: "Add tenant", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.has("tenantId"));
  await dialog.waitFor({ state: "detached" });
  const tenantId = getRequiredSearchParam(page, "tenantId");

  await page.getByRole("button", { name: "Create new lease" }).click();
  dialog = page.getByRole("dialog", { name: "Create lease" });
  await selectOption(page, dialog, "Status", "Active");
  await selectOption(page, dialog, "Payment frequency", "Monthly");
  await selectOption(page, dialog, "Term status", "Active now");
  await dialog.locator('input[name="monthlyRentAmount"]').fill("875");
  await dialog.locator('input[name="rentDueDay"]').fill("5");
  await dialog.locator('input[name="depositAmount"]').fill("0");
  for (const [name, value] of [
    ["scheduledMoveInDate", dates.today],
    ["actualMoveInDate", dates.today],
    ["leaseStartDate", dates.today],
    ["leaseEndDate", dates.leaseEnd],
  ]) {
    await setHiddenFormValue(dialog, name, value);
  }
  await dialog.getByRole("button", { name: "Add lease", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("step") === "5" && url.searchParams.has("leaseId"));
  await dialog.waitFor({ state: "detached" });
  const leaseId = getRequiredSearchParam(page, "leaseId");

  await page.getByRole("heading", { name: "Setup needs attention" }).waitFor();
  assert.equal(await page.getByText("9 readiness checks", { exact: true }).count(), 1);

  return { leaseId, ownerId, propertyId, tenantId, unitId };
}

async function activateBilling(page, origin, setup) {
  const target = new URL("/rent-income", origin);
  target.searchParams.set("action", "billing");
  target.searchParams.set("leaseId", setup.leaseId);
  await gotoOk(page, target.toString());

  const dialog = page.getByRole("dialog", { name: "Set up lease billing" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /Continue/ }).click();
  await selectFieldOption(page, dialog, "Bill to", "Individual tenant");
  await selectFieldOption(page, dialog, "Recipient", names.tenant);
  await dialog.getByLabel("Billing effective date").fill(dates.today);
  assert.equal(await dialog.getByLabel("Billing effective date").inputValue(), dates.today);
  await dialog.getByRole("button", { name: /Continue/ }).click();
  await selectFieldOption(page, dialog, "Who collects rent?", /Collected by /);
  await selectFieldOption(page, dialog, "Management fee", "Percentage");
  await dialog.getByLabel("Fee percentage").fill("8");
  await selectFieldOption(page, dialog, "Charge fee while lease is active?", "Yes");
  await selectFieldOption(page, dialog, "Keep full fee in pro-rata months?", "No");
  await dialog.getByRole("button", { name: /Continue/ }).click();
  await dialog.getByRole("button", { name: "Activate billing", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Lease billing is active.", { exact: true }).waitFor();
}

async function submitOpeningBalances(page, origin, propertyId) {
  await gotoOk(page, `${origin}/balances?propertyId=${propertyId}`);
  await page.getByRole("region", { name: "Opening balance components" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Submit opening balance" }).count(),
    componentCount,
  );

  for (let index = 0; index < componentCount; index += 1) {
    await page.getByRole("button", { name: "Submit opening balance" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Submit opening balance" });
    await dialog.getByLabel("Opening amount").fill("0");
    await dialog.getByLabel("Reason").fill("Golden setup known-zero cutover");
    await dialog.getByText("Audit evidence", { exact: true }).click();
    await dialog.getByLabel("Evidence file fingerprint").fill(fingerprint);
    await dialog.getByLabel("Source reference").fill(`${names.propertyCode}-OPENING-${index + 1}`);
    await dialog.getByRole("button", { name: "Submit for review" }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("status").filter({ hasText: /submitted for review/i }).waitFor();
  }

  assert.equal(await page.getByText("Independent review required").count(), componentCount);
}

async function approveOpeningBalances(page, origin, propertyId) {
  await gotoOk(page, `${origin}/balances?propertyId=${propertyId}`);
  await page.getByRole("region", { name: "Opening balance components" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Approve opening balance" }).count(),
    componentCount,
  );

  for (let index = 0; index < componentCount; index += 1) {
    await page.getByRole("button", { name: "Approve opening balance" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Approve opening balance" });
    await dialog.getByLabel("Review reason").fill("Independent golden setup approval");
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("status").filter({ hasText: /approved/i }).waitFor();
  }

  assert.equal(await page.getByText("Approved zero", { exact: true }).count(), componentCount);
}

async function assertRentReadyAndDownstream(page, origin, setup) {
  const setupUrl = new URL("/properties/setup", origin);
  setupUrl.searchParams.set("step", "5");
  setupUrl.searchParams.set("ownerId", setup.ownerId);
  setupUrl.searchParams.set("propertyId", setup.propertyId);
  setupUrl.searchParams.set("unitId", setup.unitId);
  setupUrl.searchParams.set("tenantId", setup.tenantId);
  setupUrl.searchParams.set("leaseId", setup.leaseId);
  await gotoOk(page, setupUrl.toString());

  await page.getByRole("heading", { name: "Rent ready" }).waitFor();
  const checklist = page.getByRole("region", { name: "Rent readiness checklist" });
  assert.equal(await checklist.getByRole("listitem").count(), 9);
  assert.equal(await checklist.getByText("Ready", { exact: true }).count(), 9);

  const expectedLinks = new Map([
    ["Owner", `/people/${setup.ownerId}`],
    ["Property", `/properties/${setup.propertyId}`],
    ["Unit", `/units/${setup.unitId}`],
    ["Tenant", `/people/${setup.tenantId}`],
    ["Lease", `/leases?leaseId=${setup.leaseId}`],
  ]);
  for (const [label, href] of expectedLinks) {
    assert.equal(await page.getByRole("link", { name: new RegExp(`^${label}`) }).getAttribute("href"), href);
  }
  assert.equal(
    await page.getByRole("link", { name: "Open rent workspace" }).getAttribute("href"),
    `/rent-income?leaseId=${setup.leaseId}`,
  );

  await gotoOk(page, `${origin}/rent-income?leaseId=${setup.leaseId}`);
  const rentRow = page.getByRole("row").filter({ hasText: names.tenant });
  await rentRow.first().waitFor();
  assert.equal(await rentRow.count(), 1, "Rent handoff did not focus the exact lease invoice");
  await rentRow.getByText(names.property, { exact: false }).waitFor();
  await rentRow.getByText(names.unit, { exact: false }).waitFor();

  await gotoOk(
    page,
    `${origin}/maintenance?action=create&propertyId=${setup.propertyId}&unitId=${setup.unitId}`,
  );
  const maintenanceDialog = page.getByRole("dialog", { name: "New maintenance case" });
  await maintenanceDialog.waitFor();
  assert.equal(await maintenanceDialog.locator('input[name="propertyId"]').inputValue(), setup.propertyId);
  assert.equal(await maintenanceDialog.locator('input[name="unitId"]').inputValue(), setup.unitId);

  await gotoOk(
    page,
    `${origin}/reports/monthly-owner-activity?propertyId=${setup.propertyId}&month=${dates.month}`,
  );
  assert.equal(
    await page.locator('input[name="propertyId"]').first().inputValue(),
    setup.propertyId,
  );
  await page.getByText(names.property, { exact: false }).first().waitFor();
}

async function withActor(email, run) {
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => {
    if (!isExpectedNextDevPerformancePageError(error.message)) pageErrors.push(error.message);
  });
  try {
    const loginResponse = await page.goto(`${config.baseUrl}/login`, {
      waitUntil: "domcontentloaded",
    });
    assert.ok(loginResponse?.ok(), "Login route did not load");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(config.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });

    await gotoOk(page, `${config.baseUrl}/workspace`);
    const openWorkspace = page.getByRole("link", { name: "Open workspace" });
    if (new URL(page.url()).pathname === "/workspace") {
      await Promise.race([
        page.waitForURL((url) => url.pathname !== "/workspace", { timeout: 10_000 }),
        openWorkspace.waitFor({ state: "visible", timeout: 10_000 }),
      ]);
    }
    if (new URL(page.url()).pathname === "/workspace" && await openWorkspace.isVisible()) {
      await Promise.all([
        page.waitForURL((url) => url.pathname !== "/workspace"),
        openWorkspace.click(),
      ]);
    }

    const origin = validateLocalRuntimeAttestation({
      appOrigin: new URL(page.url()).origin,
      attestation: await readAppAttestation(config.baseUrl),
      baseUrl: config.baseUrl,
      expectedSupabaseUrl: localRuntime.apiUrl,
    });
    const result = await run(page, origin);
    assert.deepEqual(pageErrors, [], `${email} browser page errors`);
    return result;
  } finally {
    await context.close();
  }
}

async function gotoOk(page, url) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      if (!String(error).includes("net::ERR_ABORTED") || attempt === 3) throw error;
      await page.waitForTimeout(250 * attempt);
    }
  }
  assert.ok(response?.ok(), `Route did not load: ${new URL(url).pathname}`);
  assert.equal(
    new URL(page.url()).origin,
    new URL(url).origin,
    "Route redirected away from the approved local origin",
  );
  assert.ok(!["/login", "/no-access"].includes(new URL(page.url()).pathname));
}

async function attestLocalApp(baseUrl) {
  validateLocalRuntimeAttestation({
    appOrigin: baseUrl,
    attestation: await readAppAttestation(baseUrl),
    baseUrl: config.baseUrl,
    expectedSupabaseUrl: localRuntime.apiUrl,
  });
}

async function readAppAttestation(baseUrl) {
  const response = await fetch(`${baseUrl}/api/local-smoke-target`, {
    redirect: "error",
  });
  assert.equal(
    response.status,
    200,
    "App did not attest a local Supabase target",
  );
  return response.json();
}

function readLocalSupabaseRuntime(directory) {
  const result = process.env.npm_execpath
    ? spawnSync(
        process.execPath,
        [
          process.env.npm_execpath,
          "exec",
          "--",
          "supabase",
          "status",
          "-o",
          "env",
        ],
        { cwd: directory, encoding: "utf8", shell: false },
      )
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["supabase", "status", "-o", "env"],
        { cwd: directory, encoding: "utf8", shell: false },
      );
  assert.equal(result.status, 0, "Local Supabase status is unavailable");
  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );
  assert.ok(values.API_URL, "Local Supabase API URL is unavailable");
  return { apiUrl: values.API_URL };
}

async function submitCreation(page, dialog, buttonName, step, idParam) {
  await dialog.getByRole("button", { name: buttonName, exact: true }).click();
  await page.waitForURL(
    (url) => url.searchParams.get("step") === String(step) && url.searchParams.has(idParam),
  );
  await dialog.waitFor({ state: "detached" });
}

async function selectOption(page, scope, label, option) {
  await scope.locator(`[role="combobox"][aria-label="${label}"]`).click();
  await page.getByRole("option", { name: option, exact: true }).last().click();
}

async function selectFieldOption(page, scope, label, option) {
  const field = scope.locator("label").filter({ hasText: label }).first();
  await field.getByRole("combobox").click();
  const optionLocator =
    option instanceof RegExp
      ? page.getByRole("option", { name: option })
      : page.getByRole("option", { name: option, exact: true });
  await optionLocator.last().click();
}

async function setHiddenFormValue(scope, name, value) {
  const input = scope.locator(`input[name="${name}"]`);
  await input.evaluate((element, nextValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    descriptor?.set?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  assert.equal(await input.inputValue(), value);
}

function getRequiredSearchParam(page, name) {
  const value = new URL(page.url()).searchParams.get(name);
  assert.ok(value, `Missing ${name} after setup creation`);
  return value;
}

function getGoldenDates(now = new Date()) {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const today = toDateValue(now);
  const monthStart = toDateValue(new Date(Date.UTC(year, monthIndex, 1)));
  const leaseEnd = toDateValue(new Date(Date.UTC(year + 1, monthIndex, now.getUTCDate() - 1)));

  return {
    leaseEnd,
    month: monthStart.slice(0, 7),
    monthStart,
    today,
  };
}

function toDateValue(value) {
  return value.toISOString().slice(0, 10);
}
