import { describe, expect, it } from "vitest";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";

const property = {
  code: "CR",
  id: "property-1",
  name: "Central Residence",
};

const unit = {
  floor: "12",
  id: "unit-1",
  property_id: "property-1",
  status: "occupied",
  unit_number: "12A",
};

const lease = {
  archived_at: null,
  deposit_amount: 1200,
  deposit_currency: "USD" as const,
  id: "lease-1",
  lease_end_date: "2027-01-31",
  lease_start_date: "2026-02-01",
  monthly_rent_amount: 850,
  monthly_rent_currency: "USD" as const,
  property_id: "property-1",
  status: "active",
  tenant_name: "Dara Tenant",
  unit_id: "unit-1",
};

describe("buildLeaseSummary", () => {
  it("preserves tenant_name compatibility and formats operational labels", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      unit,
    });

    expect(summary.tenantName).toBe("Dara Tenant");
    expect(summary.partySummary).toBe("Dara Tenant");
    expect(summary.unitLabel).toBe("Unit 12A / Floor 12");
    expect(summary.statusLabel).toBe("Active");
    expect(summary.depositLabel).toBe("USD 1,200.00");
  });

  it("uses legacy lease data when no normalized deposit row exists", () => {
    const summary = buildLeaseSummary({
      lease: {
        ...lease,
        deposit_amount: null,
        deposit_currency: null,
      },
      property,
      unit,
    });

    expect(summary.depositDisplay).toBeUndefined();
    expect(summary.depositLabel).toBe("No deposit recorded");
  });
});
