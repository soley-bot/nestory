import { describe, expect, it } from "vitest";
import { recordDisplayLabel } from "./record-label";

describe("recordDisplayLabel", () => {
  it.each([undefined, null, "", "  ", "00000000-0000-4000-8000-000000000001"])("uses a contextual fallback for unavailable name %s", (value) => {
    expect(recordDisplayLabel(value, "Property unavailable")).toBe("Property unavailable");
  });
  it("retains full names and human-readable business references", () => {
    const name = "Long property name ".repeat(15).trim();
    expect(recordDisplayLabel(name, "Property unavailable")).toBe(name);
    expect(recordDisplayLabel(" INV-2026-0123 ", "Unavailable")).toBe("INV-2026-0123");
  });
});
