import { describe, expect, it } from "vitest";
import { assertCompleteReportSource } from "./report-source-completeness";

describe("report source completeness", () => {
  it.each([
    { count: null, data: [] },
    { count: 0, data: null },
    { count: -1, data: [] },
    { count: 0.5, data: [] },
    { count: Number.NaN, data: [] },
    { count: 0, data: [{}] },
    { count: 2, data: [{}] },
  ])("rejects an unverifiable or inconsistent snapshot: %j", result => {
    expect(() => assertCompleteReportSource("source", result)).toThrow();
  });

  it("accepts an exactly complete source above the old one-request limit", () => {
    const data = Array.from({ length: 36_000 }, (_, id) => ({ id }));
    expect(() => assertCompleteReportSource("source", { count: data.length, data })).not.toThrow();
  });
});
