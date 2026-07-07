import { describe, expect, it } from "vitest";
import { buildPostgrestIlikeOrFilters } from "@/lib/query/screen-query";

describe("buildPostgrestIlikeOrFilters", () => {
  it("tokenizes search text into escaped PostgREST ilike groups", () => {
    expect(
      buildPostgrestIlikeOrFilters(
        ["vendor_label", "reference"],
        "  AC_% (June), rent  ",
      ),
    ).toEqual([
      "vendor_label.ilike.%ac\\_%,reference.ilike.%ac\\_%",
      "vendor_label.ilike.%june%,reference.ilike.%june%",
      "vendor_label.ilike.%rent%,reference.ilike.%rent%",
    ]);
  });

  it("returns no filters for blank search text", () => {
    expect(buildPostgrestIlikeOrFilters(["payer_label"], "   ")).toEqual([]);
  });
});
