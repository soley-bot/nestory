import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const out = `output/playwright/shared-spacing/${process.argv[2] ?? "register-after"}`;
const stress = process.argv[3] === "stress";
const beforeBase = process.argv[2]?.startsWith("register-responsive-before") ? "8afed5a1aa99f07a79b2bbe9318453acd2196e07" : process.argv[2] === "register-before" ? "e92c05f660b52f79ef0f8475ed1ee3aef770d1d5" : undefined;
mkdirSync(out, { recursive: true });
const baselineFiles = new Set(["src/components/ui/search-combo.tsx", "src/components/ui/filter-popover.tsx", "src/components/ui/table.tsx", "src/components/data/pagination-controls.tsx", "src/components/data/interactive-table.tsx", "src/components/layout/page-breadcrumb.tsx"].map(file => resolve(file)));
const headerSource = beforeBase ? execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "show", `${beforeBase}:src/components/layout/app-shell.tsx`], { encoding: "utf8" }) : readFileSync("src/components/layout/app-shell.tsx", "utf8");
const headerClasses = headerSource.match(/<header className="([^"]+)">\s*<div className="([^"]+)">/);
if (!headerClasses) throw new Error("Shared header class lists not found");
const bundle = await build({ entryPoints: ["scripts/shared-register-preview.tsx"], bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"', __HEADER_CLASS__: JSON.stringify(headerClasses[1]), __HEADER_INNER_CLASS__: JSON.stringify(headerClasses[2]) }, plugins: [{ name: "synthetic-next-navigation", setup(builder) {
  builder.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({ path: resolve("scripts/shared-register-preview-next.tsx") }));
  if (beforeBase) builder.onLoad({ filter: /\.tsx$/ }, args => baselineFiles.has(args.path) ? ({ contents: execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "show", `${beforeBase}:${args.path.slice(process.cwd().length + 1).replaceAll("\\", "/")}`], { encoding: "utf8" }), loader: "tsx", resolveDir: resolve(args.path, "..") }) : undefined);
} }] });
const css = await postcss([tailwind()]).process(`${readFileSync("src/app/globals.css", "utf8")}\n@source inline("${headerClasses[1]} ${headerClasses[2]}");`, { from: "src/app/globals.css" });
const browser = await chromium.launch({ headless: true });
const checks = [];
async function settleScroll(region) {
  await region.evaluate(el => new Promise(done => {
    let last = el.scrollLeft;
    let stableFrames = 0;
    function check() {
      const position = el.scrollLeft;
      stableFrames = Math.abs(position - last) < 0.5 ? stableFrames + 1 : 0;
      last = position;
      if (stableFrames >= 8) done(); else requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }));
}
for (const width of stress ? [390, 1440] : [320, 390, 768, 1440]) {
  const html = `<!doctype html><html data-fixture-mode="${stress ? "stress" : "typical"}" data-fixture-base="${beforeBase ? "before" : "after"}"><head><meta charset="utf-8"><style>${css.css}\n*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body style="font-family:Arial,sans-serif"><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`;
  writeFileSync(`${out}/${width}.html`, html);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(html);
  const search = page.getByRole("combobox", { name: "Search records", exact: true });
  await search.waitFor();
  const breadcrumb = await page.getByRole("navigation", { name: "Breadcrumb" }).evaluate(el => {
    const current = el.querySelector('[aria-current="page"]');
    const header = document.querySelector('[data-fixture="workspace-header"]');
    return { breadcrumbFits: current.scrollWidth <= current.clientWidth, breadcrumbWithinHeader: el.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom, headerHeight: header.getBoundingClientRect().height };
  });
  await page.screenshot({ path: `${out}/${width}-ready.png`, fullPage: true });
  await search.focus();
  await page.keyboard.press("ArrowDown");
  await page.screenshot({ path: `${out}/${width}-search-focus.png`, fullPage: true });
  const activeSuggestion = await search.getAttribute("aria-activedescendant");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Property and finance filters (3)" }).focus();
  await page.keyboard.press("Enter");
  await page.getByText("Filter property and finance records", { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/${width}-filters.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByText("Filter property and finance records", { exact: true }).waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("Property and finance filters"));
  const region = page.getByRole("region", { name: "Property and finance records" });
  if (!beforeBase && width < 768) {
    await page.getByRole("button", { name: "View all columns" }).focus();
    await page.keyboard.press("Enter");
    await page.getByText("More columns — scroll to see the full table").waitFor();
  }
  await page.screenshot({ path: `${out}/${width}-table-left.png`, fullPage: true });
  await region.focus();
  const scrollable = await region.evaluate(el => el.scrollWidth > el.clientWidth);
  await page.keyboard.press("ArrowRight");
  if (scrollable) await page.waitForFunction(() => document.querySelector('[data-slot="table-container"]').scrollLeft > 0);
  await settleScroll(region);
  const keyboardScrolled = scrollable && await region.evaluate(el => el.scrollLeft > 0);
  const lastColumns = page.getByRole("button", { name: "Show last columns of Property and finance records" });
  const controlsAvailable = scrollable && await lastColumns.isVisible();
  if (controlsAvailable) {
    await lastColumns.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => { const el = document.querySelector('[data-slot="table-container"]'); return el.scrollLeft + el.clientWidth >= el.scrollWidth - 1; });
  } else await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await page.screenshot({ path: `${out}/${width}-table-scroll-focus.png`, fullPage: true });
  const measurement = await region.evaluate(el => ({ scrollable: el.scrollWidth > el.clientWidth, scrollLeft: el.scrollLeft, focus: el === document.activeElement }));
  const edgeControlFocused = controlsAvailable && await lastColumns.evaluate(el => el === document.activeElement);
  if (controlsAvailable) {
    await page.getByRole("button", { name: "Show first columns of Property and finance records" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-slot="table-container"]').scrollLeft === 0);
    await settleScroll(region);
    await page.screenshot({ path: `${out}/${width}-table-return-left.png`, fullPage: true });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  for (const state of ["loading", "empty", "error"]) {
    await page.getByRole("button", { name: state, exact: true }).click();
    await page.screenshot({ path: `${out}/${width}-${state}.png`, fullPage: true });
  }
  checks.push({ width, mode: stress ? "stress" : "typical", activeSuggestion: Boolean(activeSuggestion), overflow, keyboardScrolled, controlsAvailable, edgeControlFocused, ...breadcrumb, ...measurement });
  await page.close();
}
await browser.close();
writeFileSync(`${out}/checks.json`, JSON.stringify(checks, null, 2));
console.log(checks);
