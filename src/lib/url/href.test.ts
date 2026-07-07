import { describe, expect, it } from "vitest";
import {
  buildHref,
  removeActionSearchParam,
  removeSearchParam,
  removeSearchParams,
} from "./href";

describe("href helpers", () => {
  it("builds compact hrefs from non-empty params", () => {
    expect(
      buildHref("/ledger", {
        entryId: "abc",
        page: undefined,
        propertyId: "",
        unitId: null,
      }),
    ).toBe("/ledger?entryId=abc");
  });

  it("removes one search param and keeps the rest", () => {
    expect(
      removeSearchParam(
        "/properties",
        new URLSearchParams("action=create&view=cards"),
        "action",
      ),
    ).toBe("/properties?view=cards");
  });

  it("removes action search params", () => {
    expect(
      removeActionSearchParam(
        "/units",
        new URLSearchParams("action=create&view=cards"),
      ),
    ).toBe("/units?view=cards");
  });

  it("removes multiple search params and keeps the rest", () => {
    expect(
      removeSearchParams(
        "/documents",
        new URLSearchParams("action=create&category=lease&documentId=abc"),
        ["action", "category"],
      ),
    ).toBe("/documents?documentId=abc");
  });
});
