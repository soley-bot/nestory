import { describe, expect, it } from "vitest";
import { formatCalendarDate } from "@/lib/dates/format";

describe("formatCalendarDate", () => {
  it("preserves a date-only value as a local calendar date", () => {
    expect(formatCalendarDate("2031-04-30")).toBe("30 Apr 2031");
  });
});
