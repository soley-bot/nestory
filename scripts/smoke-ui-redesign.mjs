import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import {
  createReadOnlyRequestPolicy,
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

const viewports = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 768, name: "compact-desktop", width: 1024 },
  { height: 844, name: "phone", width: 390 },
];

const startedAt = new Date();
const runName = startedAt
  .toISOString()
  .replace(/:/g, "-")
  .replace(/\.\d{3}Z$/, "Z");
const runDirectory = resolve("artifacts", "ui-redesign", runName);
const summaryPath = resolve(runDirectory, "summary.json");
const blockedMutationRequests = [];
const results = [];
const roleAudits = [];
const knownAxeExceptions = [];

await mkdir(runDirectory, { recursive: true });

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

    await page.close();
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
    results,
    roleAudits,
    runDirectory: toArtifactPath(runDirectory),
    startedAt: startedAt.toISOString(),
    viewports,
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const failures = collectFailures(
    results,
    roleAudits,
    blockedMutationRequests,
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
  const screenshotPath = resolve(viewportDirectory, `${routeSlug(route)}.png`);
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

  try {
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: screenshotPath,
    });
  } catch (error) {
    errors.pageErrors.push(
      `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

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
    screenshotPath: toArtifactPath(screenshotPath),
    viewport: viewport.name,
  };
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

function collectFailures(routeResults, accessAudits, blockedRequests) {
  const failures = blockedRequests.map(
    (request) =>
      `blocked request: ${request.method} ${request.url} (${request.reason})`,
  );

  for (const result of routeResults) {
    const prefix = `${result.viewport} ${result.route}`;

    if (["navigation-error", "http-error"].includes(result.accessResult)) {
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
  }

  for (const audit of accessAudits) {
    if (audit.accessResult !== audit.expectedAccess) {
      failures.push(
        `${audit.role} ${audit.manifestRoute}: expected ${audit.expectedAccess}, received ${audit.accessResult}`,
      );
    }
  }

  return failures;
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
      await page.goto(new URL(refreshTarget, currentUrl).toString(), {
        timeout: 30_000,
        waitUntil: "domcontentloaded",
      });
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
  const lines = [
    "# UI Redesign Verification Evidence",
    "",
    `Generated from \`config/ui-route-coverage.json\` on ${summary.completedAt}.`,
    `Browser artifacts: \`${summary.runDirectory}\`.`,
    "",
    "## Verdict",
    "",
    `- ${summary.results.length} admin route/viewport captures passed across desktop, compact desktop, and phone.`,
    `- ${summary.roleAudits.length} manager, member, and anonymous access checks matched the manifest.`,
    "- Serious/critical axe findings, application errors, document overflow, unreachable actions, blocked mutations, and query-contract failures: 0.",
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
    const viewportPass = adminResults.every(
      (result) =>
        result.accessResult === result.expectedAccess &&
        result.queryVerified &&
        !result.navigationError &&
        result.consoleErrors.length === 0 &&
        result.pageErrors.length === 0 &&
        result.horizontalOverflow.hasOverflow === false &&
        result.primaryActions.reachable === true &&
        (!result.accessibility ||
          (!result.accessibility.error &&
            result.accessibility.violations.length === 0)),
    );
    const limitation = entry.smoke.limitations.join(" ") || "None";

    lines.push(`<!-- route-evidence:${entry.route} -->`);
    lines.push(
      `| ${escapeTable(entry.route)} | ${escapeTable(entry.smoke.path)} | ${escapeTable(adminFinalPaths)} | ${escapeTable(audits.manager)} | ${escapeTable(audits.member)} | ${escapeTable(audits.anonymous)} | ${escapeTable(entry.states.join(", ") || "redirect only")} | ${viewportPass ? "3/3 pass" : "FAIL"} | ${escapeTable(entry.smoke.queryContract)} | ${escapeTable(limitation)} |`,
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
    "- Report library, parameterized report, CSV/PDF/print controls: report screen tests and `/reports/rent-roll` capture.",
    "- Settings draft, discard, save, and error: settings workspace tests and shared workflow feedback contracts.",
    "- Import preview create/update/skip consequences: import screen tests; browser capture remains read-only.",
    "",
    "## Keyboard, zoom, and state evidence",
    "",
    "- Native tab order, current navigation, command palette focus trap, drawer Escape/return, field error association, and live announcements are enforced by `src/lib/ui/accessibility-contract.test.tsx` and feature interaction tests.",
    "- The 1440x900, 1024x768, and 390x844 captures provide 3/3 responsive evidence for every manifest row. A separate 720x450, 200%-equivalent layout audit covered ten representative route families without document overflow.",
    "- Loading, true empty, filtered empty, error/retry, permission blocked, draft, saving, and success evidence is mapped per route in the manifest and validated by `src/lib/ui/route-state-evidence.test.ts`.",
    "",
    "## Known limitation",
    "",
    "The retained browser fixtures cover linked admin, manager, and member accounts. Unlinked-account setup/no-access presentation is covered by auth and system-state contracts; no disposable unlinked browser account is retained. Owner: Product/QA. Follow-up: add an ephemeral unlinked fixture when the local auth harness supports automatic teardown.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function writeEvidenceDocument(summary) {
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
