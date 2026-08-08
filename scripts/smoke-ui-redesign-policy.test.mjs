import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createReadOnlyRequestPolicy,
  validateLocalBaseUrl,
} from "./smoke-ui-redesign-policy.mjs";
import * as smokePolicy from "./smoke-ui-redesign-policy.mjs";

const artifactPolicy = await import("./smoke-ui-redesign-artifacts.mjs").catch(
  () => ({}),
);

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
      screenshot: {
        error: null,
        height: 900,
        path: "desktop/reports-1440x900.png",
        width: 1440,
      },
      viewport: "desktop",
      viewportHeight: 900,
      viewportWidth: 1440,
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
      { label: "Finance Operations", manifestRoute: "/finance" },
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
      { expectedAccess: "accessible", label: "Overview", manifestRoute: "/overview", operationalSurfaceKey: "overview-operating-work", operationalSurfaceSelector: "[data-slot=\"overview-operating-scroll\"]", path: "/overview" },
      { expectedAccess: "accessible", label: "Leases", manifestRoute: "/leases", operationalSurfaceKey: "leases-register", operationalSurfaceSelector: "[data-slot=\"workspace-main-surface\"]", path: "/leases?query=Dara" },
      { expectedAccess: "accessible", label: "Maintenance", manifestRoute: "/maintenance", operationalSurfaceKey: "maintenance-workspace", operationalSurfaceSelector: "[data-slot=\"workspace-main-surface\"]", path: "/maintenance?view=list&query=Kitchen" },
      {
        expectedAccess: "accessible",
        label: "Property detail",
        manifestRoute: "/properties/[propertyId]",
        operationalSurfaceKey: "property-record-panel",
        operationalSurfaceSelector: "[role=\"tabpanel\"]",
        path: "/properties/10000000-0000-0000-0000-000000000001",
      },
      { expectedAccess: "accessible", label: "Settings", manifestRoute: "/settings", operationalSurfaceKey: "settings-workspace", operationalSurfaceSelector: "[data-testid=\"settings-workspace\"]", path: "/settings" },
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
    result.keyboardTraversal.forwardUnreachableTargets = [
      { key: "button:nth-of-type(1)" },
    ];
    result.keyboardTraversal.offViewportFocus = [{ key: "a:nth-of-type(2)" }];
    result.keyboardTraversal.reverseTraversal.reached = false;
    result.screenshot.path = null;
    result.screenshotPath = null;

    expect(smokePolicy.getKeyboardZoomAuditFailures(result)).toEqual([
      "zoom-equivalent-200 /overview: expected exactly one H1, received 0",
      "zoom-equivalent-200 /overview: horizontal overflow check failed",
      "zoom-equivalent-200 /overview: no keyboard focus targets reached",
      "zoom-equivalent-200 /overview: no keyboard focus regions reached",
      "zoom-equivalent-200 /overview: no forward-reached route operational-surface target",
      "zoom-equivalent-200 /overview: no reached main work-surface target",
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

  it("fails missing work-surface and complete reverse traversal evidence", () => {
    const result = passingKeyboardAudit();
    result.keyboardTraversal.eligibleTargets[0].inWorkSurface = false;
    result.keyboardTraversal.reachedTargets[0].inWorkSurface = false;
    result.keyboardTraversal.requiredWorkSurfaceTargetKeys = [];
    result.keyboardTraversal.reverseUnreachableTargets = [
      { key: "a:nth-of-type(1)" },
    ];

    expect(smokePolicy.getKeyboardZoomAuditFailures(result)).toEqual([
      "zoom-equivalent-200 /overview: no eligible main work-surface target",
      "zoom-equivalent-200 /overview: no reached main work-surface target",
      "zoom-equivalent-200 /overview: 1 reverse keyboard target(s) unreachable",
    ]);
  });

  it("rejects header-only focus even when it is under the generic app shell", () => {
    const result = passingKeyboardAudit();
    result.keyboardTraversal.eligibleTargets[0].operationalSurfaceKey = null;
    result.keyboardTraversal.reachedTargets[0].operationalSurfaceKey = null;
    result.keyboardTraversal.reverseReachedTargets[0].operationalSurfaceKey = null;
    result.keyboardTraversal.operationalSurface.eligibleTargetKeys = [];

    expect(smokePolicy.getKeyboardZoomAuditFailures(result).join("\n")).toContain(
      "no eligible route operational-surface target",
    );
    expect(smokePolicy.getKeyboardZoomAuditFailures(result).join("\n")).toContain(
      "no forward-reached route operational-surface target",
    );
    expect(smokePolicy.getKeyboardZoomAuditFailures(result).join("\n")).toContain(
      "no reverse-reached route operational-surface target",
    );
  });
});

describe("tracked evidence summary validation", () => {
  it("accepts only the complete versioned real-manifest evidence shape", () => {
    expect(validateSummary(createValidSummary())).toEqual([]);
  });

  it("rejects older summaries with a clear rerun message", () => {
    expect(validateSummary({})).toEqual([
      "Unsupported UI evidence summary schema; rerun the current axe-enabled browser harness to produce schema version 1.",
    ]);
  });

  it.each([
    ["empty main results", (summary) => { summary.results = []; }, "missing main result"],
    ["partial main results", (summary) => { summary.results.pop(); }, "missing main result"],
    ["duplicate main results", (summary) => { summary.results.push(summary.results[0]); }, "duplicate main result"],
    ["unknown main results", (summary) => { summary.results[0].manifestRoute = "/unknown"; }, "unknown main result"],
    ["non-Axe summaries", (summary) => { summary.axeEnabled = false; }, "axeEnabled must be true"],
    ["failed Axe captures", (summary) => { summary.results[0].accessibility = null; }, "successful axe result missing"],
    ["missing board evidence", (summary) => { summary.maintenanceBoardResults = []; }, "missing Maintenance board result"],
    ["missing role evidence", (summary) => { summary.roleAudits.pop(); }, "missing anonymous role audit"],
    ["failing main results", (summary) => { summary.results[0].horizontalOverflow.hasOverflow = true; }, "main result failed"],
    ["malformed arrays", (summary) => { summary.results = null; }, "results must be an array"],
    ["duplicate keyboard evidence", (summary) => { summary.keyboardZoomAudits.push(summary.keyboardZoomAudits[0]); }, "duplicate keyboard audit"],
    ["wrong keyboard route contracts", (summary) => { summary.keyboardZoomAudits[0].route = "/overview?wrong=true"; }, "keyboard audit Overview does not match its manifest contract"],
    ["missing reverse work-surface proof", (summary) => { summary.keyboardZoomAudits[0].keyboardTraversal.reverseReachedTargets = []; }, "no reverse-reached main work-surface target"],
    ["missing forward wrap proof", (summary) => { summary.keyboardZoomAudits[0].keyboardTraversal.forwardTraversal.reached = false; }, "forward keyboard traversal failed"],
    ["missing producer metadata", (summary) => { delete summary.producer; }, "producer metadata is invalid"],
    ["missing run metadata", (summary) => { delete summary.completedAt; }, "startedAt and completedAt must be valid"],
    ["wrong operational selector contract", (summary) => { summary.keyboardZoomAudits[0].operationalSurfaceContract.selector = "main"; }, "keyboard audit Overview does not match its manifest contract"],
  ])("rejects %s", (_label, mutate, expected) => {
    const summary = createValidSummary();
    mutate(summary);

    expect(validateSummary(summary).join("\n")).toContain(expected);
  });
});

describe("exact screenshot evidence policy", () => {
  it("parses dimensions directly from a PNG IHDR", () => {
    const png = Buffer.alloc(24);
    Buffer.from("89504e470d0a1a0a", "hex").copy(png, 0);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(800, 20);

    expect(smokePolicy.readPngDimensions?.(png)).toEqual({
      height: 800,
      width: 1280,
    });
  });

  it("fails a viewport screenshot with expanded dimensions", () => {
    expect(
      smokePolicy.getScreenshotFailures?.({
        screenshot: {
          error: null,
          height: 1200,
          path: "desktop/overview-1280x800.png",
          width: 1280,
        },
        viewportHeight: 800,
        viewportWidth: 1280,
      }),
    ).toEqual(["screenshot dimensions 1280x1200 do not match viewport 1280x800"]);
  });

  it("keeps milliseconds plus mode and PID in artifact run names", () => {
    expect(
      smokePolicy.buildArtifactRunName?.({
        date: new Date("2026-08-04T10:11:12.345Z"),
        mode: "axe",
        pid: 4321,
        prefix: "ui",
      }),
    ).toBe("ui-2026-08-04T10-11-12.345Z-axe-p4321");
  });
});

describe("filesystem-backed evidence artifacts", () => {
  it("accepts real in-run PNG files and rejects forged artifact claims", async () => {
    const fixture = await createArtifactFixture();

    try {
      expect(await validateArtifacts(fixture.summary, fixture.workspaceRoot)).toEqual(
        [],
      );

      const first = fixture.summary.results[0];
      const second = fixture.summary.results[1];
      const originalFirstPath = first.screenshot.path;
      const originalSecondPath = second.screenshot.path;

      first.screenshot.path = "Z:/definitely-missing/overview-1440x900.png";
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "escapes the evidence run directory",
      );
      first.screenshot.path = "artifacts/ui-redesign/test-run/../escape-1440x900.png";
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "contains parent traversal",
      );
      first.screenshot.path = `artifacts/ui-redesign/test-run/sub/../${basename(originalFirstPath)}`;
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "contains parent traversal",
      );
      first.screenshot.path = originalFirstPath;

      fixture.summary.runDirectory =
        "artifacts/ui-redesign/temporary/../test-run";
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "runDirectory contains parent traversal",
      );
      fixture.summary.runDirectory = "artifacts/ui-redesign/test-run";

      second.screenshot.path = originalFirstPath;
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "duplicate screenshot artifact path",
      );
      second.screenshot.path = originalSecondPath;

      const aliasResult = fixture.summary.results[4];
      const originalAliasPath = aliasResult.screenshot.path;
      const runDirectory = join(
        fixture.workspaceRoot,
        fixture.summary.runDirectory,
      );
      await symlink(runDirectory, join(runDirectory, "alias"), "junction");
      aliasResult.screenshot.path = `artifacts/ui-redesign/test-run/alias/${basename(originalFirstPath)}`;
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "duplicate canonical screenshot artifact path",
      );
      aliasResult.screenshot.path = originalAliasPath;

      first.screenshot.path = "artifacts/ui-redesign/test-run/missing-dimensions.png";
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "filename must include 1440x900",
      );
      first.screenshot.path = originalFirstPath;

      await writeFile(join(fixture.workspaceRoot, originalFirstPath), Buffer.from("not a png"));
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "is not a readable PNG with a valid IHDR",
      );

      await writeFile(join(fixture.workspaceRoot, originalFirstPath), createPngHeader(1, 1));
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "PNG dimensions 1x1 do not match viewport 1440x900",
      );

      first.screenshot.path = "artifacts/ui-redesign/test-run/nonexistent-1440x900.png";
      expect((await validateArtifacts(fixture.summary, fixture.workspaceRoot)).join("\n")).toContain(
        "could not be read",
      );
    } finally {
      await rm(fixture.workspaceRoot, { force: true, recursive: true });
    }
  }, 10_000);
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
  const viewportDefinition = smokePolicy.MAIN_CAPTURE_VIEWPORTS.find(
    (candidate) => candidate.name === viewport,
  ) ?? { height: 900, width: 1440 };

  return {
    accessibility: { error: null, violations: [] },
    accessResult: "accessible",
    consoleErrors: [],
    expectedAccess: "accessible",
    horizontalOverflow: { error: null, hasOverflow: false },
    navigationError: null,
    pageErrors: [],
    primaryActions: { error: null, reachable: true },
    queryVerified: true,
    route: "/overview",
    screenshot: {
      error: null,
      height: viewportDefinition.height,
      path: `desktop/overview-${viewportDefinition.width}x${viewportDefinition.height}.png`,
      width: viewportDefinition.width,
    },
    viewport,
    viewportHeight: viewportDefinition.height,
    viewportWidth: viewportDefinition.width,
  };
}

function passingKeyboardAudit() {
  const operationalSurfaceContract = {
    key: "overview-operating-work",
    selector: '[data-slot="overview-operating-scroll"]',
  };

  return {
    accessResult: "accessible",
    expectedAccess: "accessible",
    h1: { count: 1, error: null, texts: ["Overview"] },
    horizontalOverflow: { error: null, hasOverflow: false },
    keyboardTraversal: {
      eligibleTargets: [{ inWorkSurface: true, key: "a:nth-of-type(1)", operationalSurfaceKey: operationalSurfaceContract.key, operationalSurfaceSelector: operationalSurfaceContract.selector, region: "Primary" }],
      error: null,
      forwardUnreachableTargets: [],
      forwardTraversal: {
        attempted: true,
        reached: true,
        target: { key: "a:nth-of-type(1)", region: "Primary" },
      },
      offViewportFocus: [],
      operationalSurface: {
        eligibleTargetKeys: ["a:nth-of-type(1)"],
        exists: true,
        key: operationalSurfaceContract.key,
        selector: operationalSurfaceContract.selector,
      },
      reachedRegions: ["Primary"],
      reachedTargets: [{ inWorkSurface: true, key: "a:nth-of-type(1)", operationalSurfaceKey: operationalSurfaceContract.key, operationalSurfaceSelector: operationalSurfaceContract.selector, region: "Primary" }],
      requiredWorkSurfaceTargetKeys: ["a:nth-of-type(1)"],
      reverseReachedTargets: [{ inWorkSurface: true, key: "a:nth-of-type(1)", operationalSurfaceKey: operationalSurfaceContract.key, operationalSurfaceSelector: operationalSurfaceContract.selector, region: "Primary" }],
      reverseTraversal: {
        attempted: true,
        reached: true,
        target: { key: "a:nth-of-type(1)", region: "Primary" },
      },
      reverseUnreachableTargets: [],
      unreachableTargets: [],
    },
    label: "Overview",
    manifestRoute: "/overview",
    navigationError: null,
    operationalSurfaceContract,
    route: "/overview",
    screenshot: {
      error: null,
      height: 450,
      path: "artifacts/ui-redesign/run/zoom-equivalent-200/overview-720x450.png",
      width: 720,
    },
    screenshotError: null,
    screenshotPath: "artifacts/ui-redesign/run/zoom-equivalent-200/overview-720x450.png",
    viewport: "zoom-equivalent-200",
    viewportHeight: 450,
    viewportWidth: 720,
  };
}

function createValidSummary() {
  const results = routeManifest.flatMap((entry) =>
    smokePolicy.MAIN_CAPTURE_VIEWPORTS.map((viewport) => ({
      ...passingRouteResult(viewport.name),
      expectedAccess: entry.smoke.expectedAccess.admin,
      accessResult: entry.smoke.expectedAccess.admin,
      manifestRoute: entry.route,
      route: entry.smoke.path,
    })),
  );
  const roleAudits = routeManifest.flatMap((entry) =>
    ["manager", "member", "anonymous"].map((role) => ({
      accessResult: entry.smoke.expectedAccess[role],
      expectedAccess: entry.smoke.expectedAccess[role],
      manifestRoute: entry.route,
      role,
    })),
  );
  const maintenanceBoardResults = smokePolicy.MAIN_CAPTURE_VIEWPORTS.map(
    (viewport) => ({
      ...passingRouteResult(viewport.name),
      manifestRoute: "/maintenance",
      queryVerified: true,
      route: "/maintenance?view=board",
    }),
  );
  const keyboardZoomAudits = smokePolicy
    .resolveKeyboardZoomRoutes(routeManifest)
    .map((route) => {
      const audit = passingKeyboardAudit();
      const contract = {
        key: route.operationalSurfaceKey,
        selector: route.operationalSurfaceSelector,
      };
      audit.operationalSurfaceContract = contract;
      audit.keyboardTraversal.operationalSurface = {
        eligibleTargetKeys: ["a:nth-of-type(1)"],
        exists: true,
        ...contract,
      };
      for (const target of [
        ...audit.keyboardTraversal.eligibleTargets,
        ...audit.keyboardTraversal.reachedTargets,
        ...audit.keyboardTraversal.reverseReachedTargets,
      ]) {
        target.operationalSurfaceKey = contract.key;
        target.operationalSurfaceSelector = contract.selector;
      }

      return {
        ...audit,
        accessResult: route.expectedAccess,
        expectedAccess: route.expectedAccess,
        label: route.label,
        manifestRoute: route.manifestRoute,
        route: route.path,
      };
    });

  return {
    axeEnabled: true,
    blockedMutationRequests: [],
    keyboardZoomAudits,
    maintenanceBoardResults,
    completedAt: "2026-08-04T10:10:01.000Z",
    producer: {
      name: "smoke-ui-redesign",
      version: 1,
    },
    results,
    roleAudits,
    runDirectory: "artifacts/ui-redesign/test-run",
    runMode: "axe",
    schemaVersion: 1,
    startedAt: "2026-08-04T10:10:00.000Z",
    viewports: smokePolicy.MAIN_CAPTURE_VIEWPORTS.map((viewport) => ({
      ...viewport,
    })),
  };
}

function validateSummary(summary) {
  return (
    smokePolicy.validateEvidenceSummary?.(summary, routeManifest) ?? [
      "validator missing",
    ]
  );
}

async function createArtifactFixture() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "nestory-ui-evidence-"));
  const summary = createValidSummary();
  const results = [
    ...summary.results,
    ...summary.maintenanceBoardResults,
    ...summary.keyboardZoomAudits,
  ];

  for (const [index, result] of results.entries()) {
    const relativePath = `artifacts/ui-redesign/test-run/${index}-${result.viewportWidth}x${result.viewportHeight}.png`;
    const absolutePath = join(workspaceRoot, relativePath);
    result.screenshot.path = relativePath;
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      createPngHeader(result.viewportWidth, result.viewportHeight),
    );
  }

  return { summary, workspaceRoot };
}

function createPngHeader(width, height) {
  const png = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

async function validateArtifacts(summary, workspaceRoot) {
  if (typeof artifactPolicy.validateEvidenceArtifacts !== "function") {
    return ["artifact validator missing"];
  }

  return artifactPolicy.validateEvidenceArtifacts(summary, routeManifest, {
    workspaceRoot,
  });
}
