import { describe, expect, it } from "vitest";
import { formatAuditTimestamp, formatCalendarDate, formatDate } from "@/lib/dates/format";

describe("formatCalendarDate", () => {
  it("preserves a date-only value as a local calendar date", () => {
    expect(formatCalendarDate("2031-04-30")).toBe("30 Apr 2031");
  });

  it.each(["2026-01-01", "2026-12-31", "2028-02-29", "0099-01-01"])("preserves the calendar value %s without interpreting it as UTC", (value) => {
    expect(formatDate(value)).toBe(formatCalendarDate(value));
  });

  it("shows the exact audit time separately in the company's timezone", () => {
    const stamp = "2026-12-31T17:00:02Z";
    expect(formatAuditTimestamp(stamp, "UTC")).toContain("31 Dec 2026, 17:00:02");
    expect(formatAuditTimestamp(stamp, "Asia/Phnom_Penh")).toContain("01 Jan 2027, 00:00:02");
  });

  it("retains the existing localized month labels for date-only displays", () => {
    expect(formatDate("2026-09-01")).toBe("01 Sept 2026");
  });
});
