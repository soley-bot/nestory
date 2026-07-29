import { describe, expect, it } from "vitest";

const harness = await import("./lease-history-integrity-concurrency.mjs").catch(
  () => ({}),
);

describe("lease-history integrity concurrency result contract", () => {
  it("accepts only the exact relationship-transition rejection", () => {
    expect(
      harness.evaluateArchiveAttempt?.({
        code: 1,
        output:
          "ERROR: End the open Lease role first\nDETAIL: relationship_transition_required\n",
      }),
    ).toEqual({
      detail: "relationship_transition_required",
      outcome: "blocked",
    });
  });

  it("rejects a successful archive and an unrelated database failure", () => {
    expect(() =>
      harness.evaluateArchiveAttempt?.({
        code: 0,
        output: "archive_person\n",
      }),
    ).toThrow(/archive unexpectedly succeeded/);

    expect(() =>
      harness.evaluateArchiveAttempt?.({
        code: 1,
        output: "ERROR: deadlock detected\n",
      }),
    ).toThrow(/relationship_transition_required/);
  });

  it("requires the unrelated-person control to commit successfully", () => {
    expect(
      harness.evaluateUnrelatedArchive?.({
        code: 0,
        output: "UNRELATED_PERSON_ARCHIVED\n",
      }),
    ).toEqual({ outcome: "archived" });

    expect(() =>
      harness.evaluateUnrelatedArchive?.({
        code: 1,
        output: "ERROR: permission denied\n",
      }),
    ).toThrow(/unrelated Person archive failed/);
  });

  it("accepts only the active-Tenant rejection after Person archival", () => {
    expect(
      harness.evaluateCreateAgainstArchivedPerson?.({
        code: 1,
        output:
          "ERROR: An active Tenant role is required for the primary tenant\n",
      }),
    ).toEqual({
      outcome: "blocked",
      reason: "active_tenant_required",
    });

    expect(() =>
      harness.evaluateCreateAgainstArchivedPerson?.({
        code: 0,
        output: "create_lease_with_authoritative_term\n",
      }),
    ).toThrow(/Lease creation unexpectedly succeeded/);

    expect(() =>
      harness.evaluateCreateAgainstArchivedPerson?.({
        code: 1,
        output: "ERROR: deadlock detected\n",
      }),
    ).toThrow(/active Tenant rejection/);
  });
});
