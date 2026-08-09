import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("builds one shell-start visible-link journey for every authorized role and route", () => {
  const plan = buildDiscoverabilityPlan(contract);

  assert.equal(plan.length, 66);
  assert.deepEqual(
    Object.fromEntries(
      contract.roles.map((role) => [
        role,
        plan.filter((journey) => journey.role === role).length,
      ]),
    ),
    {
      finance_manager: 11,
      finance_member: 9,
      operations_manager: 6,
      operations_member: 2,
      super_admin: 38,
    },
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
    operations_member: "/maintenance",
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
      chain: ["/workspace", "Open workspace"],
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
