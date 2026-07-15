import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.NESTORY_BASE_URL ?? "http://localhost:3000";
const email = process.env.NESTORY_TEST_EMAIL?.trim();
const password = process.env.NESTORY_TEST_PASSWORD;

if (!email || !password) {
  throw new Error(
    "Set NESTORY_TEST_EMAIL and NESTORY_TEST_PASSWORD before running the Maintenance mobile smoke.",
  );
}

const routeMatrix = [
  { heading: "Cases", label: "cases-list", path: "/maintenance", primary: "New case" },
  { heading: "Cases", label: "cases-board", path: "/maintenance?view=board", primary: "New case" },
  { heading: "Cases", label: "cases-calendar", path: "/maintenance?view=calendar", primary: "New case" },
  { heading: "Tasks", label: "tasks", path: "/tasks", primary: "New task" },
  { heading: "Recurring Work", label: "recurring-work", path: "/recurring-tasks", primary: "New recurring task" },
  { heading: "Inspections", label: "inspections", path: "/inspections", primary: "New inspection" },
  { heading: "Work Orders", label: "work-orders", path: "/work-orders", primary: "New work order" },
];
const matrixViewports = [
  { height: 900, width: 1440 },
  { height: 768, width: 1024 },
  { height: 844, width: 390 },
];
const legacyMaintenanceViewports = [
  { height: 700, width: 320 },
  { height: 812, width: 375 },
  { height: 896, width: 414 },
  { height: 800, width: 1280 },
];
const artifactDirectory = path.resolve(
  "artifacts",
  "ui-redesign",
  `maintenance-${new Date().toISOString().replaceAll(":", "-")}`,
);

await fs.mkdir(artifactDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: matrixViewports[0],
});
const consoleProblems = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleProblems.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  consoleProblems.push(`pageerror: ${error.message}`);
});

try {
  await signIn();

  const measurements = [];
  const failures = [];

  for (const route of routeMatrix) {
    for (const viewport of matrixViewports) {
      await openRoute(route, viewport);
      const label = `${route.label}-${viewport.width}`;
      const primary = page.getByRole("button", { name: route.primary, exact: true });
      const measurement = await measureLayout(label, { primary });
      measurements.push(measurement);
      failures.push(...getDocumentOverflowFailures(measurement));
      failures.push(...(await getWorkspaceContractFailures(route, viewport, primary)));

      const recordTrigger = page.locator("[data-maintenance-record-trigger]").first();
      const recordCount = await page.locator("[data-maintenance-record-trigger]").count();

      if (recordCount === 0) {
        failures.push(`${label} has no record trigger for Preview verification.`);
      } else if (viewport.width >= 1280) {
        const inspector = page.getByRole("complementary", { name: /Preview$/ }).first();
        if (!(await inspector.isVisible())) {
          failures.push(`${label} does not expose the docked record Preview.`);
        }
      } else {
        const dismissReminders = page.getByRole("button", {
          name: "Dismiss reminders",
        });
        if (await dismissReminders.isVisible()) {
          await dismissReminders.click();
        }
        await recordTrigger.click();
        if (route.label === "cases-calendar") {
          await page.getByRole("button", { name: "Open Preview" }).click();
        }
        const preview = page.getByRole("dialog", { name: /Preview$/ }).first();
        await preview.waitFor();
        const previewMeasurement = await measureLayout(`${label}-preview`, {
          drawer: preview,
          primary,
        });
        measurements.push(previewMeasurement);
        failures.push(...getDocumentOverflowFailures(previewMeasurement));
        failures.push(...getDrawerFailures(previewMeasurement));
        await preview.getByRole("button", { name: "Close drawer" }).click();
        await preview.waitFor({ state: "hidden" });

        const recordTriggerId = await recordTrigger.getAttribute(
          "data-maintenance-record-trigger",
        );
        const focusReturned = await waitForRecordFocus(recordTriggerId);
        if (!focusReturned) {
          const activeFocus = await page.evaluate(() => ({
            ariaLabel: document.activeElement?.getAttribute("aria-label"),
            recordId: document.activeElement?.getAttribute(
              "data-maintenance-record-trigger",
            ),
            tagName: document.activeElement?.tagName,
            text: document.activeElement?.textContent?.trim().slice(0, 80),
          }));
          failures.push(
            `${label} did not return focus to its record trigger; active element: ${JSON.stringify(activeFocus)}.`,
          );
        }
      }

      await page.screenshot({
        fullPage: true,
        path: path.join(artifactDirectory, `${label}.png`),
      });
    }
  }

  for (const viewport of legacyMaintenanceViewports) {
    await openRoute(routeMatrix[0], viewport);
    const primary = page.getByRole("button", { name: "New case", exact: true });
    const measurement = await measureLayout(`legacy-cases-${viewport.width}`, {
      primary,
      table: page.getByRole("table"),
    });
    measurements.push(measurement);
    failures.push(...getDocumentOverflowFailures(measurement));
  }

  await openRoute(routeMatrix[0], { height: 844, width: 390 });
  const interactionResults = await verifyMaintenanceListInteractions();
  measurements.push(...interactionResults.measurements);
  failures.push(...interactionResults.failures);

  if (consoleProblems.length > 0) {
    failures.push(`Browser console problems:\n${consoleProblems.join("\n")}`);
  }

  const summary = {
    artifacts: artifactDirectory,
    consoleProblems,
    measurements,
    routes: routeMatrix.map((route) => route.path),
    viewports: matrixViewports,
  };
  await fs.writeFile(
    path.join(artifactDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    throw new Error(`Maintenance workspace smoke failed:\n- ${failures.join("\n- ")}`);
  }

  console.log("Maintenance workspace smoke passed.");
} finally {
  await browser.close();
}

async function signIn() {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(workspace|overview|maintenance|tasks|setup|no-access)(\?|$)/, {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  if (/\/(setup|no-access)(\?|$)/.test(page.url())) {
    throw new Error(`Smoke account cannot open a workspace: ${page.url()}`);
  }
}

async function openRoute(route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: route.heading }).waitFor();
  await page.getByRole("navigation", { name: "Maintenance workspace" }).waitFor();
}

async function waitForRecordFocus(recordTriggerId) {
  try {
    await page.waitForFunction(
      (id) =>
        document.activeElement?.closest("[data-maintenance-record-trigger]")?.getAttribute(
          "data-maintenance-record-trigger",
        ) === id,
      recordTriggerId,
      { timeout: 2_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function getWorkspaceContractFailures(route, viewport, primary) {
  const failures = [];
  const label = `${route.label}-${viewport.width}`;
  const localNavs = page.getByRole("navigation", { name: "Maintenance workspace" });
  const currentItems = localNavs.locator('[aria-current="page"]');

  if ((await localNavs.count()) !== 1) {
    failures.push(`${label} has ${(await localNavs.count())} maintenance local navigations.`);
  }
  if ((await currentItems.count()) !== 1) {
    failures.push(`${label} has ${(await currentItems.count())} active local destinations.`);
  }
  if (!(await primary.isVisible())) {
    failures.push(`${label} hides its primary action (${route.primary}).`);
  } else {
    const bounds = await primary.boundingBox();
    if (
      !bounds ||
      bounds.x < -0.5 ||
      bounds.x + bounds.width > viewport.width + 0.5 ||
      bounds.y < -0.5 ||
      bounds.y + bounds.height > viewport.height + 0.5
    ) {
      failures.push(`${label} primary action is outside the viewport: ${JSON.stringify(bounds)}.`);
    }
  }

  return failures;
}

async function verifyMaintenanceListInteractions() {
  const failures = [];
  const measurements = [];
  const primary = page.getByRole("button", { name: "New case", exact: true });
  const filtersButton = page.getByRole("button", { name: /^Filters/ });

  await filtersButton.click();
  await page.getByLabel("Maintenance scope").waitFor();
  const filtersOpen = await measureLayout("filters-open-390", { primary });
  measurements.push(filtersOpen);
  failures.push(...getDocumentOverflowFailures(filtersOpen));
  await filtersButton.click();

  const table = page.getByRole("table");
  const tableScrollResult = await table.evaluate((element) => {
    const scrollRegion = element.parentElement;
    if (!scrollRegion) throw new Error("Maintenance table is missing its scroll region.");
    scrollRegion.scrollLeft = 0;
    const targetScrollLeft = Math.min(
      160,
      scrollRegion.scrollWidth - scrollRegion.clientWidth,
    );
    scrollRegion.scrollLeft = targetScrollLeft;
    return {
      clientWidth: scrollRegion.clientWidth,
      scrollLeft: scrollRegion.scrollLeft,
      scrollWidth: scrollRegion.scrollWidth,
      targetScrollLeft,
    };
  });

  if (tableScrollResult.targetScrollLeft <= 0 || tableScrollResult.scrollLeft <= 0) {
    failures.push(`Maintenance table did not scroll locally: ${JSON.stringify(tableScrollResult)}.`);
  }

  await primary.click();
  const createDrawer = page.getByRole("dialog", {
    name: "New maintenance case",
    exact: true,
  });
  await createDrawer.waitFor();
  const createOpen = await measureLayout("create-open-390", {
    drawer: createDrawer,
    primary,
    table,
  });
  measurements.push(createOpen);
  failures.push(...getDocumentOverflowFailures(createOpen));
  failures.push(...getDrawerFailures(createOpen));
  await createDrawer.getByRole("button", { name: "Close drawer" }).click();
  await createDrawer.waitFor({ state: "hidden" });

  if (!(await primary.evaluate((element) => element === document.activeElement))) {
    failures.push("Create drawer did not return focus to New case.");
  }

  return { failures, measurements };
}

async function measureLayout(label, { drawer, primary, table } = {}) {
  const [documentMetrics, drawerMetrics, primaryMetrics, tableMetrics] = await Promise.all([
    page.evaluate(() => {
      const documentElement = document.documentElement;
      const body = document.body;
      const firstEscapingElement = Array.from(body.querySelectorAll("*"))
        .map((element) => ({ bounds: element.getBoundingClientRect(), element }))
        .find(
          ({ bounds }) =>
            bounds.width > 0 &&
            (bounds.left < -0.5 || bounds.right > documentElement.clientWidth + 0.5),
        );
      return {
        bodyScrollWidth: body.scrollWidth,
        documentClientWidth: documentElement.clientWidth,
        documentScrollWidth: documentElement.scrollWidth,
        firstEscapingElement: firstEscapingElement
          ? {
              className: String(firstEscapingElement.element.className ?? "").slice(0, 180),
              left: Math.round(firstEscapingElement.bounds.left),
              right: Math.round(firstEscapingElement.bounds.right),
              scrollWidth: firstEscapingElement.element.scrollWidth,
              tagName: firstEscapingElement.element.tagName,
              width: Math.round(firstEscapingElement.bounds.width),
            }
          : null,
        innerWidth: window.innerWidth,
      };
    }),
    drawer
      ? drawer.evaluate((element) => {
          const drawerPanel = element.querySelector(":scope > aside");
          if (!drawerPanel) throw new Error("Maintenance drawer is missing its panel.");
          const bounds = drawerPanel.getBoundingClientRect();
          return {
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            scrollWidth: drawerPanel.scrollWidth,
            width: Math.round(bounds.width),
          };
        })
      : Promise.resolve(null),
    primary
      ? primary.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            bottom: Math.round(bounds.bottom),
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            top: Math.round(bounds.top),
          };
        })
      : Promise.resolve(null),
    table
      ? table.evaluate((element) => {
          const scrollRegion = element.parentElement;
          if (!scrollRegion) throw new Error("Maintenance table is missing its scroll region.");
          const bounds = scrollRegion.getBoundingClientRect();
          return {
            clientWidth: scrollRegion.clientWidth,
            left: Math.round(bounds.left),
            overflowX: window.getComputedStyle(scrollRegion).overflowX,
            right: Math.round(bounds.right),
            scrollWidth: scrollRegion.scrollWidth,
          };
        })
      : Promise.resolve(null),
  ]);

  return {
    ...documentMetrics,
    drawer: drawerMetrics,
    label,
    primary: primaryMetrics,
    table: tableMetrics,
    viewport: page.viewportSize(),
  };
}

function getDocumentOverflowFailures(measurement) {
  const failures = [];
  if (measurement.documentScrollWidth > measurement.documentClientWidth) {
    failures.push(
      `${measurement.label} document overflow: ${measurement.documentScrollWidth}px > ${measurement.documentClientWidth}px.`,
    );
  }
  if (measurement.bodyScrollWidth > measurement.innerWidth) {
    failures.push(
      `${measurement.label} body overflow: ${measurement.bodyScrollWidth}px > ${measurement.innerWidth}px.`,
    );
  }
  return failures;
}

function getDrawerFailures(measurement) {
  if (!measurement.drawer) {
    return [`${measurement.label} did not expose drawer measurements.`];
  }
  if (
    measurement.drawer.left < -0.5 ||
    measurement.drawer.right > measurement.documentClientWidth + 0.5
  ) {
    return [
      `${measurement.label} drawer escapes the viewport: ${JSON.stringify(measurement.drawer)}.`,
    ];
  }
  return [];
}
