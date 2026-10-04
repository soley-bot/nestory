import { chromium } from "playwright";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePropertiesFlowConfig } from "./smoke-properties-flow-policy.mjs";

const { baseUrl, email, password } = resolvePropertiesFlowConfig();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { height: 900, width: 1440 },
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

  // Old bookmarks keep their context but render the single responsive list.
  const registerUrl = `${baseUrl}/properties?view=cards`;
  await page.goto(registerUrl, { waitUntil: "networkidle" });
  const propertyTable = page.getByRole("region", { name: "Properties table", exact: true });
  await propertyTable.waitFor();
  if (await page.getByTitle(/^(Cards|Table) view$/).count()) {
    throw new Error("Properties must expose one list without display-mode controls.");
  }
  if (await page.locator('[data-property-record-list="cards"]').count()) {
    throw new Error("Legacy Cards bookmarks must not render a card grid.");
  }
  for (const name of ["Owner", "Occupancy", "Leases"]) {
    await propertyTable.getByRole("columnheader", { name, exact: true }).waitFor();
  }
  await propertyTable.getByRole("button", { name: "Sort properties by net", exact: true }).waitFor();
  await propertyTable.getByRole("button", { name: "Sort properties by status", exact: true }).waitFor();
  const listLayout = await propertyTable.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowY: getComputedStyle(element.closest('[data-slot="register-table-frame"]')).overflowY,
    pageOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
  if (listLayout.pageOverflow || listLayout.scrollWidth > listLayout.clientWidth) {
    throw new Error("Laptop property identity, amounts and actions must fit without horizontal scrolling.");
  }
  if (listLayout.overflowY !== "visible") {
    throw new Error(`Expected the register to defer vertical scrolling to the workspace, got ${listLayout.overflowY}`);
  }

  const workspaceOverflowY = await page
    .locator('[data-slot="app-shell-content"]')
    .evaluate((element) => window.getComputedStyle(element).overflowY);
  if (!["auto", "scroll"].includes(workspaceOverflowY)) {
    throw new Error(
      `Expected the workspace to own vertical scrolling, got ${workspaceOverflowY}`,
    );
  }

  const firstPropertyRow = propertyTable.getByRole("row", { name: /^Open / }).first();
  const firstPropertyLabel = await firstPropertyRow
    .getAttribute("aria-label");
  const firstPropertyName = firstPropertyLabel?.replace(/^Open /, "");
  if (!firstPropertyName) {
    throw new Error("Expected a property row with an accessible record name.");
  }
  const firstPropertyHref = await firstPropertyRow.getByRole("link", { name: firstPropertyName, exact: true }).getAttribute("href");
  if (!firstPropertyHref || !/^\/properties\/[^/?#]+$/.test(firstPropertyHref)) {
    throw new Error("Expected a native link to the property's full record.");
  }
  const temporaryPropertyName = `${firstPropertyName} Smoke`;
  await renamePropertyRecord({
    fromName: firstPropertyName,
    toName: temporaryPropertyName,
    registerUrl,
    expectedHref: firstPropertyHref,
  });
  await renamePropertyRecord({
    fromName: temporaryPropertyName,
    toName: firstPropertyName,
    registerUrl,
    expectedHref: firstPropertyHref,
  });

  await page.goto(`${baseUrl}/properties?review=missing_photos`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=missing a property photo");

  await page.getByRole("button", { name: /add property/i }).click();
  await page.getByRole("form", { name: "Add property form" }).waitFor();
  const codeMaxLength = await page
    .getByRole("textbox", { name: /Code/ })
    .getAttribute("maxlength");
  if (codeMaxLength !== "24") {
    throw new Error(`Expected property code maxlength 24, got ${codeMaxLength}`);
  }
  if (await page.getByText("Saved uppercase and used across imports").count()) {
    throw new Error("Property code helper text should stay out of the drawer.");
  }
  await page.getByRole("textbox", { name: /Property name/ }).waitFor();
  await page.getByRole("textbox", { name: /Property type/ }).waitFor();
  await page.getByRole("button", { name: "Registered date" }).waitFor();
  if (await page.getByRole("combobox", { name: "Property owner" }).count()) {
    throw new Error("New Property setup should defer owner details to the record.");
  }
  if (await page.getByText("Acquisition date", { exact: true }).count()) {
    throw new Error("New Property setup should defer acquisition details to the record.");
  }
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
  const unsavedGuard = page.getByRole("alertdialog", {
    name: "Unsaved changes",
  });
  await unsavedGuard.waitFor();
  await unsavedGuard
    .getByRole("button", { name: "Discard changes" })
    .click();
  await page
    .getByRole("dialog", { name: "Add property" })
    .waitFor({ state: "hidden" });

  const rowActionCount = await page
    .getByRole("button", { name: /open actions for/i })
    .count();
  if (rowActionCount !== 0) {
    throw new Error("Property list rows should keep mutations in the full record.");
  }

  await page.goto(`${baseUrl}/properties`, { waitUntil: "networkidle" });
  await page.getByRole("row", { name: "Open Central Residence", exact: true }).click();
  await page.waitForURL(/\/properties\/[^/?#]+$/);
  await page.getByRole("heading", { name: "Central Residence", exact: true }).waitFor();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  const archiveDialog = page.getByRole("dialog", { name: "Archive Central Residence?", exact: true });
  await archiveDialog.locator('form[data-flow-state="blocked"]').waitFor();
  const archiveDisabled = await archiveDialog
    .getByRole("button", { name: /^Archive property$/ })
    .isDisabled();
  if (!archiveDisabled) {
    throw new Error("Archive should be disabled while active units exist.");
  }
  await archiveDialog.getByRole("link", { name: /review active units/i }).waitFor();

  const closeButtonCount = await archiveDialog
    .getByRole("button", { name: "Close modal", exact: true })
    .count();
  if (closeButtonCount !== 1) {
    throw new Error(`Expected one visible close modal button, found ${closeButtonCount}`);
  }
  await archiveDialog.getByRole("button", { name: "Close modal", exact: true }).click();
  await archiveDialog.waitFor({ state: "hidden" });

  console.log("Properties flow smoke passed.");
} finally {
  await rm(photoPath, { force: true });
  await browser.close();
}

async function renamePropertyRecord({ fromName, toName, registerUrl, expectedHref }) {
  await page
    .getByRole("row", {
      name: new RegExp(`^Open ${escapeRegExp(fromName)}$`),
    })
    .click();
  await page.waitForURL(new URL(expectedHref, baseUrl).href);
  await page.getByRole("heading", { name: fromName, exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "Edit property" });
  await drawer.waitFor();
  await drawer
    .getByRole("textbox", { name: /Property name/ })
    .fill(toName);
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await drawer.waitFor({ state: "hidden" });
  await page.getByText("Property updated.").waitFor();
  await page.getByRole("heading", { name: toName, exact: true }).waitFor();
  await page.goto(registerUrl, { waitUntil: "networkidle" });
  const renamedRow = page.getByRole("row", { name: `Open ${toName}`, exact: true });
  await renamedRow.waitFor();
  if (await renamedRow.getByRole("link", { name: toName, exact: true }).getAttribute("href") !== expectedHref) {
    throw new Error("Renaming must preserve the record identity and full-detail destination.");
  }
}
