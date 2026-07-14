import { chromium } from "playwright";

const baseUrl = process.env.NESTORY_BASE_URL ?? "http://localhost:3000";
const email = process.env.NESTORY_TEST_EMAIL ?? "nestory@gmail.com";
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const viewports = [
  { height: 700, width: 320 },
  { height: 812, width: 375 },
  { height: 844, width: 390 },
  { height: 896, width: 414 },
  { height: 800, width: 1280 },
  { height: 900, width: 1440 },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: viewports.at(-1),
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

  for (const viewport of viewports) {
    await openMaintenance(viewport);
    measurements.push(await measureLayout(`default-${viewport.width}`));
  }

  await openMaintenance({ height: 844, width: 390 });

  const filtersButton = page.getByRole("button", { name: /^Filters/ });
  await filtersButton.click();
  await page.getByLabel("Maintenance scope").waitFor();
  const filtersOpen = await measureLayout("filters-open-390");
  await filtersButton.click();

  const table = page.getByRole("table");
  const tableScrollResult = await table.evaluate((element) => {
    const scrollRegion = element.parentElement;

    if (!scrollRegion) {
      throw new Error("Maintenance table is missing its scroll region.");
    }

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

  const caseRows = page.locator("table tbody tr[tabindex='0']");
  if ((await caseRows.count()) === 0) {
    throw new Error("Expected at least one Maintenance case for preview smoke.");
  }
  await caseRows.first().press("Enter");
  const previewDrawer = page.getByRole("dialog", { name: "Case", exact: true });
  await previewDrawer.waitFor();
  const previewOpen = await measureLayout("preview-open-390", previewDrawer);
  await previewDrawer.getByRole("button", { name: "Close drawer" }).click();
  await previewDrawer.waitFor({ state: "hidden" });
  const previewClosed = await measureLayout("preview-closed-390");

  await page.getByRole("button", { name: "New case", exact: true }).click();
  const createDrawer = page.getByRole("dialog", {
    name: "New maintenance case",
    exact: true,
  });
  await createDrawer.waitFor();
  const createOpen = await measureLayout("create-open-390", createDrawer);
  await createDrawer.getByRole("button", { name: "Close drawer" }).click();
  await createDrawer.waitFor({ state: "hidden" });
  const createClosed = await measureLayout("create-closed-390");

  const interactionMeasurements = [
    filtersOpen,
    previewOpen,
    previewClosed,
    createOpen,
    createClosed,
  ];
  const failures = [
    ...measurements.flatMap(getDocumentOverflowFailures),
    ...interactionMeasurements.flatMap(getDocumentOverflowFailures),
  ];
  const mobileMeasurement = measurements.find(
    (measurement) => measurement.viewport.width === 390,
  );

  if (!mobileMeasurement) {
    failures.push("Missing the 390px Maintenance measurement.");
  } else {
    if (mobileMeasurement.table.left < -0.5) {
      failures.push(
        `390px table scroll region begins outside the viewport: ${mobileMeasurement.table.left}px.`,
      );
    }
    if (mobileMeasurement.table.right > mobileMeasurement.documentClientWidth + 0.5) {
      failures.push(
        `390px table scroll region escapes the viewport: ${mobileMeasurement.table.right}px > ${mobileMeasurement.documentClientWidth}px.`,
      );
    }
    if (mobileMeasurement.table.scrollWidth <= mobileMeasurement.table.clientWidth) {
      failures.push(
        `390px table should overflow locally: ${mobileMeasurement.table.scrollWidth}px <= ${mobileMeasurement.table.clientWidth}px.`,
      );
    }
  }

  if (
    tableScrollResult.targetScrollLeft <= 0 ||
    tableScrollResult.scrollLeft <= 0
  ) {
    failures.push(
      `Maintenance table did not scroll locally: ${JSON.stringify(tableScrollResult)}.`,
    );
  }

  for (const measurement of [previewOpen, createOpen]) {
    if (!measurement.drawer) {
      failures.push(`${measurement.label} did not expose drawer measurements.`);
      continue;
    }

    if (
      measurement.drawer.left < -0.5 ||
      measurement.drawer.right > measurement.documentClientWidth + 0.5
    ) {
      failures.push(
        `${measurement.label} drawer escapes the viewport: ${JSON.stringify(measurement.drawer)}.`,
      );
    }
  }

  if (consoleProblems.length > 0) {
    failures.push(`Browser console problems:\n${consoleProblems.join("\n")}`);
  }

  console.log(
    JSON.stringify(
      {
        interactions: interactionMeasurements,
        tableScrollResult,
        viewports: measurements,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(`Maintenance mobile smoke failed:\n- ${failures.join("\n- ")}`);
  }

  console.log("Maintenance mobile smoke passed.");
} finally {
  await browser.close();
}

async function signIn() {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(overview|maintenance|tasks|setup|no-access)(\?|$)/, {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  if (/\/(setup|no-access)(\?|$)/.test(page.url())) {
    throw new Error(`Smoke account cannot open a workspace: ${page.url()}`);
  }
}

async function openMaintenance(viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/maintenance`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "Cases" }).waitFor();
  await page.getByRole("table").waitFor();
}

async function measureLayout(label, drawer) {
  const table = page.getByRole("table");
  const [documentMetrics, tableMetrics, drawerMetrics] = await Promise.all([
    page.evaluate(() => {
      const documentElement = document.documentElement;
      const body = document.body;
      const firstEscapingElement = Array.from(body.querySelectorAll("*"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();

          return {
            bounds,
            element,
          };
        })
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
              className: String(firstEscapingElement.element.className ?? "").slice(
                0,
                180,
              ),
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
    table.evaluate((element) => {
      const scrollRegion = element.parentElement;

      if (!scrollRegion) {
        throw new Error("Maintenance table is missing its scroll region.");
      }

      const bounds = scrollRegion.getBoundingClientRect();

      return {
        clientWidth: scrollRegion.clientWidth,
        left: Math.round(bounds.left),
        overflowX: window.getComputedStyle(scrollRegion).overflowX,
        right: Math.round(bounds.right),
        scrollWidth: scrollRegion.scrollWidth,
      };
    }),
    drawer
      ? drawer.evaluate((element) => {
          const drawerPanel = element.querySelector(":scope > aside");

          if (!drawerPanel) {
            throw new Error("Maintenance drawer is missing its panel.");
          }

          const bounds = drawerPanel.getBoundingClientRect();

          return {
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            scrollWidth: drawerPanel.scrollWidth,
            width: Math.round(bounds.width),
          };
        })
      : Promise.resolve(null),
  ]);

  return {
    ...documentMetrics,
    drawer: drawerMetrics,
    label,
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
