import { describe, expect, it } from "vitest";

import {
  paidCostFixtureDate,
  paidCostLifecycleOriginalDate,
} from "./paid-cost-fixture-periods";

describe("paidCostFixtureDate", () => {
  it("keeps a first-day lookback inside the active fixture month", () => {
    expect(paidCostFixtureDate("2026-09-01", -4)).toBe("2026-09-01");
  });

  it("retains an ordinary lookback inside the active fixture month", () => {
    expect(paidCostFixtureDate("2026-09-24", -4)).toBe("2026-09-20");
  });
});

describe("paidCostLifecycleOriginalDate", () => {
  it("clamps a cross-month lookback to the reversal month start", () => {
    expect(paidCostLifecycleOriginalDate("2026-08-28", "2026-09-01")).toBe(
      "2026-09-01",
    );
  });

  it("retains a lookback that is already inside the reversal month", () => {
    expect(paidCostLifecycleOriginalDate("2026-09-20", "2026-09-24")).toBe(
      "2026-09-20",
    );
  });
});
