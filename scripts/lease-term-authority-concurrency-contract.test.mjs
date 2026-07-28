import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("lease-term authority concurrency harness contract", () => {
  const harnessPath = fileURLToPath(
    new URL("./lease-term-authority-concurrency.mjs", import.meta.url),
  );

  it("uses observed database locks and deterministic transaction release", () => {
    const source = readFileSync(harnessPath, "utf8");

    expect(source).not.toContain("pg_catalog.pg_sleep");
    expect(source).toContain("waitForLock");
    expect(source).toContain("wait_event_type = 'Lock'");
    expect(source).toContain("release()");
    expect(source).toContain('child.stdin.end("COMMIT;');
    expect(source).toContain('child.stdin.on("error"');
  });

  it("proves overlap rejection, period-transition rejection, and cleanup", () => {
    const source = readFileSync(harnessPath, "utf8");

    expect(source).toContain("proveConcurrentOverlapFailsClosed");
    expect(source).toContain("lease_terms_authoritative_effective_range_excl");
    expect(source).toContain("provePeriodTransitionSerializesTermEdit");
    expect(source).toContain("Organization Ledger period is locked");
    expect(source).toContain("await stopProcesses()");
    expect(source).toContain("cleanup()");
    expect(source).toContain("AggregateError");
    expect(source).toContain("timeout: timeoutMs");
  });
});
