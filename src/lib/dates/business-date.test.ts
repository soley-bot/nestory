import { describe, expect, it } from "vitest";
import {
  getBusinessDateValue,
  getBusinessMonthValue,
} from "@/lib/dates/business-date";

describe("business date helpers", () => {
  it("uses the Cambodia business day for date and month defaults", () => {
    const utcMonthEnd = new Date("2026-05-31T18:00:00.000Z");

    expect(getBusinessDateValue(utcMonthEnd)).toBe("2026-06-01");
    expect(getBusinessMonthValue(utcMonthEnd)).toBe("2026-06");
  });

  it.each([
    ["2026-12-31T16:59:59.999Z", "Asia/Phnom_Penh", "2026-12-31", "2026-12"],
    ["2026-12-31T17:00:00.000Z", "Asia/Phnom_Penh", "2027-01-01", "2027-01"],
    ["2026-12-31T17:00:00.000Z", "UTC", "2026-12-31", "2026-12"],
    ["2027-01-01T00:00:00.000Z", "UTC", "2027-01-01", "2027-01"],
    ["2028-02-29T17:00:00.000Z", "Asia/Phnom_Penh", "2028-03-01", "2028-03"],
  ])("uses %s in the configured %s timezone", (clock, timeZone, day, month) => {
    expect(getBusinessDateValue(new Date(clock), timeZone)).toBe(day);
    expect(getBusinessMonthValue(new Date(clock), timeZone)).toBe(month);
  });

  it("rejects an invalid configured timezone instead of changing it", () => {
    expect(() => getBusinessDateValue(new Date(), "Unknown/Company")).toThrow(RangeError);
  });
});
