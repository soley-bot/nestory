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
});
