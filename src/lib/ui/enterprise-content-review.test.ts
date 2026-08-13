import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(resolve("config/ui-route-coverage.json"), "utf8"),
) as Array<{ route: string }>;
const review = JSON.parse(
  readFileSync(resolve("config/enterprise-frontend-content-review.json"), "utf8"),
) as {
  dispositions: string[];
  routes: Array<{
    defaultTechnicalMetadata: string;
    findings: Array<{ disposition: string; issue: string; outcome: string }>;
    result: string;
    route: string;
    safetyCopy: string;
  }>;
};

describe("enterprise route content review", () => {
  it("records exactly one passing manual review for every manifest route", () => {
    expect(review.routes.map((entry) => entry.route).sort()).toEqual(
      manifest.map((entry) => entry.route).sort(),
    );
    expect(new Set(review.routes.map((entry) => entry.route)).size).toBe(47);
    expect(review.routes.every((entry) => entry.result === "pass")).toBe(true);
  });

  it("records an allowed disposition and outcome for every finding", () => {
    const allowed = new Set(review.dispositions);
    const findings = review.routes.flatMap((entry) => entry.findings);

    expect(findings.length).toBeGreaterThan(0);
    expect(
      findings.every(
        (finding) =>
          allowed.has(finding.disposition) &&
          finding.issue.trim().length > 0 &&
          finding.outcome.trim().length > 0,
      ),
    ).toBe(true);
  });

  it("records technical-metadata and safety-copy treatment on every route", () => {
    expect(
      review.routes.every((entry) =>
        ["absent", "disclosed"].includes(entry.defaultTechnicalMetadata),
      ),
    ).toBe(true);
    expect(
      review.routes.every((entry) =>
        ["not-applicable", "preserved"].includes(entry.safetyCopy),
      ),
    ).toBe(true);
  });
});
