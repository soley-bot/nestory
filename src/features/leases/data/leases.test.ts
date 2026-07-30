import { describe, expect, it } from "vitest";
import {
  getCalendarDateInTimeZone,
  getEffectiveRentPolicyCalendarDate,
} from "@/features/leases/data/leases";

describe("lease data dates", () => {
  it("resolves readiness against the policy timezone instead of UTC", () => {
    expect(
      getCalendarDateInTimeZone(
        new Date("2026-07-31T18:30:00.000Z"),
        "Asia/Bangkok",
      ),
    ).toBe("2026-08-01");
  });

  it("does not activate a future policy using the future policy timezone", () => {
    const policies = [
      {
        effective_from: "2026-01-01",
        rent_calculation_timezone: "America/New_York",
        version_number: 1,
      },
      {
        effective_from: "2026-08-01",
        rent_calculation_timezone: "Asia/Bangkok",
        version_number: 2,
      },
    ];

    expect(
      getEffectiveRentPolicyCalendarDate(
        policies,
        new Date("2026-07-31T18:30:00.000Z"),
      ),
    ).toBe("2026-07-31");
    expect(
      getEffectiveRentPolicyCalendarDate(
        policies,
        new Date("2026-08-01T04:30:00.000Z"),
      ),
    ).toBe("2026-08-01");
  });

  it("uses UTC until the first approved policy is effective", () => {
    expect(
      getEffectiveRentPolicyCalendarDate(
        [
          {
            effective_from: "2026-08-02",
            rent_calculation_timezone: "Asia/Bangkok",
            version_number: 1,
          },
        ],
        new Date("2026-08-01T23:30:00.000Z"),
      ),
    ).toBe("2026-08-01");
  });
});
