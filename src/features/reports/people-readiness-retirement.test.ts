import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const manifestPath = "config/ui-route-coverage.json";
const allowedCompatibilityFiles = new Set([
  "src/app/(dashboard)/people-reports/page.test.tsx",
  "src/app/(dashboard)/people-reports/page.tsx",
  "src/features/reports/people-readiness-retirement.test.ts",
]);

describe("People Reports retirement", () => {
  it("leaves no stale People Reports route or dedicated API references", () => {
    const activeFiles = [
      ...walkSource(sourceRoot),
      "README.md",
      "docs/current-state.md",
      "docs/engineering-rules.md",
      "docs/verification.md",
    ];
    const stale = activeFiles.flatMap((file) => {
      const normalized = file.replaceAll("\\", "/");
      if (allowedCompatibilityFiles.has(normalized)) {
        return [];
      }

      const body = readFileSync(join(process.cwd(), file), "utf8");
      return body.includes("/people-reports") ||
        body.includes("api/people-reports") ||
        body.includes("getPeopleReportExportHref")
        ? [normalized]
        : [];
    });

    expect(stale).toEqual([]);
  });

  it("keeps the old page only as an executable compatibility redirect", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), manifestPath), "utf8"),
    ) as Array<{
      route: string;
      smoke: {
        expectedFinalPath?: string;
        path: string;
        queryContract: string;
      };
      states: string[];
      surface: string;
    }>;

    expect(manifest.find((entry) => entry.route === "/people-reports")).toMatchObject({
      smoke: {
        expectedFinalPath:
          "/reports/people-readiness?peopleView=staff&archiveState=archived",
        path: "/people-reports?report=staff-access&archiveState=archived",
        queryContract: "redirect-preserved",
      },
      states: [],
      surface: "redirect",
    });
  });
});

function walkSource(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkSource(path);
    }

    return [".ts", ".tsx"].includes(extname(entry.name))
      ? [relative(process.cwd(), path)]
      : [];
  });
}
