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
  { label: "Finance Operations", manifestRoute: "/rent-income" },
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

export function getKeyboardZoomSuiteFailures(audits) {
  const auditedRoutes = new Set(
    audits.map((audit) => audit.manifestRoute),
  );

  return keyboardZoomRouteDefinitions
    .filter((route) => !auditedRoutes.has(route.manifestRoute))
    .map(
      (route) =>
        `${KEYBOARD_ZOOM_VIEWPORT.name}: missing keyboard audit for ${route.label} (${route.manifestRoute})`,
    );
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
  if (traversal?.unreachableTargets?.length > 0) {
    failures.push(
      `${prefix}: ${traversal.unreachableTargets.length} keyboard target(s) unreachable`,
    );
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
  if (result.screenshotError || !result.screenshotPath) {
    failures.push(`${prefix}: screenshot evidence missing`);
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
