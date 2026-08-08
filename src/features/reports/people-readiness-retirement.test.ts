import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const manifestPath = "config/ui-route-coverage.json";
const allowedAssertionFiles = new Set([
  "src/features/reports/people-readiness-retirement.test.ts",
]);

describe("People Reports retirement", () => {
  it("leaves no stale People Reports route or dedicated API references", () => {
    const activeFiles = [
      ...walkSource(sourceRoot),
      "PROJECT.md",
    ];
    const stale = activeFiles.flatMap((file) => {
      const normalized = file.replaceAll("\\", "/");
      if (allowedAssertionFiles.has(normalized)) {
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

  it("removes the retired route instead of retaining a redirect", () => {
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

    expect(manifest.find((entry) => entry.route === "/people-reports")).toBeUndefined();
    expect(
      existsSync(
        join(
          process.cwd(),
          "src/app/(dashboard)/people-reports/page.tsx",
        ),
      ),
    ).toBe(false);
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
