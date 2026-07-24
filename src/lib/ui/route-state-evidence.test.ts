import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ManifestEntry = {
  evidence?: Record<string, string[]>;
  route: string;
  source: string;
  states: string[];
};

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/ui-route-coverage.json"), "utf8"),
) as ManifestEntry[];

const sharedEvidence: Record<string, string> = {
  draft: "src/components/ui/workflow-feedback.test.tsx",
  empty: "src/components/ui/empty-state.tsx",
  error: "src/components/ui/error-state.tsx",
  "filtered-empty": "src/components/ui/empty-state.tsx",
  loading: "src/components/layout/module-loading.tsx",
  "permission-blocked": "src/components/ui/status-notice.tsx",
  saving: "src/components/ui/workflow-feedback.test.tsx",
  success: "src/components/ui/status-notice.tsx",
};

describe("route state evidence", () => {
  it("maps every declared state to existing route and shared evidence", () => {
    for (const entry of manifest) {
      expect(Object.keys(entry.evidence ?? {}).sort(), entry.route).toEqual(
        [...entry.states].sort(),
      );

      for (const state of entry.states) {
        const evidence = entry.evidence?.[state] ?? [];
        expect(evidence.length, `${entry.route} ${state}`).toBeGreaterThan(0);
        expect(evidence, `${entry.route} ${state} route meaning`).toContain(
          entry.source,
        );

        if (sharedEvidence[state]) {
          expect(evidence, `${entry.route} ${state} shared presentation`).toContain(
            sharedEvidence[state],
          );
        }

        for (const reference of evidence) {
          const path = reference.split("#", 1)[0];
          expect(existsSync(resolve(process.cwd(), path)), reference).toBe(true);
        }
      }
    }
  });

  it("does not claim zero verification failures when generated route evidence has failed rows", () => {
    const evidence = readFileSync(
      resolve(
        process.cwd(),
        "docs",
        "verification",
        "ui-redesign-evidence.md",
      ),
      "utf8",
    );

    if (evidence.includes("| FAIL |")) {
      expect(evidence).not.toContain(
        "blocked mutations, and query-contract failures: 0.",
      );
    }
  });
});
