import { describe, expect, it } from "vitest";
import { expiredRentTermEndDate } from "./expired-rent-term";

const prior = { start_date: "2026-01-01", end_date: "2026-09-30" };
const classify = (terms: { start_date: string; end_date: string }[], month = "2026-10-01", code = "billing_setup_missing") =>
  expiredRentTermEndDate(code, month, terms);

describe("expired rent exception guidance", () => {
  it("identifies the latest prior term without asserting rent is due", () => {
    expect(classify([{ start_date: "2025-01-01", end_date: "2025-12-31" }, prior])).toBe("2026-09-30");
  });
  it("does not reclassify missing initial configuration or unrelated failures", () => {
    expect(classify([])).toBeUndefined();
    expect(classify([prior], "2026-10-01", "billing_recipient_invalid")).toBeUndefined();
  });
  it("retains historical recovery within a recorded term regardless of today's date", () => {
    expect(classify([prior], "2026-09-01")).toBeUndefined();
  });
  it.each(["2026-10-01", "2026-10-15", "2026-10-31"])("retains generation when a renewal starts %s", start_date => {
    expect(classify([prior, { start_date, end_date: "2027-09-30" }])).toBeUndefined();
  });
  it("treats term end on the first day as inclusive", () => {
    expect(classify([{ ...prior, end_date: "2026-10-01" }])).toBeUndefined();
  });
  it("does not let a later renewal conceal a historical uncovered month", () => {
    expect(classify([prior, { start_date: "2026-11-01", end_date: "2027-10-31" }])).toBe("2026-09-30");
  });
  it("does not describe a future-only lease as expired", () => {
    expect(classify([{ start_date: "2026-11-01", end_date: "2027-10-31" }])).toBeUndefined();
  });
  it("handles leap-year month boundaries", () => {
    expect(classify([{ start_date: "2024-02-29", end_date: "2024-03-31" }], "2024-02-01")).toBeUndefined();
  });
  it("leaves incomplete or malformed evidence unclassified", () => {
    expect(classify([{ ...prior, end_date: "2026-02-30" }])).toBeUndefined();
    expect(classify([{ start_date: "2026-09-30", end_date: "2026-01-01" }])).toBeUndefined();
    expect(classify([prior], "2026-13-01")).toBeUndefined();
    expect(classify([prior], "2026-10-15")).toBeUndefined();
  });
});
