import { describe, expect, it } from "vitest";
import * as leaseHistoryHarness from "./lease-history-integrity-concurrency.mjs";

const {
  assertActiveTenantRoleFixture,
  evaluateArchiveAttempt,
  evaluateCreateAgainstArchivedPerson,
  evaluateUnrelatedArchive,
} = leaseHistoryHarness;

describe("lease-history integrity concurrency result contract", () => {
  it("cleans new lease billing and category dependents before the organization", () => {
    expect(typeof leaseHistoryHarness.buildCleanupSql).toBe("function");

    const cleanupSql = leaseHistoryHarness.buildCleanupSql();
    const billingDelete = cleanupSql.indexOf(
      "DELETE FROM public.lease_billing_terms",
    );
    const categoryDelete = cleanupSql.indexOf(
      "DELETE FROM public.finance_categories",
    );
    const organizationDelete = cleanupSql.indexOf(
      "DELETE FROM public.organizations",
    );

    expect(cleanupSql).toContain("SET LOCAL session_replication_role = replica");
    expect(billingDelete).toBeGreaterThan(-1);
    expect(categoryDelete).toBeGreaterThan(billingDelete);
    expect(organizationDelete).toBeGreaterThan(categoryDelete);
  });

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
