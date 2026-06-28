import { describe, expect, it } from "vitest";
import {
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  getUuidSearchParam,
} from "@/lib/validation/search-params";

describe("getUuidSearchParam", () => {
  it("accepts a valid UUID string", () => {
    expect(
      getUuidSearchParam("019ed022-93f8-7f10-9896-bd6fee371bb0"),
    ).toBe("019ed022-93f8-7f10-9896-bd6fee371bb0");
  });

  it("uses the first value when Next passes an array", () => {
    expect(
      getUuidSearchParam([
        "019ed022-93f8-7f10-9896-bd6fee371bb0",
        "not-a-uuid",
      ]),
    ).toBe("019ed022-93f8-7f10-9896-bd6fee371bb0");
  });

  it("rejects invalid values", () => {
    expect(getUuidSearchParam("javascript:alert(1)")).toBeUndefined();
  });

  it("normalizes common filter values", () => {
    expect(getUuidOrAllSearchParam("not-a-uuid")).toBe("all");
    expect(getPositiveIntegerSearchParam("0", 50)).toBe(50);
    expect(getTrimmedSearchParam("  Central   ")).toBe("Central");
  });
});
