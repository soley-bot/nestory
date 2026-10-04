import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../src/components/ui/card";
import { FormSection } from "../src/components/ui/form-section";
import { PageHeader } from "../src/components/layout/page-header";

async function main() {
  const phase = process.argv[2] ?? "after";
  const out = `output/playwright/shared-spacing/${phase}`;
  mkdirSync(out, { recursive: true });
  const css = await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const longName = "North Riverside Residential Property Management and Maintenance Partnership";
  const html = renderToStaticMarkup(<main>
    <PageHeader title={longName} description="Property, finance, maintenance and settings — controlled synthetic compositions" help={false} actions={<button className="rounded-md border px-3 py-2">Create maintenance request</button>} />
    <div className="workspace-gutter-x grid gap-4 pb-6 md:grid-cols-2">
      {["Property", "Finance", "Maintenance", "Settings"].map((name, i) => <Card key={name}>
        <CardHeader><CardTitle>{name}: {longName}</CardTitle><CardDescription>Review the details and keep all critical information available.</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <FormSection title="Record details" step="1" description="A long message explaining the context and the next action without omitting important information.">
            <label className="grid gap-2">Name<input className="min-w-0 w-full rounded-md border p-2" defaultValue={longName} /></label>
            <p className="leading-6">{longName} — service and payment details remain fully readable in the content area.</p>
          </FormSection>
          <FormSection title="Related information" step="2">
            {i === 0 ? <p className="rounded-md bg-muted p-3">No related records yet. Add a record to get started.</p> : i === 1 ? <div><p className="border-b py-2">Rent balance: £1,234,567.89</p><p className="border-b py-2">Invoice reference: FIN-2026-1004-001</p></div> : i === 2 ? <p role="alert" className="rounded-md border border-destructive bg-danger-soft p-3">Unable to load maintenance history. Your draft remains available; retry loading the records.</p> : <p aria-busy="true" className="rounded-md bg-muted p-3">Loading organization settings…</p>}
          </FormSection>
          <Card size="sm"><CardContent>Nested supporting panel: assigned team and contact details.</CardContent></Card>
        </CardContent>
        <CardFooter><button className="rounded-md border bg-background px-3 py-2">Save changes</button></CardFooter>
      </Card>)}
    </div>
  </main>);
  const htmlDocument = process.argv.includes("--reuse") ? readFileSync(`${out}/fixture.html`, "utf8") : `<!doctype html><html><head><meta charset="utf-8"><style>${css.css}</style></head><body style="font-family:Arial,sans-serif">${html}</body></html>`;
  writeFileSync(`${out}/fixture.html`, htmlDocument);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.setContent(htmlDocument);
    await page.screenshot({ path: `${out}/${width}.png`, fullPage: true });
    results.push({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    if (width === 768) {
      await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      await page.screenshot({ path: `${out}/768-zoom200.png`, fullPage: true });
      results.push({ width, zoom: 200, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    }
    await page.close();
  }
  await browser.close();
  writeFileSync(`${out}/checks.json`, JSON.stringify(results, null, 2));
  console.log(results);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
