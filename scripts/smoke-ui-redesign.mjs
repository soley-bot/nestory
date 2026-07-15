import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
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
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD;

if (!email || !password) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required");
}

const routes = [
  "/overview",
  "/properties",
  "/units",
  "/people",
  "/owners",
  "/staff",
  "/tenants",
  "/vendors",
  "/leases",
  "/rent-income",
  "/bills-expenses",
  "/ledger",
  "/petty-cash",
  "/maintenance",
  "/timeline",
  "/documents",
  "/reports",
  "/settings",
  "/users-roles",
  "/account",
  "/",
];

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
const requestPolicy = createReadOnlyRequestPolicy({ baseUrl });

await mkdir(runDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  deviceScaleFactor: 1,
  serviceWorkers: "block",
});

await context.route("**/*", async (route) => {
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
    url: request.url(),
  });
  await route.abort("blockedbyclient");
});

try {
  await authenticate(context);

  for (const viewport of viewports) {
    const viewportDirectory = resolve(runDirectory, viewport.name);
    await mkdir(viewportDirectory, { recursive: true });

    const page = await context.newPage();
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    let activeErrors = null;

    page.on("console", (message) => {
      if (message.type() === "error") {
        activeErrors?.consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      activeErrors?.pageErrors.push(error.message);
    });

    for (const route of routes) {
      activeErrors = { consoleErrors: [], pageErrors: [] };
      results.push(
        await captureRoute({
          errors: activeErrors,
          page,
          route,
          viewport,
          viewportDirectory,
        }),
      );
      activeErrors = null;
    }

    await page.close();
  }

  const summary = {
    baseUrl,
    blockedMutationRequests,
    completedAt: new Date().toISOString(),
    results,
    runDirectory: toArtifactPath(runDirectory),
    startedAt: startedAt.toISOString(),
    viewports,
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (blockedMutationRequests.length > 0) {
    throw new Error(
      `Blocked ${blockedMutationRequests.length} non-read request(s); inspect ${toArtifactPath(summaryPath)}`,
    );
  }

  console.log(
    `UI redesign baseline captured ${results.length} route/viewport pairs in ${toArtifactPath(runDirectory)}.`,
  );
} finally {
  await context.close();
  await browser.close();
}

async function authenticate(browserContext) {
  const page = await browserContext.newPage();

  try {
    await page.goto(`${baseUrl}/login`, {
      timeout: 30_000,
      waitUntil: "networkidle",
    });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);

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
  errors,
  page,
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
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const finalUrl = page.url();
  const horizontalOverflow = await measureHorizontalOverflow(page).catch(
    (error) => ({
      error: error instanceof Error ? error.message : String(error),
      hasOverflow: null,
    }),
  );

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
    consoleErrors: errors.consoleErrors,
    finalUrl,
    horizontalOverflow,
    navigationError,
    pageErrors: errors.pageErrors,
    pageTitle: await page.title().catch(() => ""),
    responseStatus,
    route,
    screenshotPath: toArtifactPath(screenshotPath),
    viewport: viewport.name,
  };
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
  const normalizedRequestedRoute = requestedRoute.replace(/\/$/, "") || "/";

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

function routeSlug(route) {
  if (route === "/") {
    return "root";
  }

  return route.slice(1).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function toArtifactPath(path) {
  return relative(process.cwd(), path).split(sep).join("/");
}
