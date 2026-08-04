const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const MAIN_CAPTURE_VIEWPORTS = Object.freeze([
  { height: 900, name: "desktop", width: 1440 },
  { height: 800, name: "laptop", width: 1280 },
  { height: 768, name: "compact-desktop", width: 1024 },
  { height: 844, name: "phone", width: 390 },
]);

export const MAINTENANCE_CAPTURE_VIEWPORTS = MAIN_CAPTURE_VIEWPORTS;

export const KEYBOARD_ZOOM_VIEWPORT = Object.freeze({
  height: 450,
  name: "zoom-equivalent-200",
  width: 720,
});

export const UI_EVIDENCE_SCHEMA_VERSION = 1;

export const FINAL_ACCEPTANCE_ROUTES = Object.freeze([
  { label: "Overview", manifestRoute: "/overview" },
  { label: "Properties", manifestRoute: "/properties" },
  { label: "Units", manifestRoute: "/units" },
  { label: "People", manifestRoute: "/people" },
  { label: "Leases", manifestRoute: "/leases" },
  { label: "Maintenance list", path: "/maintenance", source: "maintenance" },
  {
    label: "Maintenance board",
    path: "/maintenance?view=board",
    source: "maintenance",
  },
  { label: "Records", manifestRoute: "/timeline" },
  { label: "Settings", manifestRoute: "/settings" },
  { label: "Workspace Access", manifestRoute: "/users-roles" },
  { label: "Account", manifestRoute: "/account" },
  { label: "Finance Operations", manifestRoute: "/finance" },
  { label: "Ledger", manifestRoute: "/ledger" },
  { label: "Reports", manifestRoute: "/reports" },
]);

const keyboardZoomRouteDefinitions = Object.freeze([
  { label: "Overview", manifestRoute: "/overview" },
  { label: "Leases", manifestRoute: "/leases" },
  { label: "Maintenance", manifestRoute: "/maintenance" },
  { label: "Property detail", manifestRoute: "/properties/[propertyId]" },
  { label: "Settings", manifestRoute: "/settings" },
]);

export function validateLocalBaseUrl(value) {
  let parsedBaseUrl;

  try {
    parsedBaseUrl = new URL(value);
  } catch {
    throw new Error("BASE_URL must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
    throw new Error("BASE_URL must use http or https");
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error("BASE_URL must not include userinfo");
  }

  const hostname = parsedBaseUrl.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("BASE_URL must use a loopback host");
  }

  return parsedBaseUrl.origin;
}

export function createReadOnlyRequestPolicy({ baseUrl }) {
  const baseOrigin = new URL(baseUrl).origin;
  let authenticationRequestAvailable = true;

  return {
    evaluate({ headers, method, url }) {
      const normalizedMethod = method.toUpperCase();

      if (safeMethods.has(normalizedMethod)) {
        return { allowed: true, reason: "read-only" };
      }

      let requestUrl;

      try {
        requestUrl = new URL(url);
      } catch {
        return { allowed: false, reason: "invalid request URL" };
      }

      const nextAction = readHeader(headers, "next-action")?.trim();
      const contentType = readHeader(headers, "content-type")?.toLowerCase();
      const origin = readHeader(headers, "origin");
      const referer = readHeader(headers, "referer");
      const isNativeLoginSubmission =
        contentType?.startsWith("multipart/form-data;") &&
        origin === baseOrigin &&
        isLoginReferer(referer, baseOrigin);
      const isLoginServerAction =
        authenticationRequestAvailable &&
        normalizedMethod === "POST" &&
        requestUrl.origin === baseOrigin &&
        requestUrl.pathname === "/login" &&
        (Boolean(nextAction) || isNativeLoginSubmission);

      if (isLoginServerAction) {
        authenticationRequestAvailable = false;
        return { allowed: true, reason: "authentication" };
      }

      return { allowed: false, reason: "non-read request" };
    },
  };
}

export function collectSmokeFailures(
  routeResults,
  accessAudits,
  blockedRequests,
  keyboardZoomAudits = null,
) {
  const failures = blockedRequests.map(
    (request) =>
      `blocked request: ${request.method} ${request.url} (${request.reason})`,
  );

  for (const result of routeResults) {
    failures.push(...getRouteResultFailures(result));
  }

  for (const audit of accessAudits) {
    if (audit.accessResult !== audit.expectedAccess) {
      failures.push(
        `${audit.role} ${audit.manifestRoute}: expected ${audit.expectedAccess}, received ${audit.accessResult}`,
      );
    }
  }

  if (keyboardZoomAudits !== null) {
    failures.push(...getKeyboardZoomSuiteFailures(keyboardZoomAudits));
    for (const audit of keyboardZoomAudits) {
      failures.push(...getKeyboardZoomAuditFailures(audit));
    }
  }

  return failures;
}

export function resolveKeyboardZoomRoutes(manifest) {
  return keyboardZoomRouteDefinitions.map((definition) => {
    const entry = manifest.find(
      (candidate) => candidate.route === definition.manifestRoute,
    );

    if (!entry?.smoke?.path || !entry.smoke.expectedAccess?.admin) {
      throw new Error(
        `Keyboard audit route is missing from the manifest: ${definition.manifestRoute}`,
      );
    }

    return {
      expectedAccess: entry.smoke.expectedAccess.admin,
      label: definition.label,
      manifestRoute: definition.manifestRoute,
      path: entry.smoke.path,
    };
  });
}

export function formatViewportSummary(viewports) {
  return joinList(
    viewports.map(
      (viewport) =>
        `${viewport.name} (${viewport.width}x${viewport.height})`,
    ),
  );
}

export function formatViewportPass(results, viewports) {
  const passingViewportNames = new Set(
    results
      .filter((result) => getRouteResultFailures(result).length === 0)
      .map((result) => result.viewport),
  );
  const passingCount = viewports.filter((viewport) =>
    passingViewportNames.has(viewport.name),
  ).length;

  return `${passingCount}/${viewports.length} ${
    passingCount === viewports.length ? "pass" : "FAIL"
  }`;
}

export function validateEvidenceSummary(summary, manifest) {
  if (summary?.schemaVersion !== UI_EVIDENCE_SCHEMA_VERSION) {
    return [
      `Unsupported UI evidence summary schema; rerun the current axe-enabled browser harness to produce schema version ${UI_EVIDENCE_SCHEMA_VERSION}.`,
    ];
  }

  const failures = [];
  const arrays = {};
  for (const field of [
    "blockedMutationRequests",
    "keyboardZoomAudits",
    "maintenanceBoardResults",
    "results",
    "roleAudits",
    "viewports",
  ]) {
    if (!Array.isArray(summary[field])) {
      failures.push(`${field} must be an array`);
      arrays[field] = [];
    } else {
      arrays[field] = summary[field];
    }
  }

  if (!Array.isArray(manifest) || manifest.length === 0) {
    failures.push("route manifest must be a non-empty array");
    return failures;
  }
  if (summary.axeEnabled !== true) {
    failures.push("axeEnabled must be true for tracked evidence");
  }
  if (summary.runMode !== "axe") {
    failures.push("runMode must be axe for tracked evidence");
  }
  if (arrays.blockedMutationRequests.length > 0) {
    failures.push("blocked mutation requests must be empty");
  }

  validateViewportMatrix(arrays.viewports, failures);
  validateMainResults(arrays.results, manifest, failures);
  validateRoleAudits(arrays.roleAudits, manifest, failures);
  validateMaintenanceBoardResults(
    arrays.maintenanceBoardResults,
    manifest,
    failures,
  );

  validateKeyboardAudits(arrays.keyboardZoomAudits, manifest, failures);

  return failures;
}

export function assertEvidenceSummary(summary, manifest) {
  const failures = validateEvidenceSummary(summary, manifest);

  if (failures.length > 0) {
    throw new Error(
      `Refusing to generate tracked UI evidence from an invalid summary:\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
  }
}

export function readPngDimensions(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Screenshot is not a PNG with an IHDR header");
  }

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

export function getScreenshotFailures(result) {
  const failures = [];
  const screenshot = result.screenshot;

  if (!screenshot || screenshot.error || !screenshot.path) {
    failures.push("screenshot evidence missing");
    return failures;
  }
  if (
    !Number.isInteger(screenshot.width) ||
    !Number.isInteger(screenshot.height)
  ) {
    failures.push("screenshot dimensions missing");
  } else if (
    screenshot.width !== result.viewportWidth ||
    screenshot.height !== result.viewportHeight
  ) {
    failures.push(
      `screenshot dimensions ${screenshot.width}x${screenshot.height} do not match viewport ${result.viewportWidth}x${result.viewportHeight}`,
    );
  }

  return failures;
}

export function buildArtifactRunName({ date, mode, pid, prefix }) {
  const timestamp = date.toISOString().replaceAll(":", "-");
  return `${prefix}-${timestamp}-${mode}-p${pid}`;
}

export function getKeyboardZoomSuiteFailures(audits) {
  if (!Array.isArray(audits)) {
    return [`${KEYBOARD_ZOOM_VIEWPORT.name}: keyboard audits must be an array`];
  }

  const failures = [];
  const expectedRoutes = new Map(
    keyboardZoomRouteDefinitions.map((route) => [route.manifestRoute, route]),
  );
  const counts = countBy(audits, (audit) => audit?.manifestRoute);

  for (const audit of audits) {
    if (!expectedRoutes.has(audit?.manifestRoute)) {
      failures.push(
        `${KEYBOARD_ZOOM_VIEWPORT.name}: unknown keyboard audit ${audit?.manifestRoute ?? "missing"}`,
      );
    }
  }
  for (const route of keyboardZoomRouteDefinitions) {
    const count = counts.get(route.manifestRoute) ?? 0;
    if (count === 0) {
      failures.push(
        `${KEYBOARD_ZOOM_VIEWPORT.name}: missing keyboard audit for ${route.label} (${route.manifestRoute})`,
      );
    } else if (count > 1) {
      failures.push(
        `${KEYBOARD_ZOOM_VIEWPORT.name}: duplicate keyboard audit for ${route.label} (${route.manifestRoute})`,
      );
    }
  }

  return failures;
}

export function getKeyboardZoomAuditFailures(result) {
  const failures = [];
  const prefix = `${result.viewport} ${result.route}`;

  if (result.navigationError) {
    failures.push(`${prefix}: navigation-error`);
  }
  if (result.accessResult !== result.expectedAccess) {
    failures.push(
      `${prefix}: expected ${result.expectedAccess}, received ${result.accessResult}`,
    );
  }
  if (result.h1?.error || result.h1?.count !== 1) {
    failures.push(
      `${prefix}: expected exactly one H1, received ${result.h1?.count ?? "missing"}`,
    );
  }
  if (
    result.horizontalOverflow?.error ||
    result.horizontalOverflow?.hasOverflow !== false
  ) {
    failures.push(`${prefix}: horizontal overflow check failed`);
  }

  const traversal = result.keyboardTraversal;
  if (traversal?.error) {
    failures.push(`${prefix}: keyboard traversal failed`);
  }
  if (!traversal?.eligibleTargets?.length) {
    failures.push(`${prefix}: no eligible keyboard focus targets`);
  }
  if (!traversal?.reachedTargets?.length) {
    failures.push(`${prefix}: no keyboard focus targets reached`);
  }
  if (!traversal?.reachedRegions?.length) {
    failures.push(`${prefix}: no keyboard focus regions reached`);
  }
  if (
    !traversal?.requiredWorkSurfaceTargetKeys?.length ||
    !traversal?.eligibleTargets?.some((target) => target.inWorkSurface)
  ) {
    failures.push(`${prefix}: no eligible main work-surface target`);
  }
  if (!traversal?.reachedTargets?.some((target) => target.inWorkSurface)) {
    failures.push(`${prefix}: no reached main work-surface target`);
  }
  const forwardUnreachable =
    traversal?.forwardUnreachableTargets ?? traversal?.unreachableTargets;
  if (forwardUnreachable?.length > 0) {
    failures.push(
      `${prefix}: ${forwardUnreachable.length} keyboard target(s) unreachable`,
    );
  }
  if (
    traversal?.forwardTraversal?.attempted !== true ||
    traversal.forwardTraversal.reached !== true
  ) {
    failures.push(`${prefix}: forward keyboard traversal failed`);
  }
  if (traversal?.reverseUnreachableTargets?.length > 0) {
    failures.push(
      `${prefix}: ${traversal.reverseUnreachableTargets.length} reverse keyboard target(s) unreachable`,
    );
  }
  if (
    !traversal?.reverseReachedTargets?.some(
      (target) => target.inWorkSurface,
    )
  ) {
    failures.push(`${prefix}: no reverse-reached main work-surface target`);
  }
  if (traversal?.offViewportFocus?.length > 0) {
    failures.push(
      `${prefix}: ${traversal.offViewportFocus.length} off-viewport focus target(s)`,
    );
  }
  if (
    traversal?.reverseTraversal?.attempted !== true ||
    traversal.reverseTraversal.reached !== true
  ) {
    failures.push(`${prefix}: reverse keyboard traversal failed`);
  }
  for (const failure of getScreenshotFailures(result)) {
    failures.push(`${prefix}: ${failure}`);
  }

  return failures;
}

export function renderKeyboardZoomEvidence(audits = []) {
  const routeFailures = audits.flatMap(getKeyboardZoomAuditFailures);
  const suiteFailures = getKeyboardZoomSuiteFailures(audits);
  const passingCount = audits.filter(
    (audit) => getKeyboardZoomAuditFailures(audit).length === 0,
  ).length;
  const status =
    routeFailures.length === 0 && suiteFailures.length === 0 ? "pass" : "open";

  return `- ${passingCount}/${keyboardZoomRouteDefinitions.length} ${status}: keyboard traversal at a 720x450 CSS viewport equivalent to 1440x900 at 200%. This is an equivalent layout audit, not actual browser zoom. Actual 200% browser zoom remains manual and unverified.`;
}

export function getRouteResultFailures(result) {
  const failures = [];
  const prefix = `${result.viewport} ${result.route}`;

  if (result.navigationError) {
    failures.push(`${prefix}: navigation-error`);
  } else if (["navigation-error", "http-error"].includes(result.accessResult)) {
    failures.push(`${prefix}: ${result.accessResult}`);
  }
  if (result.accessResult !== result.expectedAccess) {
    failures.push(
      `${prefix}: expected ${result.expectedAccess}, received ${result.accessResult}`,
    );
  }
  if (result.consoleErrors.length > 0) {
    failures.push(`${prefix}: ${result.consoleErrors.length} console error(s)`);
  }
  if (result.pageErrors.length > 0) {
    failures.push(`${prefix}: ${result.pageErrors.length} page error(s)`);
  }
  if (result.horizontalOverflow.error || result.horizontalOverflow.hasOverflow) {
    failures.push(`${prefix}: horizontal overflow check failed`);
  }
  if (result.primaryActions.error || result.primaryActions.reachable !== true) {
    failures.push(`${prefix}: no reachable primary action`);
  }
  if (result.accessibility?.error) {
    failures.push(`${prefix}: axe scan failed`);
  }
  if (result.accessibility?.violations.length > 0) {
    failures.push(
      `${prefix}: ${result.accessibility.violations.length} serious/critical axe violation(s)`,
    );
  }
  if (result.queryVerified !== true) {
    failures.push(`${prefix}: query or redirect contract failed`);
  }
  for (const failure of getScreenshotFailures(result)) {
    failures.push(`${prefix}: ${failure}`);
  }

  return failures;
}

function isLoginReferer(value, baseOrigin) {
  if (!value) {
    return false;
  }

  try {
    const referer = new URL(value);
    return referer.origin === baseOrigin && referer.pathname === "/login";
  } catch {
    return false;
  }
}

function readHeader(headers, name) {
  if (typeof headers?.get === "function") {
    return headers.get(name);
  }

  const match = Object.entries(headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name,
  );

  return match?.[1];
}

function joinList(values) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function validateViewportMatrix(viewports, failures) {
  const expected = new Map(
    MAIN_CAPTURE_VIEWPORTS.map((viewport) => [viewport.name, viewport]),
  );
  const counts = countBy(viewports, (viewport) => viewport?.name);

  for (const viewport of viewports) {
    const configured = expected.get(viewport?.name);
    if (
      !configured ||
      configured.width !== viewport.width ||
      configured.height !== viewport.height
    ) {
      failures.push(`unknown or malformed viewport ${viewport?.name ?? "missing"}`);
    }
  }
  for (const viewport of MAIN_CAPTURE_VIEWPORTS) {
    const count = counts.get(viewport.name) ?? 0;
    if (count === 0) {
      failures.push(`missing viewport ${viewport.name}`);
    } else if (count > 1) {
      failures.push(`duplicate viewport ${viewport.name}`);
    }
  }
}

function validateMainResults(results, manifest, failures) {
  const expected = new Map();
  for (const entry of manifest) {
    for (const viewport of MAIN_CAPTURE_VIEWPORTS) {
      expected.set(`${entry.route}|${viewport.name}`, { entry, viewport });
    }
  }
  const counts = countBy(
    results,
    (result) => `${result?.manifestRoute}|${result?.viewport}`,
  );

  for (const result of results) {
    const key = `${result?.manifestRoute}|${result?.viewport}`;
    const contract = expected.get(key);
    if (!contract) {
      failures.push(`unknown main result ${key}`);
      continue;
    }
    if (result.route !== contract.entry.smoke.path) {
      failures.push(`main result ${key} used the wrong smoke path`);
    }
    if (
      result.expectedAccess !== contract.entry.smoke.expectedAccess.admin ||
      result.viewportWidth !== contract.viewport.width ||
      result.viewportHeight !== contract.viewport.height
    ) {
      failures.push(`main result ${key} does not match its manifest contract`);
    }
    validateAxeResult(result, `main result ${key}`, failures);
    validateCleanRouteResult(result, `main result ${key}`, failures);
  }

  for (const key of expected.keys()) {
    const count = counts.get(key) ?? 0;
    if (count === 0) {
      failures.push(`missing main result ${key}`);
    } else if (count > 1) {
      failures.push(`duplicate main result ${key}`);
    }
  }
}

function validateRoleAudits(audits, manifest, failures) {
  const roles = ["manager", "member", "anonymous"];
  const expected = new Map();
  for (const entry of manifest) {
    for (const role of roles) {
      expected.set(`${entry.route}|${role}`, {
        access: entry.smoke.expectedAccess[role],
        entry,
        role,
      });
    }
  }
  const counts = countBy(
    audits,
    (audit) => `${audit?.manifestRoute}|${audit?.role}`,
  );

  for (const audit of audits) {
    const key = `${audit?.manifestRoute}|${audit?.role}`;
    const contract = expected.get(key);
    if (!contract) {
      failures.push(`unknown role audit ${key}`);
      continue;
    }
    if (
      audit.expectedAccess !== contract.access ||
      audit.accessResult !== contract.access
    ) {
      failures.push(`role audit ${key} does not match expected access`);
    }
  }
  for (const [key, contract] of expected) {
    const count = counts.get(key) ?? 0;
    if (count === 0) {
      failures.push(
        `missing ${contract.role} role audit for ${contract.entry.route}`,
      );
    } else if (count > 1) {
      failures.push(
        `duplicate ${contract.role} role audit for ${contract.entry.route}`,
      );
    }
  }
}

function validateMaintenanceBoardResults(results, manifest, failures) {
  const entry = manifest.find((candidate) => candidate.route === "/maintenance");
  if (!entry) {
    failures.push("Maintenance manifest route missing");
    return;
  }
  const counts = countBy(results, (result) => result?.viewport);
  const expectedViewports = new Map(
    MAIN_CAPTURE_VIEWPORTS.map((viewport) => [viewport.name, viewport]),
  );

  for (const result of results) {
    const viewport = expectedViewports.get(result?.viewport);
    if (!viewport) {
      failures.push(`unknown Maintenance board result ${result?.viewport}`);
      continue;
    }
    if (
      result.manifestRoute !== "/maintenance" ||
      result.route !== "/maintenance?view=board" ||
      result.expectedAccess !== entry.smoke.expectedAccess.admin ||
      result.viewportWidth !== viewport.width ||
      result.viewportHeight !== viewport.height
    ) {
      failures.push(
        `Maintenance board result ${result.viewport} does not match its contract`,
      );
    }
    validateAxeResult(
      result,
      `Maintenance board result ${result.viewport}`,
      failures,
    );
    validateCleanRouteResult(
      result,
      `Maintenance board result ${result.viewport}`,
      failures,
    );
  }
  for (const viewport of MAIN_CAPTURE_VIEWPORTS) {
    const count = counts.get(viewport.name) ?? 0;
    if (count === 0) {
      failures.push(`missing Maintenance board result ${viewport.name}`);
    } else if (count > 1) {
      failures.push(`duplicate Maintenance board result ${viewport.name}`);
    }
  }
}

function validateKeyboardAudits(audits, manifest, failures) {
  failures.push(...getKeyboardZoomSuiteFailures(audits));

  const expected = new Map(
    resolveKeyboardZoomRoutes(manifest).map((route) => [
      route.manifestRoute,
      route,
    ]),
  );
  for (const audit of audits) {
    const contract = expected.get(audit?.manifestRoute);
    if (contract) {
      if (
        audit.label !== contract.label ||
        audit.route !== contract.path ||
        audit.expectedAccess !== contract.expectedAccess ||
        audit.viewport !== KEYBOARD_ZOOM_VIEWPORT.name ||
        audit.viewportWidth !== KEYBOARD_ZOOM_VIEWPORT.width ||
        audit.viewportHeight !== KEYBOARD_ZOOM_VIEWPORT.height
      ) {
        failures.push(
          `keyboard audit ${contract.label} does not match its manifest contract`,
        );
      }
    }
    for (const failure of getKeyboardZoomAuditFailures(audit)) {
      failures.push(`keyboard audit failed: ${failure}`);
    }
  }
}

function validateAxeResult(result, label, failures) {
  if (
    !result.accessibility ||
    result.accessibility.error !== null ||
    !Array.isArray(result.accessibility.violations)
  ) {
    failures.push(`${label}: successful axe result missing`);
  }
}

function validateCleanRouteResult(result, label, failures) {
  try {
    const resultFailures = getRouteResultFailures(result);
    if (resultFailures.length > 0) {
      failures.push(`${label}: main result failed: ${resultFailures.join("; ")}`);
    }
  } catch (error) {
    failures.push(
      `${label}: malformed result: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function countBy(values, keyForValue) {
  const counts = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
