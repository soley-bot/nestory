import { describe, expect, it } from "vitest";
import {
  buildLeaseUnitReservations,
  getCalendarDateInTimeZone,
  getEffectiveRentPolicyCalendarDate,
  getLeaseBillingRuleState,
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

describe("lease billing rule dates", () => {
  it("keeps a replaced rule current through its effective end date", () => {
    expect(
      getLeaseBillingRuleState({
        effectiveFrom: "2026-08-23",
        effectiveTo: "2026-08-31",
        readinessDate: "2026-08-23",
        supersededAt: "2026-08-23T02:40:00.000Z",
      }),
    ).toBe("current");

    expect(
      getLeaseBillingRuleState({
        effectiveFrom: "2026-09-01",
        effectiveTo: "2027-08-22",
        readinessDate: "2026-08-23",
        supersededAt: null,
      }),
    ).toBe("scheduled");

    expect(
      getLeaseBillingRuleState({
        effectiveFrom: "2026-08-23",
        effectiveTo: "2026-08-31",
        readinessDate: "2026-09-01",
        supersededAt: "2026-08-23T02:40:00.000Z",
      }),
    ).toBe("historical");
  });
});

describe("lease unit availability", () => {
  it("attaches only unarchived draft, upcoming, and active term reservations", () => {
    const reservations = buildLeaseUnitReservations(
      [
        { archived_at: null, id: "lease-1", unit_id: "unit-1" },
        { archived_at: null, id: "lease-2", unit_id: "unit-1" },
        { archived_at: "2026-08-01", id: "lease-3", unit_id: "unit-1" },
      ],
      [
        { archived_at: null, end_date: "2026-08-31", lease_id: "lease-1", start_date: "2026-08-01", status: "draft" },
        { archived_at: null, end_date: "2026-09-30", lease_id: "lease-2", start_date: "2026-09-01", status: "expired" },
        { archived_at: null, end_date: "2026-10-31", lease_id: "lease-3", start_date: "2026-10-01", status: "active" },
      ],
    );

    expect(reservations.get("unit-1")).toEqual([
      { endDate: "2026-08-31", leaseId: "lease-1", startDate: "2026-08-01" },
    ]);
  });
});
