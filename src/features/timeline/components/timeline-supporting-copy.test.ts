import { describe, expect, it } from "vitest";
import {
  getTimelineDrawerDescription,
  getTimelineReviewContext,
} from "@/features/timeline/components/timeline-screen";

describe("Timeline supporting copy", () => {
  it("uses one operational line when an activity source is available", () => {
    expect(
      getTimelineReviewContext({
        hasFocusedEvent: true,
        hasFocusedEventIntent: true,
      }),
    ).toEqual({
      suffix: "Opened from activity history · Archived records included",
    });
  });

  it("adds recovery context only when the source event is unavailable", () => {
    expect(
      getTimelineReviewContext({
        hasFocusedEvent: false,
        hasFocusedEventIntent: true,
      }),
    ).toEqual({
      detail: "The event may be outside the current filters or access scope.",
      suffix: "Source event unavailable",
    });
  });

  it("omits tautological drawer descriptions and preserves audit consequences", () => {
    expect(getTimelineDrawerDescription("create")).toBeUndefined();
    expect(getTimelineDrawerDescription("edit")).toBeUndefined();
    expect(getTimelineDrawerDescription("restore")).toBeUndefined();
    expect(getTimelineDrawerDescription("document")).toBeUndefined();
    expect(getTimelineDrawerDescription("archive")).toContain("audit history");
    expect(getTimelineDrawerDescription("activity")).toContain("activity log");
  });
});
