import { describe, expect, it } from "vitest";
import { shouldCreateSetupLeaseAsActive } from "@/features/leases/components/lease-form";

describe("LeaseForm setup status", () => {
  it("keeps whole-property setup Leases in draft for the activation step", () => {
    expect(shouldCreateSetupLeaseAsActive(true, "moved_in", "")).toBe(false);
  });

  it("can create a moved-in Unit Lease as active", () => {
    expect(shouldCreateSetupLeaseAsActive(true, "moved_in", "unit-1")).toBe(true);
  });
});
