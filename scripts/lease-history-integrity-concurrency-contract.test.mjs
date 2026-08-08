import { describe, expect, it } from "vitest";
import {
  assertActiveTenantRoleFixture,
  evaluateArchiveAttempt,
  evaluateCreateAgainstArchivedPerson,
  evaluateUnrelatedArchive,
} from "./lease-history-integrity-concurrency.mjs";

describe("lease-history integrity concurrency result contract", () => {
  it("requires an active, unarchived Tenant role before the mutation race", () => {
    expect(
      assertActiveTenantRoleFixture({
        archived: false,
        role: "tenant",
        status: "active",
      }),
    ).toEqual({ outcome: "eligible" });

    expect(() =>
      assertActiveTenantRoleFixture({
        archived: false,
        role: "tenant",
        status: "inactive",
      }),
    ).toThrow(/active, unarchived Tenant role/);

    expect(() =>
      assertActiveTenantRoleFixture({
        archived: true,
        role: "tenant",
        status: "active",
      }),
    ).toThrow(/active, unarchived Tenant role/);
  });

  it("accepts only the exact relationship-transition rejection", () => {
    expect(
      evaluateArchiveAttempt({
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
      evaluateArchiveAttempt({
        code: 0,
        output: "archive_person\n",
      }),
    ).toThrow(/archive unexpectedly succeeded/);

    expect(() =>
      evaluateArchiveAttempt({
        code: 1,
        output: "ERROR: deadlock detected\n",
      }),
    ).toThrow(/relationship_transition_required/);
  });

  it("requires the unrelated-person control to commit successfully", () => {
    expect(
      evaluateUnrelatedArchive({
        code: 0,
        output: "UNRELATED_PERSON_ARCHIVED\n",
      }),
    ).toEqual({ outcome: "archived" });

    expect(() =>
      evaluateUnrelatedArchive({
        code: 1,
        output: "ERROR: permission denied\n",
      }),
    ).toThrow(/unrelated Person archive failed/);
  });

  it("accepts only the active-Tenant rejection after Person archival", () => {
    expect(
      evaluateCreateAgainstArchivedPerson({
        code: 1,
        output:
          "ERROR: An active Tenant role is required for the primary tenant\n",
      }),
    ).toEqual({
      outcome: "blocked",
      reason: "active_tenant_required",
    });

    expect(
      evaluateCreateAgainstArchivedPerson({
        code: 1,
        output:
          "ERROR: An active Tenant role is required for the exact primary Tenant\n",
      }),
    ).toEqual({
      outcome: "blocked",
      reason: "active_tenant_required",
    });

    expect(() =>
      evaluateCreateAgainstArchivedPerson({
        code: 0,
        output: "create_lease_with_relationships\n",
      }),
    ).toThrow(/Lease creation unexpectedly succeeded/);

    expect(() =>
      evaluateCreateAgainstArchivedPerson({
        code: 1,
        output: "ERROR: deadlock detected\n",
      }),
    ).toThrow(/active Tenant rejection/);
  });
});
