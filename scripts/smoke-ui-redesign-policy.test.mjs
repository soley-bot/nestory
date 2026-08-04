import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createReadOnlyRequestPolicy,
  validateLocalBaseUrl,
} from "./smoke-ui-redesign-policy.mjs";
import * as smokePolicy from "./smoke-ui-redesign-policy.mjs";

const routeManifest = JSON.parse(
  await readFile(
    new URL("../config/ui-route-coverage.json", import.meta.url),
    "utf8",
  ),
);

describe("validateLocalBaseUrl", () => {
  it.each([
    ["http://localhost:3000/", "http://localhost:3000"],
    ["https://127.0.0.1:3443/path?mode=smoke#result", "https://127.0.0.1:3443"],
    ["http://[::1]:3000/", "http://[::1]:3000"],
  ])("accepts the loopback base URL %s", (value, expected) => {
    expect(validateLocalBaseUrl(value)).toBe(expected);
  });

  it("rejects a remote host", () => {
    expect(() => validateLocalBaseUrl("https://nestory.example.com")).toThrow(
      "BASE_URL must use a loopback host",
    );
  });

  it("rejects URL userinfo", () => {
    expect(() => validateLocalBaseUrl("http://user:secret@localhost:3000")).toThrow(
      "BASE_URL must not include userinfo",
    );
  });

  it("rejects a non-http protocol", () => {
    expect(() => validateLocalBaseUrl("file://localhost/tmp/nestory")).toThrow(
      "BASE_URL must use http or https",
    );
  });
});

describe("createReadOnlyRequestPolicy", () => {
  it("blocks an arbitrary same-origin POST before authentication", () => {
    const policy = createPolicy();

    expect(
      policy.evaluate({
        headers: { "next-action": "landing-action" },
        method: "POST",
        url: "http://localhost:3000/overview",
      }).allowed,
    ).toBe(false);
  });

  it("allows exactly one login server action POST", () => {
    const policy = createPolicy();
    const request = loginRequest();

    expect(policy.evaluate(request).allowed).toBe(true);
    expect(policy.evaluate(request).allowed).toBe(false);
  });

  it("allows the one same-origin Next 16 multipart login submission", () => {
    const policy = createPolicy();
    const request = {
      headers: {
        "content-type": "multipart/form-data; boundary=login-boundary",
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/login",
      },
      method: "POST",
      url: "http://localhost:3000/login",
    };

    expect(policy.evaluate(request).allowed).toBe(true);
    expect(policy.evaluate(request).allowed).toBe(false);
  });

  it("blocks a login POST without a recognized server-action signature", () => {
    const policy = createPolicy();

    expect(
      policy.evaluate({
        headers: {},
        method: "POST",
        url: "http://localhost:3000/login",
      }).allowed,
    ).toBe(false);
  });

  it("blocks a later landing-page POST after authentication", () => {
    const policy = createPolicy();

    expect(policy.evaluate(loginRequest()).allowed).toBe(true);
    expect(
      policy.evaluate({
        headers: { "next-action": "landing-action" },
        method: "POST",
        url: "http://localhost:3000/",
      }).allowed,
    ).toBe(false);
  });

  it("continues to allow read-only methods after authentication", () => {
    const policy = createPolicy();

    expect(policy.evaluate(loginRequest()).allowed).toBe(true);

    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        policy.evaluate({
          headers: {},
          method,
          url: "http://localhost:3000/properties",
        }).allowed,
      ).toBe(true);
    }
  });
});

describe("smoke failure aggregation", () => {
  it("uses navigation errors consistently for route and aggregate failures", () => {
    expect(smokePolicy.getRouteResultFailures).toBeTypeOf("function");

    const result = {
      accessibility: null,
      accessResult: "accessible",
      consoleErrors: [],
      expectedAccess: "accessible",
      horizontalOverflow: { error: null, hasOverflow: false },
      navigationError: "Navigation timed out",
      pageErrors: [],
      primaryActions: { error: null, reachable: true },
      queryVerified: true,
      route: "/reports",
      viewport: "desktop",
    };

    expect(smokePolicy.getRouteResultFailures(result)).toEqual([
      "desktop /reports: navigation-error",
    ]);
    expect(smokePolicy.collectSmokeFailures([result], [], [])).toEqual([
      "desktop /reports: navigation-error",
    ]);
  });
});

describe("browser acceptance matrix policy", () => {
  it("retains both required laptop capture sizes and the useful existing viewports", () => {
    expect(smokePolicy.MAIN_CAPTURE_VIEWPORTS).toEqual([
      { height: 900, name: "desktop", width: 1440 },
      { height: 800, name: "laptop", width: 1280 },
      { height: 768, name: "compact-desktop", width: 1024 },
      { height: 844, name: "phone", width: 390 },
    ]);
    expect(smokePolicy.MAINTENANCE_CAPTURE_VIEWPORTS).toEqual([
      { height: 900, name: "desktop", width: 1440 },
      { height: 800, name: "laptop", width: 1280 },
      { height: 768, name: "compact-desktop", width: 1024 },
      { height: 844, name: "phone", width: 390 },
    ]);
  });

  it("maps every required final matrix route including Maintenance board", () => {
    expect(smokePolicy.FINAL_ACCEPTANCE_ROUTES).toEqual([
      { label: "Overview", manifestRoute: "/overview" },
      { label: "Properties", manifestRoute: "/properties" },
      { label: "Units", manifestRoute: "/units" },
      { label: "People", manifestRoute: "/people" },
      { label: "Leases", manifestRoute: "/leases" },
      { label: "Maintenance list", path: "/maintenance", source: "maintenance" },
      { label: "Maintenance board", path: "/maintenance?view=board", source: "maintenance" },
      { label: "Records", manifestRoute: "/timeline" },
      { label: "Settings", manifestRoute: "/settings" },
      { label: "Workspace Access", manifestRoute: "/users-roles" },
      { label: "Account", manifestRoute: "/account" },
      { label: "Finance Operations", manifestRoute: "/rent-income" },
      { label: "Ledger", manifestRoute: "/ledger" },
      { label: "Reports", manifestRoute: "/reports" },
    ]);

    const manifestRoutes = new Set(routeManifest.map((entry) => entry.route));
    for (const route of smokePolicy.FINAL_ACCEPTANCE_ROUTES) {
      if (route.manifestRoute) {
        expect(manifestRoutes.has(route.manifestRoute)).toBe(true);
      }
    }
  });

  it("resolves the five 200%-equivalent keyboard routes from exact manifest paths", () => {
    expect(smokePolicy.resolveKeyboardZoomRoutes(routeManifest)).toEqual([
      { expectedAccess: "accessible", label: "Overview", manifestRoute: "/overview", path: "/overview" },
      { expectedAccess: "accessible", label: "Leases", manifestRoute: "/leases", path: "/leases?query=Dara" },
      { expectedAccess: "accessible", label: "Maintenance", manifestRoute: "/maintenance", path: "/maintenance?view=list&query=Kitchen" },
      {
        expectedAccess: "accessible",
        label: "Property detail",
        manifestRoute: "/properties/[propertyId]",
        path: "/properties/10000000-0000-0000-0000-000000000001",
      },
      { expectedAccess: "accessible", label: "Settings", manifestRoute: "/settings", path: "/settings" },
    ]);
    expect(smokePolicy.KEYBOARD_ZOOM_VIEWPORT).toEqual({
      height: 450,
      name: "zoom-equivalent-200",
      width: 720,
    });
  });

  it("derives viewport names and pass counts from the supplied viewport matrix", () => {
    const viewports = [
      { height: 900, name: "wide", width: 1440 },
      { height: 800, name: "laptop", width: 1280 },
    ];
    const results = [
      passingRouteResult("wide"),
      passingRouteResult("laptop"),
    ];

    expect(smokePolicy.formatViewportSummary(viewports)).toBe(
      "wide (1440x900) and laptop (1280x800)",
    );
    expect(smokePolicy.formatViewportPass(results, viewports)).toBe("2/2 pass");
    expect(smokePolicy.formatViewportPass(results.slice(0, 1), viewports)).toBe(
      "1/2 FAIL",
    );
  });
});

describe("200%-equivalent keyboard audit policy", () => {
  it("fails missing, overflow, and unreachable keyboard evidence", () => {
    const result = passingKeyboardAudit();
    result.h1.count = 0;
    result.horizontalOverflow.hasOverflow = true;
    result.keyboardTraversal.reachedTargets = [];
    result.keyboardTraversal.reachedRegions = [];
    result.keyboardTraversal.unreachableTargets = [{ key: "button:nth-of-type(1)" }];
    result.keyboardTraversal.offViewportFocus = [{ key: "a:nth-of-type(2)" }];
    result.keyboardTraversal.reverseTraversal.reached = false;
    result.screenshotPath = null;

    expect(smokePolicy.getKeyboardZoomAuditFailures(result)).toEqual([
      "zoom-equivalent-200 /overview: expected exactly one H1, received 0",
      "zoom-equivalent-200 /overview: horizontal overflow check failed",
      "zoom-equivalent-200 /overview: no keyboard focus targets reached",
      "zoom-equivalent-200 /overview: no keyboard focus regions reached",
      "zoom-equivalent-200 /overview: 1 keyboard target(s) unreachable",
      "zoom-equivalent-200 /overview: 1 off-viewport focus target(s)",
      "zoom-equivalent-200 /overview: reverse keyboard traversal failed",
      "zoom-equivalent-200 /overview: screenshot evidence missing",
    ]);
  });

  it("fails a suite when any required keyboard route is absent", () => {
    expect(smokePolicy.getKeyboardZoomSuiteFailures([passingKeyboardAudit()])).toContain(
      "zoom-equivalent-200: missing keyboard audit for Leases (/leases)",
    );
  });

  it("reports the CSS viewport equivalent without claiming actual browser zoom", () => {
    const text = smokePolicy.renderKeyboardZoomEvidence([
      passingKeyboardAudit(),
    ]);

    expect(text).toContain("720x450 CSS viewport equivalent to 1440x900 at 200%");
    expect(text).toContain("Actual 200% browser zoom remains manual and unverified");
    expect(text).not.toMatch(/actual 200% browser zoom (?:passed|verified|covered)/i);
  });
});

function createPolicy() {
  return createReadOnlyRequestPolicy({ baseUrl: "http://localhost:3000" });
}

function loginRequest() {
  return {
    headers: { "next-action": "login-action" },
    method: "POST",
    url: "http://localhost:3000/login",
  };
}

function passingRouteResult(viewport) {
  return {
    accessibility: null,
    accessResult: "accessible",
    consoleErrors: [],
    expectedAccess: "accessible",
    horizontalOverflow: { error: null, hasOverflow: false },
    navigationError: null,
    pageErrors: [],
    primaryActions: { error: null, reachable: true },
    queryVerified: true,
    route: "/overview",
    viewport,
  };
}

function passingKeyboardAudit() {
  return {
    accessResult: "accessible",
    expectedAccess: "accessible",
    h1: { count: 1, error: null, texts: ["Overview"] },
    horizontalOverflow: { error: null, hasOverflow: false },
    keyboardTraversal: {
      eligibleTargets: [{ key: "a:nth-of-type(1)", region: "Primary" }],
      error: null,
      offViewportFocus: [],
      reachedRegions: ["Primary"],
      reachedTargets: [{ key: "a:nth-of-type(1)", region: "Primary" }],
      reverseTraversal: {
        attempted: true,
        reached: true,
        target: { key: "a:nth-of-type(1)", region: "Primary" },
      },
      unreachableTargets: [],
    },
    label: "Overview",
    manifestRoute: "/overview",
    navigationError: null,
    route: "/overview",
    screenshotError: null,
    screenshotPath: "artifacts/ui-redesign/run/zoom-equivalent-200/overview.png",
    viewport: "zoom-equivalent-200",
  };
}
