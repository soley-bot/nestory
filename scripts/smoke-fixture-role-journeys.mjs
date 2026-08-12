import { chromium } from "playwright";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";
import {
  fixtureRoleJourneys,
  fixtureRoleViewports,
  formatFixtureRoleJourneyFailure,
} from "./smoke-fixture-role-journeys-core.mjs";

class FixtureJourneyError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const baseUrl = validateLocalBaseUrl(
  process.env.NESTORY_BASE_URL ?? "http://localhost:3000",
);
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const browser = await chromium.launch({ headless: true });

try {
  for (const journey of fixtureRoleJourneys) {
    const verifiedViewports = await runJourney(browser, journey);
    process.stdout.write(
      `PASS ${journey.email} ${journey.route} (${journey.expectedRecord}) ${verifiedViewports.join(",")}\n`,
    );
  }
} finally {
  await browser.close();
}

async function runJourney(browserInstance, journey) {
  const context = await browserInstance.newContext({
    viewport: fixtureRoleViewports[0],
  });
  const page = await context.newPage();
  let stage = "login";

  try {
    await authenticate(page, journey.email);
    await page.goto(new URL("/workspace", baseUrl).toString(), {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL((url) => url.pathname !== "/workspace", {
      timeout: 20_000,
    });

    stage = "route";
    if (new URL(page.url()).pathname !== journey.route) {
      throw new FixtureJourneyError("route did not load");
    }

    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const finalPath = new URL(page.url()).pathname;
    if (["/login", "/no-access"].includes(finalPath)) {
      throw new FixtureJourneyError("access denied");
    }

    stage = "record";
    const verifiedViewports = [];
    for (const viewport of fixtureRoleViewports) {
      await page.setViewportSize(viewport);
      await assertWorkspaceViewport(page, journey);
      verifiedViewports.push(viewport.name);
    }

    if (journey.expectedAction) {
      stage = "action";
      await assertWorkspaceAction(page, journey.expectedAction);
    }

    return verifiedViewports;
  } catch (error) {
    const reason =
      error instanceof FixtureJourneyError
        ? error.reason
        : stage === "login"
          ? "login did not complete"
          : stage === "action"
            ? "action did not complete"
          : stage === "record"
            ? "record not visible"
            : "route did not load";
    throw new Error(formatFixtureRoleJourneyFailure(journey, reason));
  } finally {
    await context.close();
  }
}

async function assertWorkspaceAction(page, expectedAction) {
  const action = await findVisibleLocator(
    page.getByRole("link", { exact: true, name: expectedAction.label }),
  );
  await Promise.all([
    page.waitForURL(
      (url) => `${url.pathname}${url.search}` === expectedAction.href,
      { timeout: 20_000 },
    ),
    action.click(),
  ]);
  await page
    .getByRole("heading", { exact: true, name: expectedAction.heading })
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function assertWorkspaceViewport(page, journey) {
  try {
    const expectedRecords = journey.expectedRecordParts
      ? journey.expectedRecordParts.reduce(
          (locator, part) => locator.filter({ hasText: part }),
          page.getByRole("row"),
        )
      : page.getByText(journey.expectedRecord, { exact: true });
    const expectedRecord = await findVisibleLocator(expectedRecords);
    await expectedRecord.waitFor({ state: "visible", timeout: 15_000 });

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    if (overflow) {
      throw new Error("horizontal overflow");
    }

    const action = await findVisibleLocator(
      page.locator('main a[href], main button:not([disabled])'),
    );
    await action.waitFor({ state: "visible", timeout: 15_000 });
    await action.focus();
    if (!(await action.evaluate((element) => element === document.activeElement))) {
      throw new Error("first action did not receive focus");
    }
  } catch {
    throw new FixtureJourneyError("record not visible");
  }
}

async function findVisibleLocator(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) {
      return candidate;
    }
  }

  return locator.first();
}

async function authenticate(page, email) {
  try {
    const response = await page.goto(new URL("/login", baseUrl).toString(), {
      timeout: 30_000,
      waitUntil: "networkidle",
    });
    if (!response?.ok()) {
      throw new FixtureJourneyError("login did not complete");
    }
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 }),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  } catch {
    throw new FixtureJourneyError("login did not complete");
  }
}
