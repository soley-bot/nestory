import { chromium } from "playwright";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.NESTORY_BASE_URL ?? "http://localhost:3000";
const email = process.env.NESTORY_TEST_EMAIL ?? "nestory@gmail.com";
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { height: 960, width: 1440 },
});
const photoPath = join(tmpdir(), `nestory-property-smoke-${Date.now()}.png`);
await writeFile(
  photoPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ),
);

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page
      .waitForURL(/\/(overview|setup|no-access|properties)(\?|$)/, {
        timeout: 15_000,
      })
      .catch(() => null),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  await page.goto(`${baseUrl}/properties`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Properties");

  await page.getByRole("button", { name: /filters/i }).click();
  await page.getByText("Filter properties").waitFor();
  await page.getByText("Record state").waitFor();
  await page.getByText("Operational review").waitFor();
  await page.getByText("Table setup").waitFor();
  await page.getByRole("button", { name: /done/i }).click();

  await page.getByTitle("Cards view").click();
  await page.waitForURL(/view=cards/);
  const cardGrid = page.locator('[data-property-record-list="cards"]');
  await cardGrid.getByText("Needs photo").first().waitFor();
  if (await cardGrid.getByText("Occupancy").count()) {
    throw new Error("Property cards should leave occupancy detail to the inspector.");
  }
  if (await cardGrid.getByText("Net").count()) {
    throw new Error("Property cards should leave net income detail to the inspector.");
  }
  const cardGridLayout = await cardGrid.evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      clientHeight: element.clientHeight,
      gridTemplateColumns: style.gridTemplateColumns,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
    };
  });

  if (!["auto", "scroll"].includes(cardGridLayout.overflowY)) {
    throw new Error(
      `Expected card grid to be scrollable, got ${cardGridLayout.overflowY}`,
    );
  }

  if (cardGridLayout.clientHeight < 360) {
    throw new Error(
      `Expected card grid viewport height, got ${cardGridLayout.clientHeight}`,
    );
  }

  if (cardGridLayout.gridTemplateColumns === "none") {
    throw new Error(
      `Expected card grid to render columns, got ${cardGridLayout.gridTemplateColumns}`,
    );
  }

  await renamePropertyCard({
    fromName: "Chroy Changvar River View",
    toName: "Chroy Changvar River View Smoke",
  });
  await renamePropertyCard({
    fromName: "Chroy Changvar River View Smoke",
    toName: "Chroy Changvar River View",
  });

  await page.getByTitle("Table view").click();
  await page.waitForURL((url) => !url.searchParams.has("view"));

  await page.goto(`${baseUrl}/properties?review=missing_photos`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=missing a property photo");

  await page.getByRole("button", { name: /add property/i }).click();
  await page.waitForSelector('form[data-flow-state="idle"]');
  const codeMaxLength = await page.getByLabel("Code").getAttribute("maxlength");
  if (codeMaxLength !== "24") {
    throw new Error(`Expected property code maxlength 24, got ${codeMaxLength}`);
  }
  if (await page.getByText("Saved uppercase and used across imports").count()) {
    throw new Error("Property code helper text should stay out of the drawer.");
  }
  if (await page.getByText("Fallback owner label").count()) {
    throw new Error("Fallback owner label should not be visible in the drawer.");
  }
  await page.getByRole("link", { name: /create owner/i }).waitFor();
  const createOwnerHref = await page
    .getByRole("link", { name: /create owner/i })
    .getAttribute("href");
  if (createOwnerHref !== "/owners?action=create") {
    throw new Error(`Expected create owner href, got ${createOwnerHref}`);
  }
  await page.getByLabel("Current owner link").click();
  const ownerMenuText = await page
    .locator("[data-radix-popper-content-wrapper]")
    .last()
    .innerText();
  if (/BrightLine Electrical|CoolAir Service Cambodia/i.test(ownerMenuText)) {
    throw new Error("Owner dropdown should not include vendor records.");
  }
  await page.keyboard.press("Enter");
  await page.getByText("Property photo", { exact: true }).waitFor();
  const photoInputAccept = await page
    .locator('input[name="photo"]')
    .getAttribute("accept");
  if (!photoInputAccept?.includes("image/jpeg")) {
    throw new Error(`Expected property photo input, got ${photoInputAccept}`);
  }
  const documentInputCount = await page.locator('input[name="document"]').count();
  if (documentInputCount !== 0) {
    throw new Error("Property drawer should not upload photos through document input.");
  }
  await page.locator('input[name="photo"]').setInputFiles(photoPath);
  await page.getByRole("button", { name: /change photo/i }).waitFor();
  await page.getByRole("button", { name: /cancel upload/i }).click();
  const previewButtonCount = await page
    .getByRole("button", { name: /change photo/i })
    .count();
  if (previewButtonCount !== 0) {
    throw new Error("Cancel upload should clear the selected photo preview.");
  }
  await page.keyboard.press("Escape");

  const rowActionCount = await page
    .getByRole("button", { name: /open actions for/i })
    .count();
  if (rowActionCount !== 0) {
    throw new Error("Property records should keep mutations in the inspector.");
  }

  await page.getByRole("button", { name: /^archive /i }).first().click();
  await page.waitForSelector('form[data-flow-state="blocked"]');
  const archiveDisabled = await page
    .getByRole("button", { name: /^Archive property$/ })
    .isDisabled();
  if (!archiveDisabled) {
    throw new Error("Archive should be disabled while active units exist.");
  }
  await page.getByRole("link", { name: /review active units/i }).waitFor();

  const closeButtonCount = await page
    .getByRole("button", { name: /^Close drawer$/ })
    .count();
  if (closeButtonCount !== 1) {
    throw new Error(`Expected one visible close drawer button, found ${closeButtonCount}`);
  }

  console.log("Properties flow smoke passed.");
} finally {
  await rm(photoPath, { force: true });
  await browser.close();
}

async function renamePropertyCard({ fromName, toName }) {
  const card = page.locator("article").filter({ hasText: fromName }).first();
  await card.waitFor();
  await card
    .getByRole("button", {
      name: new RegExp(`Preview ${escapeRegExp(fromName)}`),
    })
    .click();
  await page
    .getByRole("button", {
      name: new RegExp(`Edit ${escapeRegExp(fromName)}`),
    })
    .click();

  const drawer = page.getByRole("dialog", { name: "Edit property" });
  await drawer.waitFor();
  await drawer.getByLabel("Property name").fill(toName);
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await drawer.waitFor({ state: "hidden" });
  await page.getByText("Property updated.").waitFor();
  await page.locator("article").filter({ hasText: toName }).first().waitFor();
}
