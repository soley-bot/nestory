import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { chromium } from "playwright";

import {
  buildComparisonHtml,
  validateComparisonFixture,
} from "./unit-profit-loss-comparison-core.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const fixturePath = path.join(
  scriptsDirectory,
  "fixtures",
  "unit-09a-july-2026-profit-loss.json",
);
const logoPath = path.join(
  scriptsDirectory,
  "fixtures",
  "ips-cambodia-logo.png",
);
const IPS_LOGO_SHA256 =
  "ef89b036df79f2a1742371b94b156983f0c00d544ce6347a45786424e759dfee";

export const OUTPUT_FILENAMES = {
  landscape: "IPS-Unit-09A-Profit-Loss-July-2026-Landscape.pdf",
  portrait: "IPS-Unit-09A-Profit-Loss-July-2026-Portrait.pdf",
};

export function parseComparisonArgs(args) {
  if (args.length === 0) {
    return { outputDir: "output/pdf" };
  }
  if (args.length === 2 && args[0] === "--output-dir" && args[1]) {
    return { outputDir: args[1] };
  }
  throw new Error(
    "Usage: npm run report:unit-profit-loss:compare -- [--output-dir PATH]",
  );
}

export async function main(args = process.argv.slice(2)) {
  const { outputDir } = parseComparisonArgs(args);
  const resolvedOutputDir = path.resolve(repositoryRoot, outputDir);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const logo = await readFile(logoPath);
  const logoHash = createHash("sha256").update(logo).digest("hex");

  if (logoHash !== IPS_LOGO_SHA256) {
    throw new Error(
      `IPS logo checksum ${logoHash} does not match ${IPS_LOGO_SHA256}.`,
    );
  }
  validateComparisonFixture(fixture);

  const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
  await mkdir(resolvedOutputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const orientation of ["portrait", "landscape"]) {
      const page = await browser.newPage();
      try {
        const html = buildComparisonHtml({
          fixture,
          logoDataUrl,
          orientation,
        });
        await page.setContent(html, { waitUntil: "load" });
        await page.emulateMedia({ media: "print" });
        await page.pdf({
          displayHeaderFooter: false,
          landscape: orientation === "landscape",
          path: path.join(resolvedOutputDir, OUTPUT_FILENAMES[orientation]),
          preferCSSPageSize: true,
          printBackground: true,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const orientation of ["portrait", "landscape"]) {
    console.log(path.join(resolvedOutputDir, OUTPUT_FILENAMES[orientation]));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
