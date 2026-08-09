import { chromium } from "playwright";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";
import {
  fixtureRoleJourneys,
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
    await runJourney(browser, journey);
    process.stdout.write(
      `PASS ${journey.email} ${journey.route} (${journey.expectedRecord})\n`,
    );
  }
} finally {
  await browser.close();
}

async function runJourney(browserInstance, journey) {
  const context = await browserInstance.newContext({
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  let stage = "login";

  try {
    await authenticate(page, journey.email);
    stage = "route";

    const response = await page.goto(new URL(journey.route, baseUrl).toString(), {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok()) {
      throw new FixtureJourneyError("route did not load");
    }

    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const finalPath = new URL(page.url()).pathname;
    if (["/login", "/no-access"].includes(finalPath)) {
      throw new FixtureJourneyError("access denied");
    }

    stage = "record";
    try {
      const expectedRecord = journey.expectedRecordParts
        ? journey.expectedRecordParts.reduce(
            (locator, part) => locator.filter({ hasText: part }),
            page.getByRole("row"),
          )
        : page.getByText(journey.expectedRecord, { exact: true });
      await expectedRecord.first().waitFor({
        state: "visible",
        timeout: 15_000,
      });
    } catch {
      throw new FixtureJourneyError("record not visible");
    }
  } catch (error) {
    const reason =
      error instanceof FixtureJourneyError
        ? error.reason
        : stage === "login"
          ? "login did not complete"
          : stage === "record"
            ? "record not visible"
            : "route did not load";
    throw new Error(formatFixtureRoleJourneyFailure(journey, reason));
  } finally {
    await context.close();
  }
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
