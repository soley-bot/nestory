import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { chromium } from "playwright";

import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";
import {
  buildDeniedGlobalEntryChecks,
  buildDiscoverabilityPlan,
  createPassedJourneyEvidence,
  createSessionStartEvidence,
  directDenialRoutes,
  findForbiddenGlobalEntries,
  fixtureRoleEmails,
  validateDiscoverabilityEvidence,
} from "./smoke-authenticated-route-discoverability-core.mjs";
import { loadRouteRegistry } from "./route-registry-core.mjs";

const projectRoot = process.cwd();
const registry = await loadRouteRegistry({ projectRoot });
if (registry.issues.length > 0) {
  throw new Error(`Invalid route registry:\n${registry.issues.join("\n")}`);
}
const contract = registry.authenticated;
const plan = buildDiscoverabilityPlan(contract);
const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const evidencePath = resolve(
  projectRoot,
  process.env.NESTORY_DISCOVERABILITY_EVIDENCE ??
    ".artifacts/authenticated-route-discoverability-evidence.json",
);
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();
const journeys = [];
const denials = [];
const deniedGlobalAbsence = [];
const sessionStarts = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const role of contract.roles) {
    const context = await browser.newContext({
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();

    try {
      await authenticate(page, fixtureRoleEmails[role]);
      const arrivalDestination = await openWorkspaceArrival(page);
      sessionStarts.push(createSessionStartEvidence(role, arrivalDestination));
      const checked = await assertInaccessibleGlobalEntriesAreAbsent(page, role);
      deniedGlobalAbsence.push({ checked, role, status: "passed" });
      process.stdout.write(
        `PASS session ${role} /workspace -> automatic role redirect -> ${arrivalDestination}\n`,
      );
      process.stdout.write(`PASS denied-global ${role} checked=${checked}\n`);

      for (const journey of plan.filter((candidate) => candidate.role === role)) {
        const chain = await openJourney(page, journey);
        assertAuthorizedDestination(page, journey.route);
        journeys.push(createPassedJourneyEvidence(journey.id, chain));
        process.stdout.write(`PASS ${journey.id} ${chain.join(" -> ")}\n`);
      }

      const deniedRoute = directDenialRoutes[role];
      if (deniedRoute) {
        await openDirectDenial(page, deniedRoute);
        denials.push({ role, route: deniedRoute, status: "passed" });
        process.stdout.write(`PASS denial ${role} ${deniedRoute}\n`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const evidence = {
  baseUrl,
  denials,
  deniedGlobalAbsence,
  head,
  journeys,
  passed: journeys.length,
  sessionStarts,
  total: plan.length,
};

const evidenceIssues = validateDiscoverabilityEvidence(contract, evidence);
if (evidenceIssues.length > 0) {
  throw new Error(`Invalid discoverability evidence:\n${evidenceIssues.join("\n")}`);
}

await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(
  `Authenticated route discoverability: ${journeys.length}/${plan.length} visible-link journeys pass; ${denials.length} direct denials pass.\n`,
);

async function authenticate(page, email) {
  const response = await page.goto(new URL("/login", baseUrl).toString(), {
    timeout: 30_000,
    waitUntil: "networkidle",
  });
  if (!response?.ok()) throw new Error(`Login did not load for ${email}`);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

async function openWorkspaceArrival(page) {
  const response = await page.goto(new URL(contract.arrival.route, baseUrl).toString(), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  if (!response?.ok()) throw new Error("Workspace arrival did not load");

  await page.waitForURL(
    (url) => !["/login", "/workspace"].includes(url.pathname),
    { timeout: 30_000 },
  );
  assertAuthorizedDestination(page);
  return new URL(page.url()).pathname;
}

async function assertInaccessibleGlobalEntriesAreAbsent(page, role) {
  const collapsedGroups = page.getByRole("button", {
    name: /^Expand .* navigation$/,
  });
  for (let index = (await collapsedGroups.count()) - 1; index >= 0; index -= 1) {
    await collapsedGroups.nth(index).click();
  }

  const visibleHrefs = await page
    .locator('nav[aria-label="Global navigation"] a[href]:visible')
    .evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")).filter(Boolean),
    );
  const forbidden = findForbiddenGlobalEntries(contract, role, visibleHrefs);
  if (forbidden.length > 0) {
    throw new Error(
      `${role} can see inaccessible global entries: ${forbidden
        .map((entry) => `${entry.href} (${entry.route})`)
        .join(", ")}`,
    );
  }
  return buildDeniedGlobalEntryChecks(contract, role).length;
}

async function openJourney(page, journey) {
  const chain = [];

  if (journey.classification === "global") {
    await clickGlobalRoute(page, journey.route);
    chain.push(entryLabel(journey.entryId));
    return chain;
  }

  if (journey.classification === "profile") {
    await page.getByRole("button", { name: fixtureRoleEmails[journey.role] }).click();
    await clickAndWait(
      page,
      page.getByRole("menuitem", { name: "Profile" }),
      journey.route,
    );
    chain.push("Profile menu", "Profile");
    return chain;
  }

  await openContextJourney(page, journey, chain);
  return chain;
}

async function openContextJourney(page, journey, chain) {
  const contextJourney = {
    "overview-drilldown": async () => {
      await fromGlobal(page, chain, "/overview", "Dashboard");
      await page
        .getByRole("button", { name: /^Needs attention,/ })
        .click();
      await clickAndWait(
        page,
        page.getByRole("link", { name: "View all checks", exact: true }),
        journey.route,
      );
      chain.push("Needs attention", "View all checks");
    },
    "people-owners": () => openPeopleTab(page, chain, journey.route, "Owners"),
    "people-staff": () => openPeopleTab(page, chain, journey.route, "Staff"),
    "people-tenants": () => openPeopleTab(page, chain, journey.route, "Tenants"),
    "people-vendors": () => openPeopleTab(page, chain, journey.route, "Vendors"),
    "people-detail": async () => {
      await fromGlobal(page, chain, "/people", "People");
      const personLink = page
        .locator('[data-slot="app-shell-content"] a[href^="/people/"]:visible')
        .first();
      await personLink.waitFor({ state: "visible", timeout: 20_000 });
      const personLabel = (await personLink.textContent())?.trim() || "Person record";
      await clickAndWait(page, personLink, journey.route);
      chain.push(personLabel);
    },
    "lease-detail": async () => {
      await fromGlobal(page, chain, "/leases", "Leases");
      await page.getByRole("heading", { name: "Leases" }).waitFor({
        state: "visible",
        timeout: 30_000,
      });
      await page.getByRole("row", { name: /Rithy Meas/ }).click();
      const leaseLink = page.getByRole("link", { name: "Open lease record" });
      await leaseLink.waitFor({ state: "visible", timeout: 20_000 });
      await clickAndWait(page, leaseLink, journey.route);
      chain.push("Lease quick view", "Open lease record");
    },
    "advanced-ledger": () =>
      openAdvancedFinanceTool(page, chain, journey.route, "Ledger"),
    "advanced-petty-cash": () =>
      openAdvancedFinanceTool(page, chain, journey.route, "Petty cash"),
    "property-finance-invoice": () =>
      openInvoiceFinance(page, chain, journey.route, "Open Property finance"),
    "unit-finance-invoice": () =>
      openInvoiceFinance(page, chain, journey.route, "Open Unit finance"),
    "property-setup": async () => {
      await fromGlobal(page, chain, "/properties", "Properties");
      const setupLink = page.getByRole("link", { name: "Set up property" });
      if (await setupLink.isVisible()) {
        await clickAndWait(page, setupLink, journey.route);
        chain.push("Set up property");
        return;
      }

      // The setup wizard is intentionally only promoted for an empty portfolio.
      // The shared fixture has existing Properties, so exercise the guarded route
      // directly while the static contract verifies its conditional entry point.
      await page.goto(new URL(journey.route, baseUrl).toString(), {
        timeout: 30_000,
        waitUntil: "domcontentloaded",
      });
      await page.waitForURL(
        (url) => matchesContractPath(url.pathname, journey.route),
        { timeout: 30_000 },
      );
      assertAuthorizedDestination(page, journey.route);
      chain.push("Set up property (empty-state entry)");
    },
    "property-detail": async () => {
      await openPropertyInspector(page, chain);
      await clickAndWait(
        page,
        page.getByText("Open property", { exact: true }),
        journey.route,
      );
      chain.push("Open property");
    },
    "units-list": async () => {
      await openPropertyInspector(page, chain);
      await clickAndWait(
        page,
        page.locator('[data-slot="property-preview-record-pill"][href^="/units"]'),
        journey.route,
      );
      chain.push("Units");
    },
    "unit-detail": async () => {
      await openPropertyInspector(page, chain, "Central Residence");
      await clickAndWait(
        page,
        page.locator('[data-slot="property-preview-record-pill"][href^="/units"]'),
        "/units",
      );
      chain.push("Units");
      const unitPreview = page
        .locator('[data-slot="app-shell-content"] [aria-label^="Preview unit "]:visible')
        .first();
      await unitPreview.click();
      const unitLink = page.getByText("Open unit", { exact: true });
      await unitLink.waitFor({ state: "visible", timeout: 20_000 });
      const unitLabel = (await unitPreview.getAttribute("aria-label")) || "Preview unit";
      await clickAndWait(page, unitLink, journey.route);
      chain.push(unitLabel, "Open unit");
    },
    "property-account": async () => {
      await openAdvancedFinanceTool(page, chain, "/ledger", "Ledger");
      const accountLink = page
        .locator(
          '[data-slot="app-shell-content"] a[href^="/properties/"][href$="/account"]:visible',
        )
        .first();
      const label = (await accountLink.textContent())?.trim() || "Property account";
      await clickAndWait(page, accountLink, journey.route);
      chain.push(label);
    },
    "report-detail": async () => {
      await fromGlobal(page, chain, "/reports", "Reports");
      await clickAndWait(
        page,
        page.getByRole("link", { name: "Open report" }).first(),
        journey.route,
      );
      chain.push("Open report");
    },
    "settings-organization": () =>
      openSettingsTab(page, chain, journey.route, "Organization"),
    "settings-appearance": () =>
      openSettingsTab(page, chain, journey.route, "Appearance"),
    "settings-branches": () =>
      openSettingsTab(page, chain, journey.route, "Branches"),
    "settings-teams": () =>
      openSettingsTab(page, chain, journey.route, "Teams"),
    "settings-access": async () => {
      await openSettingsTab(page, chain, "/settings/access", "Access");
      if (journey.route !== "/users-roles") return;

      await page.goto(new URL(journey.route, baseUrl).toString(), {
        timeout: 30_000,
        waitUntil: "domcontentloaded",
      });
      await page.waitForURL((url) => url.pathname === "/settings/access", {
        timeout: 30_000,
      });
      chain.push("Legacy access redirect");
    },
  }[journey.entryId];

  if (!contextJourney) {
    throw new Error(`No browser context strategy for ${journey.entryId}`);
  }
  await contextJourney();
}

async function openPeopleTab(page, chain, route, label) {
  await fromGlobal(page, chain, "/people", "People");
  await clickAndWait(page, page.getByRole("link", { name: label }), route);
  chain.push(label);
}

async function openAdvancedFinanceTool(page, chain, route, label) {
  await fromGlobal(page, chain, "/finance/advanced", "Advanced");
  await clickAndWait(page, page.getByRole("link", { name: label }), route);
  chain.push(label);
}

async function openInvoiceFinance(page, chain, route, label) {
  await fromGlobal(page, chain, "/rent-income", "Rent & collections");
  const invoiceButton = page
    .getByRole("button", { name: /^View invoice / })
    .first();
  await invoiceButton.waitFor({ state: "visible", timeout: 30_000 });
  await invoiceButton.click();
  await clickAndWait(page, page.getByRole("link", { name: label }), route);
  chain.push("Invoice details", label);
}

async function openSettingsTab(page, chain, route, label) {
  await fromGlobal(page, chain, "/settings", "Settings");
  await clickAndWait(
    page,
    page.locator(`a[href="${route}"]:visible`).first(),
    route,
  );
  chain.push(label);
}

async function openPropertyInspector(page, chain, propertyName) {
  await fromGlobal(page, chain, "/properties", "Properties");
  const preview = propertyName
    ? page.getByRole("row", { name: `Preview ${propertyName}` })
    : page.locator('[aria-label^="Preview "]:visible').first();
  await preview.click();
  await page.getByText("Open property", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  chain.push((await preview.getAttribute("aria-label")) || "Preview property");
}

async function fromGlobal(page, chain, route, label) {
  await clickGlobalRoute(page, route);
  chain.push(label);
}

async function clickGlobalRoute(page, route) {
  const href = staticRoute(route);
  const link = page
    .locator(`nav[aria-label="Global navigation"] a[href="${href}"]:visible`)
    .first();
  const group = routeGroup(route);
  if (group && !(await link.isVisible())) {
    const toggle = page.getByRole("button", {
      name: new RegExp(`(?:Expand|Collapse) ${group} navigation`),
    });
    if (
      (await toggle.count()) > 0 &&
      (await toggle.getAttribute("aria-expanded")) !== "true"
    ) {
      await toggle.click();
    }
  }

  await clickAndWait(page, link, route);
}

async function clickAndWait(page, locator, route) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  await Promise.all([
    page.waitForURL((url) => matchesContractPath(url.pathname, route), {
      timeout: 30_000,
    }),
    locator.click(),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  assertAuthorizedDestination(page, route);
}

async function openDirectDenial(page, route) {
  await page.goto(new URL(route, baseUrl).toString(), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname === "/no-access", {
    timeout: 30_000,
  });
}

function assertAuthorizedDestination(page, route) {
  const pathname = new URL(page.url()).pathname;
  if (["/login", "/no-access"].includes(pathname)) {
    throw new Error(`${route ?? "workspace arrival"} ended at ${pathname}`);
  }
  if (route && !matchesContractPath(pathname, route)) {
    throw new Error(`${route} ended at unexpected path ${pathname}`);
  }
}

function matchesContractPath(pathname, route) {
  if (route === "/users-roles" && pathname === "/settings/access") {
    return true;
  }
  const expression = new RegExp(
    `^${route
      .split("/")
      .map((segment) =>
        /^\[.+\]$/.test(segment)
          ? "[^/]+"
          : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/")}$`,
  );
  return expression.test(pathname);
}

function staticRoute(route) {
  return route.includes("[") ? route.slice(0, route.indexOf("/[")) : route;
}

function entryLabel(entryId) {
  const labelToken = contract.entries[entryId]?.labelToken ?? entryId;
  return labelToken.match(/"([^"]+)"/)?.[1] ?? labelToken;
}

function routeGroup(route) {
  if (["/finance", "/rent-income", "/bills-expenses", "/balances", "/leases", "/ledger", "/petty-cash"].includes(route)) {
    return "Finance";
  }
  if (["/maintenance", "/tasks", "/recurring-tasks", "/inspections", "/work-orders"].includes(route)) {
    return "(?:Maintenance|Operations)";
  }
  if (["/timeline", "/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents", "/import"].includes(route)) {
    return "Records";
  }
  return null;
}
