import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  buildDeniedGlobalEntryChecks,
  buildDiscoverabilityPlan,
  createPassedJourneyEvidence,
  createSessionStartEvidence,
  directDenialRoutes,
  findForbiddenGlobalEntries,
  validateDiscoverabilityEvidence,
} from "./smoke-authenticated-route-discoverability-core.mjs";

const contract = JSON.parse(
  await readFile("config/authenticated-route-discoverability.json", "utf8"),
);

// Load the runner's actual journey functions without its top-level login/browser
// side effects. Only the external browser boundary is replaced below.
const runner = await readFile("scripts/smoke-authenticated-route-discoverability.mjs", "utf8");
const journeyFunctions = runner.slice(runner.indexOf("async function openJourney("));
function loadJourneys(boundary = {}) {
  return runInNewContext(`${journeyFunctions}\n({ openContextJourney, matchesContractPath, routeGroup })`, {
    URL, contract, baseUrl: "http://localhost:3000", ...boundary,
  });
}

test("every authorized context entry has an executable browser strategy", async () => {
  const missing = [];
  const browserBoundary = new Error("browser boundary reached");
  const page = new Proxy({}, { get() { throw browserBoundary; } });
  const { openContextJourney } = loadJourneys();
  for (const journey of buildDiscoverabilityPlan(contract).filter((item) => item.classification === "context")) {
    try {
      await openContextJourney(page, journey, []);
    } catch (error) {
      if (error !== browserBoundary) missing.push(`${journey.id}: ${error.message}`);
    }
  }
  assert.deepEqual(missing, []);
});

for (const [entryId, route, expected] of [
  ["finance-accounts", "/finance/accounts", ["Advanced", "Chart of Accounts"]],
  ["finance-accounts", "/finance/funding-sources", ["Advanced", "Chart of Accounts"]],
  ["finance-account-detail", "/finance/accounts/[accountId]", ["Advanced", "Chart of Accounts", "Activity for Operating bank"]],
  ["settings-roles", "/settings/roles", ["Settings", "Roles"]],
  ["property-detail", "/properties/[propertyId]", ["Properties", "Central Residence"]],
  ["units-list", "/units", ["Properties", "Units"]],
  ["unit-detail", "/units/[unitId]", ["Properties", "Units", "View unit 1A details"]],
  ["maintenance-recurring", "/recurring-tasks", ["Cases", "Mobile viewport 390x844", "Maintenance workspace menu", "Recurring work"]],
  ["maintenance-inspections", "/inspections", ["Cases", "Mobile viewport 390x844", "Maintenance workspace menu", "Inspections"]],
  ["maintenance-work-orders", "/work-orders", ["Cases", "Mobile viewport 390x844", "Maintenance workspace menu", "Work orders"]],
]) {
  test(`${entryId} ${route} follows visible links without direct navigation`, async () => {
    let pathname = "/overview";
    let viewport = { width: 1440, height: 900 };
    let maintenanceMenuOpen = false;
    const pages = {
      "/overview": [{ name: "Advanced", href: "/finance/advanced" }, { name: "Settings", href: "/settings" }, { name: "Properties", href: "/properties" }, { name: "Cases", href: "/maintenance" }],
      "/finance/advanced": [{ name: "Chart of Accounts", href: "/finance/accounts" }],
      "/finance/accounts": [{ name: "Activity for Operating bank", href: "/finance/accounts/account-1" }],
      "/settings": [{ name: "Roles", href: "/settings/roles" }],
      "/properties": [{ name: "Central Residence", href: "/properties/property-1" }, { name: "Units", href: "/units" }],
      "/units": [{ name: "View unit 1A details", href: "/units/unit-1", role: "button" }],
      "/maintenance": [
        { name: "Recurring work", href: "/recurring-tasks", role: "menuitem" },
        { name: "Inspections", href: "/inspections", role: "menuitem" },
        { name: "Work orders", href: "/work-orders", role: "menuitem" },
      ],
    };
    const locate = (predicate) => {
      const link = pages[pathname]?.find(predicate);
      assert.ok(link, `visible link missing at ${pathname}`);
      return {
        first() { return this; },
        async isVisible() { return true; },
        async waitFor() {},
        async click() { pathname = link.href; },
        async textContent() { return link.name; },
        async getAttribute(name) { return name === "aria-label" ? link.name : link.href; },
      };
    };
    const page = {
      locator(selector) {
        const href = selector.match(/\[href="([^"]+)"\]/)?.[1];
        const prefix = selector.match(/\[href\^="([^"]+)"\]/)?.[1];
        return locate((link) => href ? link.href === href : prefix && link.href.startsWith(prefix));
      },
      getByRole(role, { name }) {
        if (role === "navigation" && name === "Maintenance workspace") {
          assert.equal(viewport.width, 390, "the existing menu is mobile-only");
          return { getByRole: () => ({ click: async () => { maintenanceMenuOpen = true; } }) };
        }
        if (role === "menuitem") assert.equal(maintenanceMenuOpen, true);
        return locate((link) => (link.role ?? "link") === role && (typeof name === "string" ? link.name === name : name.test(link.name)));
      },
      viewportSize() { return viewport; },
      async setViewportSize(next) { viewport = next; },
      async waitForURL(predicate) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.ok(predicate(new URL(`http://localhost:3000${pathname}`)), `unexpected destination ${pathname}`);
      },
      async waitForLoadState() {},
      url() { return `http://localhost:3000${pathname}`; },
      goto() { assert.fail("discoverability must use visible links, not goto"); },
    };
    const { openContextJourney, matchesContractPath } = loadJourneys();
    const chain = [];
    await openContextJourney(page, { entryId, route, role: "super_admin" }, chain);
    assert.deepEqual(chain, expected);
    assert.equal(matchesContractPath(pathname, route), true);
    assert.deepEqual(viewport, { width: 1440, height: 900 });
  });
}

test("the Advanced entry expands the Finance sidebar group", () => {
  assert.equal(loadJourneys().routeGroup("/finance/advanced"), "Finance");
});

test("the Leases entry expands Properties rather than Finance", () => {
  assert.equal(loadJourneys().routeGroup("/leases"), "Properties");
});

test("maintenance readers get truthful read journeys while Finance remains denied", () => {
  const plan = buildDiscoverabilityPlan(contract).filter((journey) => journey.role === "operations_member");
  for (const route of ["/maintenance", "/recurring-tasks", "/inspections", "/work-orders"]) {
    assert.ok(plan.some((journey) => journey.route === route), `${route} read journey missing`);
  }
  assert.deepEqual(findForbiddenGlobalEntries(contract, "operations_member", ["/maintenance"]), []);
  assert.equal(findForbiddenGlobalEntries(contract, "operations_member", ["/finance"]).length, 1);
});

test("builds one shell-start visible-link journey for every authorized role and route", () => {
  const plan = buildDiscoverabilityPlan(contract);

  const expectedJourneyIds = contract.routes.flatMap((route) =>
    contract.roles.flatMap((role) =>
      route.roleAccess[role][0] === "inaccessible"
        ? []
        : [route.roleAccess[role][2]],
    ),
  );
  assert.deepEqual(
    plan.map((journey) => journey.id).sort(),
    expectedJourneyIds.sort(),
  );
  assert.equal(new Set(plan.map((journey) => journey.id)).size, plan.length);
  assert.ok(plan.every((journey) => journey.entryId));
  assert.ok(plan.every((journey) => journey.classification !== "inaccessible"));
});

test("keeps direct denial checks separate from discoverability evidence", () => {
  assert.deepEqual(directDenialRoutes, {
    finance_manager: "/properties",
    finance_member: "/reports",
    operations_manager: "/finance",
    operations_member: "/finance",
    super_admin: null,
  });
});

test("serializes click chains for the tracked report schema", () => {
  assert.deepEqual(
    createPassedJourneyEvidence("sa:overview", ["Overview"]),
    {
      chain: ["Overview"],
      id: "sa:overview",
      status: "passed",
    },
  );
  assert.deepEqual(
    createSessionStartEvidence("super_admin", "/overview"),
    {
      chain: ["/workspace", "Automatic role redirect"],
      destination: "/overview",
      role: "super_admin",
      status: "passed",
    },
  );
});

test("derives denied global href checks from authorized entry metadata", () => {
  const checks = buildDeniedGlobalEntryChecks(contract, "finance_manager");

  assert.ok(checks.length > 0);
  assert.ok(checks.every((check) => check.href.startsWith("/")));
  assert.ok(checks.every((check) => !check.href.includes("Requires")));
  assert.deepEqual(
    checks.find((check) => check.route === "/properties"),
    {
      entryId: "shell-properties",
      href: "/properties",
      route: "/properties",
    },
  );
});

test("denied global checks fail when a forbidden anchor is injected", () => {
  assert.deepEqual(
    findForbiddenGlobalEntries(contract, "finance_manager", [
      "/finance",
      "/properties",
    ]),
    [
      {
        entryId: "shell-properties",
        href: "/properties",
        route: "/properties",
      },
    ],
  );
});

test("validates one workspace session per role and shell-relative journey chains", () => {
  const plan = buildDiscoverabilityPlan(contract);
  const evidence = {
    denials: Object.entries(directDenialRoutes)
      .filter(([, route]) => route)
      .map(([role, route]) => ({ role, route, status: "passed" })),
    deniedGlobalAbsence: contract.roles.map((role) => ({
      checked: buildDeniedGlobalEntryChecks(contract, role).length,
      role,
      status: "passed",
    })),
    journeys: plan.map((journey) =>
      createPassedJourneyEvidence(journey.id, [journey.entryId]),
    ),
    passed: plan.length,
    sessionStarts: contract.roles.map((role) =>
      createSessionStartEvidence(role, "/entry"),
    ),
    total: plan.length,
  };

  assert.deepEqual(validateDiscoverabilityEvidence(contract, evidence), []);
  evidence.journeys[0].chain.unshift("/workspace");
  assert.match(
    validateDiscoverabilityEvidence(contract, evidence).join("\n"),
    /must not repeat the workspace session start/,
  );
});
