import { describe, expect, it, vi } from "vitest";
import PropertyPage from "./page";
import { getPropertyDetail, getPropertyOwnerOptions } from "@/features/properties/data/properties";
import { getLeaseBillingFormConfig } from "@/features/leases/data/leases";
import { getPersonSelectOptions } from "@/features/people/data/person-options";

vi.mock("@/features/properties/components/property-detail-screen", () => ({ PropertyDetailScreen: () => null }));
vi.mock("@/features/reports/components/report-return-navigation", () => ({ ReportReturnNavigation: () => null }));
vi.mock("@/lib/auth/context", () => ({ requirePermission: async () => ({ organizationId: "org", operationalTimezone: "Asia/Phnom_Penh", permissionKeys: new Set(["properties.view"]) }) }));
vi.mock("@/features/properties/data/properties", () => ({ getPropertyDetail: vi.fn(), getPropertyOwnerOptions: vi.fn() }));
vi.mock("@/features/leases/data/leases", () => ({ getLeaseBillingFormConfig: vi.fn() }));
vi.mock("@/features/people/data/person-options", () => ({ getPersonSelectOptions: vi.fn() }));

describe("property page initial loading", () => {
  it("loads the property without edit or lease directories", async () => {
    vi.mocked(getPropertyDetail).mockResolvedValue({ id: "property" } as never);
    await PropertyPage({ params: Promise.resolve({ propertyId: "property" }) });
    expect(getPropertyDetail).toHaveBeenCalledExactlyOnceWith("org", "property", { operationalTimezone: "Asia/Phnom_Penh" });
    expect(getPropertyOwnerOptions).not.toHaveBeenCalled();
    expect(getPersonSelectOptions).not.toHaveBeenCalled();
    expect(getLeaseBillingFormConfig).not.toHaveBeenCalled();
  });
});
