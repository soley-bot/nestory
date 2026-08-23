import { describe, expect, it } from "vitest";
import {
  getLeaseBillingRuleCalendarDate,
  getLeaseBillingRuleState,
  selectCurrentLeaseBillingRulesByLeaseId,
  selectCurrentLeaseBillingRule,
} from "@/features/leases/lease-billing-rule-state";

const predecessor = {
  archived_at: null,
  effective_from: "2026-01-01",
  effective_to: "2026-08-31",
  id: "predecessor",
  rent_calculation_timezone: "Pacific/Honolulu",
  superseded_at: "2026-08-23T02:40:00.000Z",
};

describe("lease billing rule effective state", () => {
  it("keeps a superseded predecessor current until its own timezone reaches the successor boundary", () => {
    const successor = {
      ...predecessor,
      effective_from: "2026-09-01",
      effective_to: "2027-08-31",
      id: "successor",
      rent_calculation_timezone: "Pacific/Kiritimati",
      superseded_at: null,
    };
    const clock = new Date("2026-09-01T09:30:00.000Z");

    expect(getLeaseBillingRuleCalendarDate([predecessor, successor], clock)).toBe(
      "2026-08-31",
    );
    expect(selectCurrentLeaseBillingRule([successor, predecessor], clock)?.id).toBe(
      "predecessor",
    );
    expect(getLeaseBillingRuleState(predecessor, [successor, predecessor], clock)).toBe(
      "current",
    );
    expect(getLeaseBillingRuleState(successor, [successor, predecessor], clock)).toBe(
      "scheduled",
    );

    const afterBoundary = new Date("2026-09-01T10:30:00.000Z");
    expect(
      getLeaseBillingRuleCalendarDate([predecessor, successor], afterBoundary),
    ).toBe("2026-09-02");
    expect(
      selectCurrentLeaseBillingRule(
        [successor, predecessor],
        afterBoundary,
      )?.id,
    ).toBe("successor");
  });

  it("uses the predecessor timezone for the reverse-direction handoff without a gap", () => {
    const kiritimatiPredecessor = {
      ...predecessor,
      rent_calculation_timezone: "Pacific/Kiritimati",
    };
    const honoluluSuccessor = {
      ...predecessor,
      effective_from: "2026-09-01",
      effective_to: "2027-08-31",
      id: "successor",
      rent_calculation_timezone: "Pacific/Honolulu",
      superseded_at: null,
    };
    const clock = new Date("2026-08-31T10:30:00.000Z");

    expect(
      getLeaseBillingRuleCalendarDate(
        [kiritimatiPredecessor, honoluluSuccessor],
        clock,
      ),
    ).toBe("2026-09-01");
    expect(
      selectCurrentLeaseBillingRule(
        [kiritimatiPredecessor, honoluluSuccessor],
        clock,
      )?.id,
    ).toBe("successor");
  });

  it("ignores archived rows when choosing the current authority", () => {
    const archivedSuccessor = {
      ...predecessor,
      archived_at: "2026-08-25T00:00:00.000Z",
      effective_from: "2026-09-01",
      effective_to: "2027-08-31",
      id: "archived-successor",
      superseded_at: null,
    };

    expect(
      selectCurrentLeaseBillingRule(
        [predecessor, archivedSuccessor],
        new Date("2026-09-01T12:00:00.000Z"),
      )?.id,
    ).toBeUndefined();
  });

  it("returns the still-effective predecessor for each Finance lease", () => {
    const otherLeaseRule = {
      ...predecessor,
      effective_to: "2027-08-31",
      id: "other-current",
      lease_id: "lease-2",
      superseded_at: null,
    };
    const successor = {
      ...predecessor,
      effective_from: "2026-09-01",
      effective_to: "2027-08-31",
      id: "successor",
      lease_id: "lease-1",
      rent_calculation_timezone: "Pacific/Kiritimati",
      superseded_at: null,
    };
    const currentByLeaseId = selectCurrentLeaseBillingRulesByLeaseId(
      [
        { ...predecessor, lease_id: "lease-1" },
        successor,
        otherLeaseRule,
      ],
      new Date("2026-09-01T09:30:00.000Z"),
    );

    expect(currentByLeaseId.get("lease-1")?.id).toBe("predecessor");
    expect(currentByLeaseId.get("lease-2")?.id).toBe("other-current");
  });
});
