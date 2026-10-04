import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const out = `output/playwright/shared-spacing/${process.argv[2] ?? "drawer-after"}`;
mkdirSync(out, { recursive: true });
const bundle = await build({ entryPoints: ["scripts/shared-drawer-preview.tsx"], bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' } });
const css = await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
const browser = await chromium.launch({ headless: true });
const checks = [];
for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    const html = `<!doctype html><html class="${theme === "dark" ? "dark" : ""}" data-theme="${theme}"><head><meta charset="utf-8"><style>${css.css}\n*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body style="font-family:Arial,sans-serif"><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
    writeFileSync(`${out}/${theme}-${width}.html`, html);
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.setContent(html);
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Close drawer" }).focus();
    await page.keyboard.press("Tab");
    await page.screenshot({ path: `${out}/${theme}-${width}-focus.png`, fullPage: true });
    const layout = await page.evaluate(() => ({ focused: document.activeElement?.tagName, overflow: document.documentElement.scrollWidth > innerWidth, overflowingButtons: [...document.querySelectorAll('[data-slot="drawer-footer"] button, [data-slot="card-footer"] button')].filter(el => { const rect = el.getBoundingClientRect(); const parent = el.parentElement.getBoundingClientRect(); return rect.left < parent.left || rect.right > parent.right; }).map(el => el.textContent) }));
    await page.getByRole("button", { name: "Review supporting records and payment information" }).focus();
    await page.keyboard.press("Tab");
    await page.screenshot({ path: `${out}/${theme}-${width}-actions-focus.png`, fullPage: true });
    await page.getByRole("button", { name: "Close drawer" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").waitFor();
    await page.screenshot({ path: `${out}/${theme}-${width}-unsaved.png`, fullPage: true });
    const warningFocused = await page.getByRole("button", { name: "Keep editing" }).evaluate(el => el === document.activeElement);
    await page.keyboard.press("Tab");
    const discardFocused = await page.getByRole("button", { name: "Discard changes" }).evaluate(el => el === document.activeElement);
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    checks.push({ theme, width, ...layout, warningFocused, discardFocused, drawerRetained: await page.getByRole("dialog").isVisible() });
    await page.close();
  }
}
await browser.close();
writeFileSync(`${out}/checks.json`, JSON.stringify(checks, null, 2));
console.log(checks);
