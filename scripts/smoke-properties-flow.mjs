import { chromium } from "playwright";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.NESTORY_BASE_URL ?? "http://localhost:3000";
const email = process.env.NESTORY_TEST_EMAIL ?? "nestory@gmail.com";
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";

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

  await page.getByTitle("Cards view").click();
  await page.waitForURL(/view=cards/);
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

  await page.getByRole("button", { name: /open actions for/i }).first().click();
  const actionMenuText = await page
    .locator("[data-radix-popper-content-wrapper]")
    .last()
    .innerText();
  if (/upload photo|add photo/i.test(actionMenuText)) {
    throw new Error("Property table action menu should not expose photo upload.");
  }
  await page.keyboard.press("Escape");

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
