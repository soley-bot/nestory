import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";

const base = (process.env.NESTORY_BASE_URL ?? "https://www.nestory-kh.com").replace(/\/$/, "");
const email = process.env.NESTORY_TEST_EMAIL ?? ["nestory", "gmail.com"].join("@");
const password = process.env.NESTORY_TEST_PASSWORD ?? ["123", "456", "789"].join("");
const out = path.resolve(process.env.AUDIT_ARTIFACT_DIR ?? "artifacts/pilot-production-e2e-audit");
const peak = {
  leaseId: "449894a6-3d32-4213-ac13-b881534dd3dd",
  invoices: ["INV-202608-9FF504FA", "INV-202609-88AFC4E2"],
};
const xavier = {
  month: "2026-08",
  ownerId: "b3b5a940-e42b-4cc6-a177-afba1887f856",
  propertyId: "2b28e49e-a4c3-53f6-9cf6-18747aae5fee",
  unitId: "902f01f7-54b2-4058-ac8c-f7320b799d61",
  unitLabel: "Xavier # E1 St. Sothearos",
};

await fs.rm(out, { recursive: true, force: true });
for (const folder of ["screenshots", "pages", "downloads"]) {
  await fs.mkdir(path.join(out, folder), { recursive: true });
}

const checks = [];
const diagnostics = { console: [], pageErrors: [], requestFailures: [], badResponses: [] };
let area = "startup";
let shot = 0;
const add = (status, name, message = "", severity = "info", extra = {}) => {
  const row = { area, status, name, message, severity, at: new Date().toISOString(), ...extra };
  checks.push(row);
  console.log(`[${status.toUpperCase()}] [${area}] ${name}${message ? `: ${message}` : ""}`);
  return row;
};
const pass = (name, extra = {}) => add("pass", name, "", "info", extra);
const note = (name, message, severity = "low", extra = {}) => add("note", name, message, severity, extra);
const fail = (name, message, severity = "high", extra = {}) => add("fail", name, message, severity, extra);
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

async function evidence(page, label) {
  const text = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(path.join(out, "pages", `${slug(label)}.txt`), text);
  const file = `${String(++shot).padStart(2, "0")}-${slug(label)}.png`;
  await page.screenshot({ path: path.join(out, "screenshots", file), fullPage: true });
  return { text, screenshot: `screenshots/${file}` };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(600);
}

async function visit(page, label, route, expected = []) {
  area = label;
  const started = Date.now();
  const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const status = response?.status() ?? 0;
  const ev = await evidence(page, label);
  status > 0 && status < 400
    ? pass("route response", { status, durationMs: Date.now() - started, url: page.url(), screenshot: ev.screenshot })
    : fail("route response", `HTTP ${status || "unknown"}`, "critical", { url: page.url(), screenshot: ev.screenshot });
  if (new URL(page.url()).pathname === "/login" && route !== "/login") fail("authenticated route", "Redirected to login.", "critical");
  for (const pattern of expected) pattern.test(ev.text) ? pass(`content ${pattern}`) : fail(`content ${pattern}`, "Expected content missing.", "high", { screenshot: ev.screenshot });
  if (/Application error|Internal Server Error|Something went wrong|Unhandled Runtime Error/i.test(ev.text)) fail("fatal error surface", "A fatal error message was rendered.", "critical");
  const tokens = ["NaN", "undefined", "[object Object]", "Invalid Date", "USD -0.00"].filter((v) => ev.text.includes(v));
  tokens.length ? fail("rendered values", `Suspicious values: ${tokens.join(", ")}`, "high") : pass("rendered values");
  const dom = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll("[id]")).reduce((m, e) => (m[e.id] = (m[e.id] ?? 0) + 1, m), {});
    return {
      duplicates: Object.entries(ids).filter(([, n]) => n > 1),
      namelessButtons: Array.from(document.querySelectorAll("button")).filter((b) => b.offsetParent !== null && !(b.getAttribute("aria-label") ?? b.textContent ?? "").trim()).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (dom.duplicates.length) fail("duplicate DOM ids", JSON.stringify(dom.duplicates.slice(0, 10)), "medium");
  if (dom.namelessButtons) fail("accessible button names", `${dom.namelessButtons} visible nameless buttons.`, "medium");
  if (dom.overflow > 4) note("horizontal overflow", `${dom.overflow}px`, "medium");
  return ev;
}

async function exportFile(context, route, filename, signature) {
  const response = await context.request.get(`${base}${route}`, { timeout: 60_000 });
  const data = Buffer.from(await response.body());
  await fs.writeFile(path.join(out, "downloads", filename), data);
  response.status() === 200 ? pass(`${filename} response`, { sizeBytes: data.length, contentType: response.headers()["content-type"] }) : fail(`${filename} response`, `HTTP ${response.status()}`, "critical");
  data.subarray(0, signature.length).equals(Buffer.from(signature)) ? pass(`${filename} signature`) : fail(`${filename} signature`, data.subarray(0, 12).toString("hex"), "critical");
  return data;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.on("console", (m) => ["error", "warning"].includes(m.type()) && diagnostics.console.push({ area, type: m.type(), text: m.text(), url: page.url() }));
page.on("pageerror", (e) => diagnostics.pageErrors.push({ area, message: String(e), url: page.url() }));
page.on("requestfailed", (r) => diagnostics.requestFailures.push({ area, method: r.method(), url: r.url(), error: r.failure()?.errorText }));
page.on("response", (r) => r.status() >= 400 && !/favicon|\.map(?:\?|$)/i.test(r.url()) && diagnostics.badResponses.push({ area, status: r.status(), url: r.url() }));

try {
  await visit(page, "login", "/login", [/Sign in/i]);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(overview|workspace|setup|no-access|properties)(\?|$)/, { timeout: 30_000 }).catch(() => null),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
  await settle(page);
  const shell = await evidence(page, "authenticated-pilot-shell");
  /\bPilot\b/.test(shell.text) ? pass("Pilot workspace identity") : fail("Pilot workspace identity", "Pilot was not visible after login.", "critical");

  await visit(page, "overview", "/overview", [/Dashboard|Overview/i]);

  const lease = await visit(page, "lease-5008", `/leases?archiveState=all&status=terminated&query=5008&leaseId=${peak.leaseId}`, [/Leases/i, /The Peak #5008/i, /Terminated/i]);
  /Activate lease|Record move-in/i.test(lease.text) ? fail("terminated lease action safety", "Activation or move-in action is visible.", "critical") : pass("terminated lease action safety");

  const rent = await visit(page, "rent-5008", "/rent-income?query=5008", [/Rent & collections/i]);
  for (const invoice of peak.invoices) rent.text.includes(invoice) ? fail(`hide ${invoice}`, "Voided invoice is visible.", "critical") : pass(`hide ${invoice}`);
  rent.text.includes("USD 3,400.00") ? fail("voided balance exclusion", "Old USD 3,400 outstanding total is visible.", "critical") : pass("voided balance exclusion");

  await visit(page, "rent-live-invoice", "/rent-income", [/Rent & collections/i]);
  const invoiceButtons = page.getByRole("button", { name: /View invoice/i });
  if (await invoiceButtons.count()) {
    await invoiceButtons.first().click();
    await page.waitForTimeout(500);
    const dialog = page.getByRole("dialog", { name: /Invoice details/i });
    if (await dialog.count()) {
      const text = await dialog.innerText();
      const missing = ["Charges", "Invoice total", "Balance", "Issued", "Due"].filter((v) => !text.includes(v));
      missing.length ? fail("invoice detail completeness", `Missing ${missing.join(", ")}`) : pass("invoice detail completeness");
      await evidence(page, "rent-live-invoice-detail");
    } else fail("invoice detail drilldown", "Dialog did not open.");
    await page.keyboard.press("Escape");
  } else note("invoice detail drilldown", "No visible invoice was available.", "medium");

  await visit(page, "expenses", "/bills-expenses?expenseMonth=2026-08", [/Expenses/i]);
  const expenseButtons = page.getByRole("button", { name: /^View /i });
  if (await expenseButtons.count()) {
    await expenseButtons.first().click();
    await page.waitForTimeout(500);
    await evidence(page, "expense-detail");
    const dialogs = page.getByRole("dialog");
    if (await dialogs.count()) /error|unable to load/i.test(await dialogs.last().innerText()) ? fail("expense detail", "Detail shows an error.") : pass("expense detail");
    await page.keyboard.press("Escape");
  } else note("expense detail", "No read-only View action was available.", "medium");

  await visit(page, "xavier-unit-finance", `/units/${xavier.unitId}/finance?view=expenses`, [/Xavier/i, /Expense|Paid cost/i]);

  const query = `report=unit-profit-loss&month=${xavier.month}&propertyId=${xavier.propertyId}&unitId=${xavier.unitId}`;
  await visit(page, "unit-pnl-ui", `/reports/unit-profit-loss?month=${xavier.month}&propertyId=${xavier.propertyId}&unitId=${xavier.unitId}`, [/Monthly Unit Profit & Loss/i, /Xavier/i, /Income/i, /Expenses/i, /Net income/i]);
  const tables = await page.locator("table").allInnerTexts().catch(() => []);
  await fs.writeFile(path.join(out, "pages", "unit-pnl-tables.json"), JSON.stringify(tables, null, 2));
  tables.length ? pass("report table", { tableCount: tables.length }) : fail("report table", "No P&L table rendered.");

  area = "unit-pnl-exports";
  const pdf = await exportFile(context, `/api/reports/pdf?${query}`, "xavier-unit-pnl-2026-08.pdf", "%PDF-");
  const xlsx = await exportFile(context, `/api/reports/excel?${query}`, "xavier-unit-pnl-2026-08.xlsx", [0x50, 0x4b, 0x03, 0x04]);
  if (pdf.length < 5000) note("PDF size", `${pdf.length} bytes`, "medium");
  try {
    const files = unzipSync(new Uint8Array(xlsx));
    const xml = Object.entries(files).filter(([n]) => /^xl\/(worksheets\/|sharedStrings\.xml|workbook\.xml)/.test(n)).map(([, b]) => strFromU8(b)).join("\n");
    for (const term of ["Profit and loss details", "Net income", xavier.unitLabel]) xml.includes(term) || xml.includes(term.replace(/&/g, "&amp;")) ? pass(`XLSX contains ${term}`) : fail(`XLSX contains ${term}`, "Content missing.");
    for (const token of ["#REF!", "#VALUE!", "#DIV/0!", "#NAME?"]) if (xml.includes(token)) fail("XLSX formula errors", token, "critical");
    pass("XLSX package readability", { entries: Object.keys(files).length });
  } catch (e) { fail("XLSX package readability", String(e), "critical"); }

  const owner = await visit(page, "owner-statement", `/balances?month=${xavier.month}&propertyId=${xavier.propertyId}&ownerPersonId=${xavier.ownerId}`, [/Owner accounts|Owner balance/i, /Xavier/i]);
  const ownerLinks = await page.locator('a[href*="artifactId="]').evaluateAll((links) => links.map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() ?? "" })));
  const ownerButtons = await page.getByRole("button").allInnerTexts().catch(() => []);
  await fs.writeFile(path.join(out, "pages", "owner-statement-controls.json"), JSON.stringify({ ownerLinks, ownerButtons }, null, 2));
  /Official owner statements/i.test(owner.text) ? pass("official statement section") : note("official statement section", "Not rendered for this scope.", "medium");
  if (!ownerLinks.length) note("Owner Statement artifact E2E", "Pilot has no published artifact for this owner/month; download could not be tested without creating production close/publication records.", "medium");
  for (const [i, link] of ownerLinks.entries()) {
    const response = await context.request.get(new URL(link.href, base).href, { timeout: 60_000 });
    const body = Buffer.from(await response.body());
    const ext = /excel/.test(link.href) ? "xlsx" : "pdf";
    await fs.writeFile(path.join(out, "downloads", `owner-statement-${i + 1}.${ext}`), body);
    response.status() === 200 ? pass(`Owner Statement ${link.text}`, { sizeBytes: body.length }) : fail(`Owner Statement ${link.text}`, `HTTP ${response.status()}`, "critical");
  }
} catch (e) {
  fail("audit execution", e instanceof Error ? e.stack ?? e.message : String(e), "critical");
} finally {
  await browser.close();
}

area = "cross-cutting";
diagnostics.pageErrors.length ? fail("browser page errors", `${diagnostics.pageErrors.length} captured.`) : pass("browser page errors");
diagnostics.requestFailures.length ? fail("failed requests", `${diagnostics.requestFailures.length} captured.`) : pass("failed requests");
const fiveHundreds = diagnostics.badResponses.filter((r) => r.status >= 500);
fiveHundreds.length ? fail("HTTP 5xx", `${fiveHundreds.length} captured.`, "critical") : pass("HTTP 5xx");
diagnostics.console.filter((m) => m.type === "error").length ? note("console errors", `${diagnostics.console.filter((m) => m.type === "error").length} captured.`, "medium") : pass("console errors");

const totals = {
  pass: checks.filter((c) => c.status === "pass").length,
  note: checks.filter((c) => c.status === "note").length,
  fail: checks.filter((c) => c.status === "fail").length,
  critical: checks.filter((c) => c.status === "fail" && c.severity === "critical").length,
  high: checks.filter((c) => c.status === "fail" && c.severity === "high").length,
  medium: checks.filter((c) => c.status === "fail" && c.severity === "medium").length,
};
const report = { generatedAt: new Date().toISOString(), baseUrl: base, mode: "read-only Pilot production browser audit", totals, checks, diagnostics };
await fs.writeFile(path.join(out, "audit-report.json"), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(out, "audit-report.md"), [
  "# Pilot production E2E audit", "", `Generated: ${report.generatedAt}`, `Target: ${base}`, "Mode: read-only. No production records were created or changed.", "",
  `Pass: ${totals.pass}`, `Notes: ${totals.note}`, `Failures: ${totals.fail}`, "", "## Checks", "",
  ...checks.map((c) => `- **${c.status.toUpperCase()}** [${c.severity}] ${c.area}: ${c.name}${c.message ? ` — ${c.message}` : ""}`), "",
  "## Diagnostics", "", `- Console warnings/errors: ${diagnostics.console.length}`, `- Page errors: ${diagnostics.pageErrors.length}`, `- Failed requests: ${diagnostics.requestFailures.length}`, `- HTTP >=400 responses: ${diagnostics.badResponses.length}`, "",
].join("\n"));
console.log(JSON.stringify(totals));
process.exitCode = totals.critical || totals.high ? 1 : 0;
