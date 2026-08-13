import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import routeCoverageJson from "../../../config/ui-route-coverage.json";

import {
  getUiRouteContract,
  getUiRoutesForPhase,
  uiPersonaWorkspaceRoles,
  uiRouteCoverage,
  type UiRouteContract,
} from "./route-coverage";

const validPhases = new Set([2, 3, 4, 5, 6]);
const validRoles = new Set([
  "public",
  "unlinked",
  "super_admin",
  "finance_manager",
  "finance_member",
  "operations_manager",
  "operations_member",
]);
const validSurfaces = new Set([
  "public",
  "auth",
  "workspace",
  "detail",
  "settings",
]);
const validStates = new Set([
  "loading",
  "populated",
  "empty",
  "filtered-empty",
  "error",
  "permission-blocked",
  "draft",
  "saving",
  "success",
  "redirected",
]);

function findPageSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return findPageSources(entryPath);
    }

    if (entry.name !== "page.tsx") {
      return [];
    }

    return [relative(process.cwd(), entryPath).replaceAll("\\", "/")];
  });
}

function routeFromSource(source: string): string {
  const segments = source
    .replace(/^src\/app\//, "")
    .replace(/(^|\/)page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

describe("UI route coverage contract", () => {
  it("validates every manifest row against the route contract", () => {
    for (const entry of routeCoverageJson) {
      const contract: UiRouteContract = entry as UiRouteContract;

      expect(contract.route).toMatch(/^\//);
      expect(contract.source).toMatch(/^src\/app\/.+\/page\.tsx$|^src\/app\/page\.tsx$/);
      expect(validPhases.has(contract.phase)).toBe(true);
      expect(validSurfaces.has(contract.surface)).toBe(true);
      expect(contract.roles.length).toBeGreaterThan(0);
      expect(contract.roles.every((role) => validRoles.has(role))).toBe(true);
      expect(contract.states.every((state) => validStates.has(state))).toBe(true);

      expect(contract.states.length).toBeGreaterThan(0);
    }
  });

  it("requires one unique manifest source for each current page route", () => {
    const pageSources = findPageSources(join(process.cwd(), "src", "app")).sort();
    const manifestSources = routeCoverageJson.map(({ source }) => source).sort();

    expect(new Set(manifestSources).size).toBe(manifestSources.length);
    expect(manifestSources).toEqual(pageSources);
    expect(
      routeCoverageJson.map(({ route }) => route).sort(),
    ).toEqual(pageSources.map(routeFromSource).sort());

    for (const entry of routeCoverageJson) {
      expect(entry.route).toBe(routeFromSource(entry.source));
    }
  });

  it("retains literal dynamic segment names", () => {
    const routes = new Set(routeCoverageJson.map(({ route }) => route));

    for (const route of [
      "/people/[personId]",
      "/properties/[propertyId]",
      "/properties/[propertyId]/account",
      "/reports/[reportKind]",
      "/units/[unitId]",
    ]) {
      expect(routes.has(route)).toBe(true);
    }
  });

  it("uses the seeded person record for the People detail smoke route", () => {
    const personDetail = routeCoverageJson.find(
      ({ route }) => route === "/people/[personId]",
    );
    expect(personDetail?.smoke.path).toBe(
      "/people/80000000-0000-4000-8000-000000000001",
    );
  });

  it("models the workspace entry as a linked-persona recovery surface", () => {
    expect(getUiRouteContract("/workspace")).toMatchObject({
      roles: [
        "super_admin",
        "finance_manager",
        "finance_member",
        "operations_manager",
        "operations_member",
      ],
      states: ["redirected", "permission-blocked"],
      surface: "workspace",
    });
  });

  it("maps fixture personas to real base workspace roles", () => {
    expect(uiPersonaWorkspaceRoles).toEqual({
      finance_manager: ["finance_manager"],
      finance_member: ["finance_member"],
      operations_manager: ["operations_manager"],
      operations_member: ["operations_member"],
      public: [],
      super_admin: ["super_admin"],
      unlinked: [],
    });
  });

  it("contains no redirect-only aliases", () => {
    expect(
      routeCoverageJson.every(
        (route) => (route as { surface: string }).surface !== "redirect",
      ),
    ).toBe(true);
  });

  it("records the fixed-role access matrix for Finance and Operations routes", () => {
    for (const route of [
      "/finance",
      "/rent-income",
      "/bills-expenses",
      "/balances",
      "/leases",
      "/ledger",
      "/petty-cash",
      "/properties/[propertyId]/account",
    ]) {
      expect(getUiRouteContract(route)?.roles, route).toEqual([
        "super_admin",
        "finance_manager",
        "finance_member",
      ]);
    }

    for (const route of [
      "/maintenance",
      "/work-orders",
      "/inspections",
      "/recurring-tasks",
    ]) {
      expect(getUiRouteContract(route)?.roles, route).toEqual([
        "super_admin",
        "operations_manager",
      ]);
    }
    expect(getUiRouteContract("/tasks")?.roles).toEqual([
      "super_admin",
      "operations_manager",
      "operations_member",
    ]);
  });

  it("exposes typed route and phase lookup helpers", () => {
    expect(uiRouteCoverage).toEqual(routeCoverageJson);
    expect(getUiRouteContract("/properties")?.source).toBe(
      "src/app/(dashboard)/properties/page.tsx",
    );
    expect(getUiRouteContract("/missing")).toBeUndefined();
    expect(getUiRoutesForPhase(2).map(({ route }) => route)).toEqual([
      "/workspace",
    ]);
  });
});
