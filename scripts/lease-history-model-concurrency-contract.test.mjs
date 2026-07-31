import { describe, expect, it } from "vitest";
import { evaluateAcceptedRangeRace } from "./lease-history-model-concurrency.mjs";

describe("TB-02 accepted relationship concurrency result contract", () => {
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
