import { describe, expect, it } from "vitest";
import {
  buildLeaseRecordHref,
  parseLeaseDetailQuery,
} from "@/features/leases/lease-detail-route";

describe("lease detail route", () => {
  it("defaults invalid or missing sections to overview", () => {
    expect(parseLeaseDetailQuery({})).toEqual({ section: "overview" });
    expect(parseLeaseDetailQuery({ section: "unknown" })).toEqual({
      section: "overview",
    });
  });

  it.each(["overview", "rent", "occupancy", "files"] as const)(
    "accepts the %s record section",
    (section) => {
      expect(parseLeaseDetailQuery({ section })).toEqual({ section });
    },
  );

  it("builds a stable full-record URL", () => {
    expect(
      buildLeaseRecordHref({ leaseId: "lease-1", section: "occupancy" }),
    ).toBe("/leases/lease-1?section=occupancy");
  });
});
