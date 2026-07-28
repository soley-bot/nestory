import { describe, expect, it } from "vitest";
import { getCalendarDateInTimeZone } from "@/features/leases/data/leases";

describe("lease data dates", () => {
  it("resolves readiness against the policy timezone instead of UTC", () => {
    expect(
      getCalendarDateInTimeZone(
        new Date("2026-07-31T18:30:00.000Z"),
        "Asia/Bangkok",
      ),
    ).toBe("2026-08-01");
  });
});
