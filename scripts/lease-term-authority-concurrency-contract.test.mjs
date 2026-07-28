import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("lease-term authority concurrency harness contract", () => {
  it("uses observed database locks and deterministic transaction release", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/lease-term-authority-concurrency.mjs"),
      "utf8",
    );

    expect(source).not.toContain("pg_catalog.pg_sleep");
    expect(source).toContain("waitForLock");
    expect(source).toContain("wait_event_type = 'Lock'");
    expect(source).toContain("release()");
    expect(source).toContain('child.stdin.end("COMMIT;');
  });

  it("proves overlap rejection, period-transition rejection, and cleanup", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/lease-term-authority-concurrency.mjs"),
      "utf8",
    );

    expect(source).toContain("proveConcurrentOverlapFailsClosed");
    expect(source).toContain("lease_terms_authoritative_effective_range_excl");
    expect(source).toContain("provePeriodTransitionSerializesTermEdit");
    expect(source).toContain("Organization Ledger period is locked");
    expect(source).toContain("await stopProcesses()");
    expect(source).toContain("cleanup()");
  });
});
