import { describe, expect, it } from "vitest";
import { activityPeriodError } from "./activity-period";
describe("account activity date recovery", () => {
  it("accepts an inclusive leap year and rejects longer ranges", () => {
    expect(activityPeriodError("2024-01-01", "2024-12-31")).toBeNull();
    expect(activityPeriodError("2024-01-01", "2025-01-01")).toContain("366");
  });
  it("explains inverted and impossible dates", () => {
    expect(activityPeriodError("2026-11-30", "2026-11-01")).toContain("on or before");
    expect(activityPeriodError("2026-02-30", "2026-03-01")).toContain("valid");
  });
});
