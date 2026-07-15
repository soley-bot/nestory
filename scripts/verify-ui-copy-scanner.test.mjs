import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { scanUiCopy } from "./verify-ui-copy-scanner.mjs";

const fixtureRoots = [];
const fixtureRules = {
  prohibitedTutorialNarration: ["Select a row to", "Double-click to"],
  publicMarketingExclusions: ["src/features/marketing/"],
};

async function createFixture(files) {
  const projectRoot = await mkdtemp(join(tmpdir(), "nestory-ui-copy-"));
  fixtureRoots.push(projectRoot);

  await Promise.all(
    ["src/app", "src/components", "src/features"].map((sourceRoot) =>
      mkdir(join(projectRoot, ...sourceRoot.split("/")), { recursive: true }),
    ),
  );

  for (const [projectPath, content] of Object.entries(files)) {
    const filePath = join(projectRoot, ...projectPath.split("/"));
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((fixtureRoot) =>
      rm(fixtureRoot, { force: true, recursive: true }),
    ),
  );
});

describe("UI copy scanner", () => {
  it("scans only the three UI source roots and supported source files", async () => {
    const projectRoot = await createFixture({
      "scripts/outside.mjs": "Select a row to inspect.",
      "src/app/page.tsx": "Select a row to inspect.",
      "src/app/readme.md": "Select a row to inspect.",
      "src/components/table.ts": "Select a row to inspect.",
      "src/features/units/screen.jsx": "Select a row to inspect.",
      "src/lib/outside.ts": "Select a row to inspect.",
    });

    const findings = await scanUiCopy({ projectRoot, rules: fixtureRules });

    expect(findings.map(({ projectPath }) => projectPath)).toEqual([
      "src/app/page.tsx",
      "src/components/table.ts",
      "src/features/units/screen.jsx",
    ]);
  });

  it("excludes only the configured marketing boundary", async () => {
    const projectRoot = await createFixture({
      "src/features/marketing-tools/screen.tsx": "Select a row to inspect.",
      "src/features/marketing/landing.tsx": "Select a row to inspect.",
    });

    const findings = await scanUiCopy({ projectRoot, rules: fixtureRules });

    expect(findings.map(({ projectPath }) => projectPath)).toEqual([
      "src/features/marketing-tools/screen.tsx",
    ]);
  });

  it("returns stable case-insensitive file and line evidence", async () => {
    const projectRoot = await createFixture({
      "src/features/zeta/screen.tsx": [
        "const heading = 'Units';",
        "  select A ROW to inspect. DOUBLE-CLICK TO open.  ",
      ].join("\n"),
      "src/app/alpha/page.tsx": [
        "export default function Page() {",
        "  return null;",
        "  // Select a row to inspect.",
        "}",
      ].join("\n"),
    });

    await expect(
      scanUiCopy({ projectRoot, rules: fixtureRules }),
    ).resolves.toEqual([
      {
        line: "// Select a row to inspect.",
        lineNumber: 3,
        phrase: "Select a row to",
        projectPath: "src/app/alpha/page.tsx",
      },
      {
        line: "select A ROW to inspect. DOUBLE-CLICK TO open.",
        lineNumber: 2,
        phrase: "Select a row to",
        projectPath: "src/features/zeta/screen.tsx",
      },
      {
        line: "select A ROW to inspect. DOUBLE-CLICK TO open.",
        lineNumber: 2,
        phrase: "Double-click to",
        projectPath: "src/features/zeta/screen.tsx",
      },
    ]);
  });
});
