import { describe, expect, it } from "vitest";
import * as relationshipHarness from "./lease-relationship-concurrency.mjs";

const { evaluateAcceptedRangeRace } = relationshipHarness;

describe("Lease relationship accepted relationship concurrency result contract", () => {
  it("cleans lease billing and category dependents before the organization", () => {
    expect(typeof relationshipHarness.buildCleanupSql).toBe("function");

    const cleanupSql = relationshipHarness.buildCleanupSql();
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

  it("accepts exactly one committed contender and one exclusion rejection", () => {
    expect(
      evaluateAcceptedRangeRace(
        { code: 0, output: "FIRST_COMMITTED\n" },
        {
          code: 1,
          output:
            "ERROR:  23P01: conflicting key value violates exclusion constraint\n",
        },
      ),
    ).toEqual({
      committed: 1,
      rejected: 1,
      sqlstate: "23P01",
    });
  });

  it("rejects two commits, two failures, and unrelated database failures", () => {
    expect(() =>
      evaluateAcceptedRangeRace(
        { code: 0, output: "FIRST_COMMITTED\n" },
        { code: 0, output: "SECOND_COMMITTED\n" },
      ),
    ).toThrow(/exactly one accepted relationship/);

    expect(() =>
      evaluateAcceptedRangeRace(
        { code: 1, output: "ERROR: 23P01: conflict\n" },
        { code: 1, output: "ERROR: 23P01: conflict\n" },
      ),
    ).toThrow(/exactly one accepted relationship/);

    expect(() =>
      evaluateAcceptedRangeRace(
        { code: 0, output: "FIRST_COMMITTED\n" },
        { code: 1, output: "ERROR: 23514: unrelated failure\n" },
      ),
    ).toThrow(/23P01/);
  });
});
