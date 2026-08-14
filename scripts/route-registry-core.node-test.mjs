import assert from "node:assert/strict";
import test from "node:test";

import { buildRouteRegistry } from "./route-registry-core.mjs";

const uiRoutes = [
  {
    route: "/workspace",
    roles: ["super_admin"],
    source: "src/app/workspace/page.tsx",
    surface: "workspace",
  },
  {
    route: "/leases",
    roles: ["super_admin", "finance_manager"],
    source: "src/app/(dashboard)/leases/page.tsx",
    surface: "workspace",
  },
];

const authenticated = {
  routes: [
    {
      capability: "canConfigureLeases",
      guard: "requireWorkspaceContext",
      guardSource: "src/app/(dashboard)/leases/page.tsx",
      roleAccess: {
        finance_manager: ["global", "shell-leases", "fm:leases"],
        super_admin: ["global", "shell-leases", "sa:leases"],
      },
      route: "/leases",
    },
  ],
};

const contentReview = {
  routes: [
    { route: "/workspace", result: "pass" },
    { route: "/leases", result: "pass" },
  ],
};

test("inherits shared route facts from the canonical UI inventory", () => {
  const registry = buildRouteRegistry({
    authenticated,
    contentReview,
    uiRoutes,
  });

  assert.deepEqual(registry.issues, []);
  assert.equal(registry.counts.all, 2);
  assert.equal(registry.counts.authenticated, 1);
  assert.equal(
    registry.authenticated.routes[0].source,
    "src/app/(dashboard)/leases/page.tsx",
  );
  assert.deepEqual(registry.authenticated.routes[0].roles, [
    "super_admin",
    "finance_manager",
  ]);
});

test("reports stale overlay routes and missing manual reviews", () => {
  const registry = buildRouteRegistry({
    authenticated: {
      routes: [...authenticated.routes, { route: "/missing" }],
    },
    contentReview: { routes: [{ route: "/leases", result: "pass" }] },
    uiRoutes,
  });

  assert.deepEqual(registry.issues, [
    "authenticated route /missing is absent from config/ui-route-coverage.json",
    "content review is missing canonical route /workspace",
  ]);
});

test("rejects copied source metadata that can drift from the canonical route", () => {
  const registry = buildRouteRegistry({
    authenticated: {
      routes: [
        {
          ...authenticated.routes[0],
          source: "src/app/(dashboard)/old-leases/page.tsx",
        },
      ],
    },
    contentReview,
    uiRoutes,
  });

  assert.deepEqual(registry.issues, [
    "/leases: authenticated source metadata duplicates and conflicts with the canonical source",
  ]);
});
