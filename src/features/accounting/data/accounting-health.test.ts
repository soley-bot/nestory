import { describe, expect, it } from "vitest";
import { mapAccountingPostingHealth } from "./accounting-health";

describe("mapAccountingPostingHealth", () => {
  it("returns zeroes when database counts are unavailable", () => {
    expect(
      mapAccountingPostingHealth({ linkedCount: null, totalCount: null }),
    ).toEqual({ linkedCount: 0, unlinkedCount: 0 });
  });

  it("derives the unlinked count from total and linked rows", () => {
    expect(
      mapAccountingPostingHealth({ linkedCount: 8, totalCount: 10 }),
    ).toEqual({ linkedCount: 8, unlinkedCount: 2 });
  });

  it("never returns a negative unlinked count", () => {
    expect(
      mapAccountingPostingHealth({ linkedCount: 12, totalCount: 10 }),
    ).toEqual({ linkedCount: 10, unlinkedCount: 0 });
  });
});
