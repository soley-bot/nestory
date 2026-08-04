import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { assertEvidenceArtifacts } from "./smoke-ui-redesign-artifacts.mjs";
import {
  buildArtifactRunName,
  collectSmokeFailures,
  createReadOnlyRequestPolicy,
  formatViewportPass,
  formatViewportSummary,
  KEYBOARD_ZOOM_VIEWPORT,
  MAIN_CAPTURE_VIEWPORTS,
  readPngDimensions,
  renderKeyboardZoomEvidence,
  resolveKeyboardZoomRoutes,
  UI_EVIDENCE_SCHEMA_VERSION,
  validateLocalBaseUrl,
} from "./smoke-ui-redesign-policy.mjs";

const baseUrlValue = process.env.BASE_URL?.trim();

if (!baseUrlValue) {
  throw new Error("BASE_URL is required");
}

const baseUrl = validateLocalBaseUrl(baseUrlValue);
const axeEnabled = process.argv.includes("--axe");
const writeEvidence = process.argv.includes("--write-evidence");
const routeFilter = process.argv
  .find((argument) => argument.startsWith("--route="))
  ?.slice("--route=".length);
const evidenceSummaryPath = process.argv
  .find((argument) => argument.startsWith("--evidence-summary="))
  ?.slice("--evidence-summary=".length);
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD;
const rolePassword = process.env.E2E_ROLE_PASSWORD ?? password;

if (!email || !password) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required");
}

const manifest = JSON.parse(
  await readFile(resolve("config", "ui-route-coverage.json"), "utf8"),
);
const routes = manifest
  .filter((entry) => !routeFilter || entry.route === routeFilter)
  .map((entry) => ({
    expectedAccess: entry.smoke.expectedAccess.admin,
    expectedFinalPath: entry.smoke.expectedFinalPath ?? null,
    manifestRoute: entry.route,
    path: entry.smoke.path,
    queryContract: entry.smoke.queryContract,
  }));
const keyboardZoomRoutes = resolveKeyboardZoomRoutes(manifest);

if (routes.length === 0) {
  throw new Error(`No manifest route matched --route=${routeFilter}`);
}

if (writeEvidence && routeFilter) {
  throw new Error("--write-evidence requires the complete route manifest");
}

if (evidenceSummaryPath) {
  const storedSummary = JSON.parse(
    await readFile(resolve(evidenceSummaryPath), "utf8"),
  );
  await writeEvidenceDocument(storedSummary);
  console.log(`UI redesign evidence generated from ${evidenceSummaryPath}.`);
  process.exit(0);
}

const viewports = MAIN_CAPTURE_VIEWPORTS;

const startedAt = new Date();
const runMode = axeEnabled ? "axe" : "baseline";
const runName = buildArtifactRunName({
  date: startedAt,
  mode: runMode,
  pid: process.pid,
  prefix: "ui-redesign",
});
const artifactRoot = resolve("artifacts", "ui-redesign");
const runDirectory = resolve(artifactRoot, runName);
const summaryPath = resolve(runDirectory, "summary.json");
const blockedMutationRequests = [];
const results = [];
const roleAudits = [];
const knownAxeExceptions = [];
const keyboardZoomAudits = [];
const maintenanceBoardResults = [];

await mkdir(artifactRoot, { recursive: true });
await mkdir(runDirectory);

const browser = await chromium.launch({ headless: true });
const context = await createReadOnlyContext(browser, "admin");

try {
  await authenticate(context, { email, password });

  for (const viewport of viewports) {
    const viewportDirectory = resolve(runDirectory, viewport.name);
    await mkdir(viewportDirectory, { recursive: true });

    const page = await context.newPage();
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    let activeErrors = null;

    page.on("console", (message) => {
      if (message.type() === "error") {
        const messageText = message.text();

        if (isExpectedDevServerConsoleError(messageText)) {
          activeErrors?.ignoredConsoleErrors.push(messageText);
        } else {
          activeErrors?.consoleErrors.push(messageText);
        }
      }
    });
    page.on("pageerror", (error) => {
      activeErrors?.pageErrors.push(error.message);
    });

    for (const route of routes) {
      activeErrors = { consoleErrors: [], ignoredConsoleErrors: [], pageErrors: [] };
      results.push(
        await captureRoute({
          axeEnabled,
          errors: activeErrors,
          expectedAccess: route.expectedAccess,
          expectedFinalPath: route.expectedFinalPath,
          manifestRoute: route.manifestRoute,
          page,
          queryContract: route.queryContract,
          route: route.path,
          viewport,
          viewportDirectory,
        }),
      );
      activeErrors = null;
    }

    if (!routeFilter) {
      const maintenanceEntry = manifest.find(
        (entry) => entry.route === "/maintenance",
      );
      activeErrors = {
        consoleErrors: [],
        ignoredConsoleErrors: [],
        pageErrors: [],
      };
      maintenanceBoardResults.push(
        await captureRoute({
          axeEnabled,
          errors: activeErrors,
          expectedAccess: maintenanceEntry.smoke.expectedAccess.admin,
          expectedFinalPath: null,
          manifestRoute: maintenanceEntry.route,
          page,
          queryContract: "preserved",
          route: "/maintenance?view=board",
          viewport,
          viewportDirectory,
        }),
      );
      activeErrors = null;
    }

    await page.close();
  }

  if (!routeFilter) {
    keyboardZoomAudits.push(
      ...(await auditKeyboardZoomRoutes({
        browserContext: context,
        routes: keyboardZoomRoutes,
      })),
    );
  }

  for (const fixture of [
    { email: "manager@nestory.com", role: "manager" },
    { email: "member@nestory.com", role: "member" },
  ]) {
    roleAudits.push(
      ...(await auditRole({
        browser,
        credentials: { email: fixture.email, password: rolePassword },
        role: fixture.role,
      })),
    );
  }

  roleAudits.push(
    ...(await auditRole({ browser, credentials: null, role: "anonymous" })),
  );

  const summary = {
    axeEnabled,
    baseUrl,
    blockedMutationRequests,
    completedAt: new Date().toISOString(),
    keyboardZoomAudits,
    maintenanceBoardResults,
    producer: {
      name: "smoke-ui-redesign",
      version: UI_EVIDENCE_SCHEMA_VERSION,
    },
    results,
    roleAudits,
    runMode,
    runDirectory: toArtifactPath(runDirectory),
    schemaVersion: UI_EVIDENCE_SCHEMA_VERSION,
    startedAt: startedAt.toISOString(),
    viewports,
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const failures = collectSmokeFailures(
    [...results, ...maintenanceBoardResults],
    roleAudits,
    blockedMutationRequests,
    routeFilter ? null : keyboardZoomAudits,
  );

  if (writeEvidence && failures.length === 0) {
    await writeEvidenceDocument(summary);
  }

  if (failures.length > 0) {
    throw new Error(
      `UI verification found ${failures.length} failure(s); inspect ${toArtifactPath(summaryPath)}\n${failures.slice(0, 12).join("\n")}`,
    );
  }

  console.log(
    `UI redesign baseline captured ${results.length} route/viewport pairs and ${roleAudits.length} role checks in ${toArtifactPath(runDirectory)}.`,
  );
} finally {
  await context.close();
  await browser.close();
}

async function createReadOnlyContext(browserInstance, role) {
  const browserContext = await browserInstance.newContext({
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const requestPolicy = createReadOnlyRequestPolicy({ baseUrl });

  await browserContext.route("**/*", async (route) => {
    const request = route.request();
    const decision = requestPolicy.evaluate({
      headers: request.headers(),
      method: request.method(),
      url: request.url(),
    });

    if (decision.allowed) {
      await route.continue();
      return;
    }

    blockedMutationRequests.push({
      method: request.method().toUpperCase(),
      reason: decision.reason,
      role,
      url: request.url(),
    });
    await route.abort("blockedbyclient");
  });

  return browserContext;
}

async function auditRole({ browser: browserInstance, credentials, role }) {
  const browserContext = await createReadOnlyContext(browserInstance, role);
  const auditResults = [];

  try {
    if (credentials) {
      await authenticate(browserContext, credentials);
    }

    const page = await browserContext.newPage();
    await page.setViewportSize({ height: 900, width: 1440 });

    try {
      for (const route of routes) {
        let navigationError = null;
        let responseStatus = null;
        const requestedUrl = new URL(route.path, `${baseUrl}/`).toString();
        const manifestEntry = manifest.find(
          (entry) => entry.route === route.manifestRoute,
        );
        const expectedAccess = manifestEntry.smoke.expectedAccess[role];

        try {
          const response = await page.goto(requestedUrl, {
            timeout: 30_000,
            waitUntil: "domcontentloaded",
          });
          responseStatus = response?.status() ?? null;
          await followExpectedRedirect({
            expectedAccess,
            page,
            requestedUrl,
          });
          await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
        } catch (error) {
          navigationError = error instanceof Error ? error.message : String(error);
        }

        const accessResult = getAccessResult({
          finalUrl: page.url(),
          navigationError,
          requestedRoute: route.path,
          responseStatus,
        });

        auditResults.push({
          accessResult,
          expectedAccess,
          finalPath: toPathAndSearch(page.url()),
          manifestRoute: route.manifestRoute,
          navigationError,
          role,
          route: route.path,
        });
      }
    } finally {
      await page.close();
    }
  } finally {
    await browserContext.close();
  }

  return auditResults;
}

async function authenticate(browserContext, credentials) {
  const page = await browserContext.newPage();

  try {
    await page.goto(`${baseUrl}/login`, {
      timeout: 30_000,
      waitUntil: "networkidle",
    });
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);

    await Promise.all([
      page.waitForURL(
        (url) => url.pathname !== "/login",
        { timeout: 20_000 },
      ),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);
    await page.waitForLoadState("networkidle");

    const finalPath = new URL(page.url()).pathname;

    if (["/login", "/setup", "/no-access"].includes(finalPath)) {
      throw new Error(`E2E account cannot access a workspace: ${page.url()}`);
    }
  } finally {
    await page.close();
  }
}

async function captureRoute({
  axeEnabled,
  errors,
  expectedAccess,
  expectedFinalPath,
  manifestRoute,
  page,
  queryContract,
  route,
  viewport,
  viewportDirectory,
}) {
  const requestedUrl = new URL(route, `${baseUrl}/`).toString();
  const screenshotPath = resolve(
    viewportDirectory,
    `${routeSlug(route)}-${viewport.width}x${viewport.height}.png`,
  );
  let navigationError = null;
  let responseStatus = null;

  try {
    const response = await page.goto(requestedUrl, {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    });
    responseStatus = response?.status() ?? null;
    await followExpectedRedirect({
      expectedAccess,
      expectedFinalPath,
      page,
      requestedUrl,
    });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const finalUrl = page.url();
  const finalPath = toPathAndSearch(finalUrl);
  const horizontalOverflow = await measureHorizontalOverflow(page).catch(
    (error) => ({
      error: error instanceof Error ? error.message : String(error),
      hasOverflow: null,
    }),
  );
  const primaryActions = await measurePrimaryActions(page).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
    reachable: null,
  }));
  const accessibility = axeEnabled
    ? await runAxe(page, route).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
        violations: [],
      }))
    : null;

  const screenshot = await saveViewportScreenshot({
    page,
    screenshotPath,
  });

  return {
    accessResult: getAccessResult({
      finalUrl,
      navigationError,
      requestedRoute: route,
      responseStatus,
    }),
    expectedAccess,
    accessibility,
    consoleErrors: errors.consoleErrors,
    finalPath,
    finalUrl,
    horizontalOverflow,
    ignoredConsoleErrors: errors.ignoredConsoleErrors,
    manifestRoute,
    navigationError,
    pageErrors: errors.pageErrors,
    pageTitle: await page.title().catch(() => ""),
    primaryActions,
    queryContract,
    queryVerified: verifyQueryContract({
      expectedFinalPath,
      finalUrl,
      queryContract,
      requestedUrl,
    }),
    responseStatus,
    route,
    screenshot,
    viewport: viewport.name,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
  };
}

async function saveViewportScreenshot({ page, screenshotPath }) {
  try {
    const png = await page.screenshot({
      animations: "disabled",
      fullPage: false,
    });
    const dimensions = readPngDimensions(png);
    await writeFile(screenshotPath, png);

    return {
      error: null,
      height: dimensions.height,
      path: toArtifactPath(screenshotPath),
      width: dimensions.width,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      height: null,
      path: null,
      width: null,
    };
  }
}

async function auditKeyboardZoomRoutes({ browserContext, routes: auditRoutes }) {
  const auditDirectory = resolve(
    runDirectory,
    KEYBOARD_ZOOM_VIEWPORT.name,
  );
  const auditResults = [];

  await mkdir(auditDirectory, { recursive: true });

  const page = await browserContext.newPage();
  await page.setViewportSize({
    height: KEYBOARD_ZOOM_VIEWPORT.height,
    width: KEYBOARD_ZOOM_VIEWPORT.width,
  });

  try {
    for (const route of auditRoutes) {
      const requestedUrl = new URL(route.path, `${baseUrl}/`).toString();
      const screenshotPath = resolve(
        auditDirectory,
        `${routeSlug(route.path)}-${KEYBOARD_ZOOM_VIEWPORT.width}x${KEYBOARD_ZOOM_VIEWPORT.height}.png`,
      );
      let navigationError = null;
      let responseStatus = null;

      try {
        const response = await page.goto(requestedUrl, {
          timeout: 30_000,
          waitUntil: "domcontentloaded",
        });
        responseStatus = response?.status() ?? null;
        await page
          .waitForLoadState("networkidle", { timeout: 5_000 })
          .catch(() => {});
      } catch (error) {
        navigationError = error instanceof Error ? error.message : String(error);
      }

      const h1 = await measureH1(page).catch((error) => ({
        count: null,
        error: error instanceof Error ? error.message : String(error),
        texts: [],
      }));
      const horizontalOverflow = await measureHorizontalOverflow(page).catch(
        (error) => ({
          error: error instanceof Error ? error.message : String(error),
          hasOverflow: null,
        }),
      );
      const operationalSurfaceContract = {
        key: route.operationalSurfaceKey,
        selector: route.operationalSurfaceSelector,
      };
      const keyboardTraversal = await traverseKeyboardTargets(
        page,
        operationalSurfaceContract,
      ).catch((error) => ({
          eligibleTargets: [],
          error: error instanceof Error ? error.message : String(error),
          forwardUnreachableTargets: [],
          forwardTraversal: { attempted: false, reached: false, target: null },
          offViewportFocus: [],
          operationalSurface: {
            eligibleTargetKeys: [],
            exists: false,
            ...operationalSurfaceContract,
          },
          reachedRegions: [],
          reachedTargets: [],
          requiredWorkSurfaceTargetKeys: [],
          reverseReachedTargets: [],
          reverseTraversal: { attempted: false, reached: false, target: null },
          reverseUnreachableTargets: [],
          unreachableTargets: [],
        }));
      const screenshot = await saveViewportScreenshot({
        page,
        screenshotPath,
      });

      const finalUrl = page.url();
      auditResults.push({
        accessResult: getAccessResult({
          finalUrl,
          navigationError,
          requestedRoute: route.path,
          responseStatus,
        }),
        expectedAccess: route.expectedAccess,
        finalPath: toPathAndSearch(finalUrl),
        h1,
        horizontalOverflow,
        keyboardTraversal,
        label: route.label,
        manifestRoute: route.manifestRoute,
        navigationError,
        operationalSurfaceContract,
        responseStatus,
        route: route.path,
        screenshot,
        viewport: KEYBOARD_ZOOM_VIEWPORT.name,
        viewportHeight: KEYBOARD_ZOOM_VIEWPORT.height,
        viewportWidth: KEYBOARD_ZOOM_VIEWPORT.width,
      });
    }
  } finally {
    await page.close();
  }

  return auditResults;
}

async function measureH1(page) {
  const texts = await page
    .getByRole("heading", { level: 1 })
    .evaluateAll((headings) =>
      headings.map((heading) => heading.textContent?.trim() ?? ""),
    );

  return { count: texts.length, error: null, texts };
}

async function traverseKeyboardTargets(page, operationalSurfaceContract) {
  const inventory = await inspectKeyboardTargets(
    page,
    true,
    operationalSurfaceContract,
  );
  const eligibleTargets = inventory.targets;
  const offViewportFocus = new Map();
  const eligibleKeys = new Set(eligibleTargets.map((target) => target.key));
  const requiredWorkSurfaceTargetKeys = eligibleTargets
    .filter((target) => target.inWorkSurface)
    .map((target) => target.key);
  const forward = await traverseKeyboardDirection({
    eligibleKeys,
    key: "Tab",
    offViewportFocus,
    operationalSurfaceContract,
    page,
  });
  const reverse = await traverseKeyboardDirection({
    eligibleKeys,
    key: "Shift+Tab",
    offViewportFocus,
    operationalSurfaceContract,
    page,
  });
  const forwardUnreachableTargets = eligibleTargets.filter(
    (target) => !forward.reachedTargets.has(target.key),
  );
  const reverseUnreachableTargets = eligibleTargets.filter(
    (target) => !reverse.reachedTargets.has(target.key),
  );
  const reached = [...forward.reachedTargets.values()];

  return {
    eligibleTargets,
    error: null,
    forwardUnreachableTargets,
    forwardTraversal: {
      attempted: true,
      reached: forwardUnreachableTargets.length === 0 && forward.wrapped === true,
      target: forward.lastTarget,
    },
    offViewportFocus: [...offViewportFocus.values()],
    operationalSurface: inventory.operationalSurface,
    reachedRegions: [
      ...new Set(reached.map((target) => target.region).filter(Boolean)),
    ],
    reachedTargets: reached,
    requiredWorkSurfaceTargetKeys,
    reverseReachedTargets: [...reverse.reachedTargets.values()],
    reverseTraversal: {
      attempted: true,
      reached:
        reverseUnreachableTargets.length === 0 && reverse.wrapped === true,
      target: reverse.lastTarget,
    },
    reverseUnreachableTargets,
    unreachableTargets: forwardUnreachableTargets,
  };
}

async function traverseKeyboardDirection({
  eligibleKeys,
  key,
  offViewportFocus,
  operationalSurfaceContract,
  page,
}) {
  await resetKeyboardFocus(page);

  const reachedTargets = new Map();
  const maximumPresses = Math.min(Math.max(eligibleKeys.size * 2 + 4, 6), 400);
  let firstTargetKey = null;
  let lastTarget = null;
  let wrapped = false;

  for (let index = 0; index < maximumPresses; index += 1) {
    await page.keyboard.press(key);
    const target = await inspectKeyboardTargets(
      page,
      false,
      operationalSurfaceContract,
    );

    if (!target?.key || !eligibleKeys.has(target.key)) {
      continue;
    }
    if (firstTargetKey === null) {
      firstTargetKey = target.key;
    } else if (
      target.key === firstTargetKey &&
      reachedTargets.size === eligibleKeys.size
    ) {
      wrapped = true;
      lastTarget = target;
      break;
    }

    recordFocusedTarget({ offViewportFocus, reachedTargets, target });
    lastTarget = target;
  }

  return { lastTarget, reachedTargets, wrapped };
}

async function resetKeyboardFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ left: 0, top: 0 });
  });
}

function recordFocusedTarget({ offViewportFocus, reachedTargets, target }) {
  if (!target?.key) {
    return;
  }

  reachedTargets.set(target.key, target);
  if (target.offViewport) {
    offViewportFocus.set(target.key, target);
  }
}

async function inspectKeyboardTargets(
  page,
  includeInventory,
  operationalSurfaceContract,
) {
  return page.evaluate(({ contract, shouldReturnInventory }) => {
    const selector = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[tabindex]",
    ].join(",");

    function elementKey(element) {
      if (element.id) {
        return `#${element.id}`;
      }

      const parts = [];
      let current = element;

      while (current && current !== document.body) {
        const siblings = current.parentElement
          ? [...current.parentElement.children].filter(
              (sibling) => sibling.tagName === current.tagName,
            )
          : [];
        parts.unshift(
          `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
        );
        current = current.parentElement;
      }

      return parts.join(">");
    }

    function regionName(element) {
      const region = element.closest(
        "nav, header, main, aside, footer, [role='region'], [role='dialog'], [role='navigation'], [role='toolbar'], [role='search']",
      );

      if (!region) {
        return "document";
      }

      return (
        region.getAttribute("aria-label") ||
        region.getAttribute("role") ||
        region.tagName.toLowerCase()
      );
    }

    const operationalSurface = document.querySelector(contract.selector);

    function targetSnapshot(element) {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const bounds = element.getBoundingClientRect();
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim())
            .filter(Boolean)
            .join(" ")
        : "";

      return {
        bounds: {
          bottom: Math.round(bounds.bottom),
          height: Math.round(bounds.height),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          top: Math.round(bounds.top),
          width: Math.round(bounds.width),
        },
        key: elementKey(element),
        label: (
          element.getAttribute("aria-label") ||
          labelledText ||
          element.getAttribute("title") ||
          element.textContent ||
          element.getAttribute("value") ||
          element.tagName
        )
          .trim()
          .slice(0, 120),
        offViewport:
          bounds.left < -0.5 ||
          bounds.top < -0.5 ||
          bounds.right > window.innerWidth + 0.5 ||
          bounds.bottom > window.innerHeight + 0.5,
        inWorkSurface: Boolean(
          element.closest('[data-slot="app-shell-content"], main'),
        ),
        operationalSurfaceKey: operationalSurface?.contains(element)
          ? contract.key
          : null,
        operationalSurfaceSelector: operationalSurface?.contains(element)
          ? contract.selector
          : null,
        region: regionName(element),
        tagName: element.tagName,
      };
    }

    if (!shouldReturnInventory) {
      return targetSnapshot(document.activeElement);
    }

    const targets = [...document.querySelectorAll(selector)]
      .filter((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return (
          !element.matches(":disabled") &&
          !element.closest("[inert]") &&
          element.tabIndex >= 0 &&
          element.getAttribute("aria-hidden") !== "true" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      })
      .map(targetSnapshot)
      .filter(Boolean);

    return {
      operationalSurface: {
        eligibleTargetKeys: targets
          .filter((target) => target.operationalSurfaceKey === contract.key)
          .map((target) => target.key),
        exists: Boolean(operationalSurface),
        key: contract.key,
        selector: contract.selector,
      },
      targets,
    };
  }, { contract: operationalSurfaceContract, shouldReturnInventory: includeInventory });
}

function isExpectedDevServerConsoleError(message) {
  return /^WebSocket connection to 'ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/_next\/webpack-hmr\?id=[^']+' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE$/.test(
    message,
  );
}

async function runAxe(page, route) {
  const analysis = await new AxeBuilder({ page }).analyze();
  const violations = analysis.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .filter(
      (violation) =>
        !knownAxeExceptions.some(
          (exception) =>
            exception.route === route && exception.rule === violation.id,
        ),
    )
    .map((violation) => ({
      help: violation.help,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.slice(0, 10).map((node) => ({
        failureSummary: node.failureSummary,
        target: node.target,
      })),
    }));

  return { error: null, violations };
}

async function measurePrimaryActions(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector('[data-slot="app-shell-content"]') ??
      document.querySelector("main") ??
      document.body;
    const candidates = Array.from(
      root.querySelectorAll("a[href], button, input[type='submit']"),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return (
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    });

    return {
      count: candidates.length,
      reachable: candidates.length > 0,
      sample: candidates.slice(0, 5).map((element) =>
        (
          element.getAttribute("aria-label") ||
          element.textContent ||
          element.getAttribute("value") ||
          element.tagName
        ).trim(),
      ),
    };
  });
}

async function measureHorizontalOverflow(page) {
  return page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const viewportWidth = documentElement.clientWidth;
    const scrollWidth = Math.max(
      documentElement.scrollWidth,
      body?.scrollWidth ?? 0,
    );
    const overflowingElements = Array.from(body?.querySelectorAll("*") ?? [])
      .map((element) => {
        const bounds = element.getBoundingClientRect();

        return {
          className: String(element.className ?? "").slice(0, 160),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          tagName: element.tagName,
          width: Math.round(bounds.width),
        };
      })
      .filter(
        ({ left, right, width }) =>
          width > 0 && (left < -1 || right > viewportWidth + 1),
      )
      .slice(0, 10);

    return {
      hasOverflow: scrollWidth > viewportWidth + 1,
      overflowingElements,
      scrollWidth,
      viewportWidth,
    };
  });
}

function getAccessResult({
  finalUrl,
  navigationError,
  requestedRoute,
  responseStatus,
}) {
  if (navigationError) {
    return "navigation-error";
  }

  if (responseStatus && responseStatus >= 400) {
    return "http-error";
  }

  const finalPath = new URL(finalUrl).pathname.replace(/\/$/, "") || "/";
  const normalizedRequestedRoute =
    new URL(requestedRoute, `${baseUrl}/`).pathname.replace(/\/$/, "") || "/";

  if (finalPath === normalizedRequestedRoute) {
    return "accessible";
  }

  if (finalPath === "/login") {
    return "login-required";
  }

  if (finalPath === "/setup") {
    return "setup-required";
  }

  if (finalPath === "/no-access") {
    return "permission-blocked";
  }

  return "redirected";
}

function verifyQueryContract({
  expectedFinalPath,
  finalUrl,
  queryContract,
  requestedUrl,
}) {
  if (queryContract === "redirect-preserved") {
    return toPathAndSearch(finalUrl) === expectedFinalPath;
  }

  if (queryContract !== "preserved") {
    return true;
  }

  const requested = new URL(requestedUrl);
  const final = new URL(finalUrl);

  for (const [key, value] of requested.searchParams) {
    if (!final.searchParams.getAll(key).includes(value)) {
      return false;
    }
  }

  return true;
}

async function followExpectedRedirect({
  expectedAccess,
  expectedFinalPath = null,
  page,
  requestedUrl,
}) {
  if (expectedAccess === "accessible") {
    return;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const currentUrl = page.url();
    const currentAccess = getAccessResult({
      finalUrl: currentUrl,
      navigationError: null,
      requestedRoute: requestedUrl,
      responseStatus: null,
    });
    const exactDestinationReached =
      !expectedFinalPath || toPathAndSearch(currentUrl) === expectedFinalPath;

    if (currentAccess === expectedAccess && exactDestinationReached) {
      return;
    }

    const refreshContent = await page
      .locator('meta#__next-page-redirect, meta[http-equiv="refresh"]')
      .first()
      .getAttribute("content", { timeout: 2_000 })
      .catch(() => null);
    const refreshTarget = refreshContent
      ?.match(/url=(.+)$/i)?.[1]
      ?.trim()
      .replace(/^(?:"|')|(?:"|')$/g, "");

    if (refreshTarget) {
      const targetUrl = new URL(refreshTarget, currentUrl).toString();
      const followedAutomatically = await page
        .waitForURL((url) => url.toString() === targetUrl, { timeout: 750 })
        .then(() => true)
        .catch(() => false);

      if (!followedAutomatically) {
        try {
          await page.goto(targetUrl, {
            timeout: 30_000,
            waitUntil: "domcontentloaded",
          });
        } catch (error) {
          if (!String(error).includes("net::ERR_ABORTED")) {
            throw error;
          }

          await page.waitForURL((url) => url.toString() === targetUrl, {
            timeout: 5_000,
          });
        }
      }
      continue;
    }

    await page.waitForURL((url) => url.toString() !== currentUrl, {
      timeout: 3_000,
    });
  }

  throw new Error(
    `Redirect chain did not reach ${expectedAccess} from ${requestedUrl}`,
  );
}

function toPathAndSearch(value) {
  const url = new URL(value, `${baseUrl}/`);
  return `${url.pathname}${url.search}`;
}

function routeSlug(route) {
  if (route === "/") {
    return "root";
  }

  return route.slice(1).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function renderEvidenceDocument(summary) {
  const failureCount = collectSmokeFailures(
    [...summary.results, ...summary.maintenanceBoardResults],
    summary.roleAudits,
    summary.blockedMutationRequests,
    summary.keyboardZoomAudits ?? null,
  ).length;
  const viewportSummary = formatViewportSummary(summary.viewports);
  const lines = [
    "# UI Redesign Verification Evidence",
    "",
    `Generated from \`config/ui-route-coverage.json\` on ${summary.completedAt}.`,
    `Browser artifacts: \`${summary.runDirectory}\`.`,
    "",
    "## Verdict",
    "",
    `- ${summary.results.length} admin route/viewport captures completed across ${viewportSummary}.`,
    `- ${summary.maintenanceBoardResults.length} supplemental Maintenance board viewport captures completed in the same read-only run.`,
    `- ${summary.roleAudits.length} manager, member, and anonymous access checks matched the manifest.`,
    `- Serious/critical axe findings, application errors, document overflow, unreachable actions, blocked mutations, and query-contract failures: ${failureCount}.`,
    "- Local fixture evidence only; this is not hosted production certification.",
    "",
    "## Route matrix",
    "",
    "| Manifest route | Smoke path | Admin final path | Manager | Member | Anonymous | States | Viewports / a11y | Query / redirect | Limitation |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const entry of manifest) {
    const adminResults = summary.results.filter(
      (result) => result.manifestRoute === entry.route,
    );
    const adminFinalPaths = [
      ...new Set(adminResults.map((result) => result.finalPath)),
    ].join("<br>");
    const audits = Object.fromEntries(
      summary.roleAudits
        .filter((audit) => audit.manifestRoute === entry.route)
        .map((audit) => [
          audit.role,
          `${audit.accessResult} (expected ${audit.expectedAccess})`,
        ]),
    );
    const viewportPass = formatViewportPass(adminResults, summary.viewports);
    const limitation = entry.smoke.limitations.join(" ") || "None";

    lines.push(`<!-- route-evidence:${entry.route} -->`);
    lines.push(
      `| ${escapeTable(entry.route)} | ${escapeTable(entry.smoke.path)} | ${escapeTable(adminFinalPaths)} | ${escapeTable(audits.manager)} | ${escapeTable(audits.member)} | ${escapeTable(audits.anonymous)} | ${escapeTable(entry.states.join(", ") || "redirect only")} | ${viewportPass} | ${escapeTable(entry.smoke.queryContract)} | ${escapeTable(limitation)} |`,
    );
  }

  lines.push(
    "",
    "## Cross-route workflow evidence",
    "",
    "- Command search, focus trap, keyboard traversal, and property/unit/person result safety: `src/components/layout/workspace-command-palette.test.tsx`.",
    "- Property filter, selected record, inspector, detail, and retained query behavior: `src/features/properties/components/property-screen.test.tsx` and the route matrix query checks.",
    "- People lens aliases, person detail, and related leases: `src/features/people/components/people-screen.test.tsx` and `src/features/people/components/person-detail-screen.test.tsx`.",
    "- Rent, expense, ledger totals and drilldowns: finance workspace component tests plus the populated browser captures.",
    "- Maintenance list, board, calendar, checklist, and capability-correct actions: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx` and manager/member role audits.",
    "- Timeline scope routes and linked records: timeline route tests and the four timeline captures.",
    "- Three required report tabs with PDF and Excel export: report screen tests and `/reports/unit-profit-loss` capture.",
    "- Settings draft, discard, save, and error: settings workspace tests and shared workflow feedback contracts.",
    "- Import preview create/update/skip consequences: import screen tests; browser capture remains read-only.",
    "",
    "## Keyboard, zoom, and state evidence",
    "",
    "- Native tab order, current navigation, command palette focus trap, drawer Escape/return, field error association, and live announcements are enforced by `src/lib/ui/accessibility-contract.test.tsx` and feature interaction tests.",
    `- The saved manifest captures cover ${viewportSummary}; pass counts in the route matrix are derived from this runtime viewport list.`,
    renderKeyboardZoomEvidence(summary.keyboardZoomAudits ?? []),
    "- Loading, true empty, filtered empty, error/retry, permission blocked, draft, saving, and success evidence is mapped per route in the manifest and validated by `src/lib/ui/route-state-evidence.test.ts`.",
    "",
    "## Known limitation",
    "",
    "The retained browser fixtures cover linked admin, manager, and member accounts. Unlinked-account setup/no-access presentation is covered by auth and system-state contracts; no disposable unlinked browser account is retained. Owner: Product/QA. Follow-up: add an ephemeral unlinked fixture when the local auth harness supports automatic teardown.",
  );

  return `${lines.join("\n")}\n`;
}

async function writeEvidenceDocument(summary) {
  await assertEvidenceArtifacts(summary, manifest);
  const evidenceDirectory = resolve("docs", "verification");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, "ui-redesign-evidence.md"),
    renderEvidenceDocument(summary),
    "utf8",
  );
}

function escapeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function toArtifactPath(path) {
  return relative(process.cwd(), path).split(sep).join("/");
}
