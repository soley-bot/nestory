import { describe, expect, it } from "vitest";
import { parseActivitySearchParams } from "@/features/activity/data/activity";

describe("parseActivitySearchParams", () => {
  it("normalizes activity filters and ignores invalid page values", () => {
    expect(
      parseActivitySearchParams({
        action: "Unit Created",
        entityType: "timeline-event",
        page: "0",
      }),
    ).toEqual({
      action: "unit_created",
      entityType: "timeline_event",
      page: 1,
    });
  });
});
