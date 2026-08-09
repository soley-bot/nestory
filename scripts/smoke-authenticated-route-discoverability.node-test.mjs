import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDiscoverabilityPlan,
  directDenialRoutes,
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
