import { describe, expect, it } from "vitest";
import { validateRentIncomeCreateDefaults } from "@/features/rent-income/rent-income-create";

const payerOptions = [
  {
    archived: false,
    description: "Tenant",
    id: "tenant-1",
    label: "Ada Tenant",
    roles: ["tenant" as const],
  },
];
const propertyOptions = [{ id: "property-1", label: "HOME / Home" }];
const unitOptions = [
  { id: "unit-1", label: "HOME / 1A", propertyId: "property-1" },
];
const leaseOptions = [
  {
    currency: "USD" as const,
    id: "lease-1",
    label: "Ada Tenant",
    monthlyRentAmount: 1250,
    propertyId: "property-1",
    tenantName: "Ada Tenant",
    tenantPersonId: "tenant-1",
    unitId: "unit-1",
  },
];

describe("validateRentIncomeCreateDefaults", () => {
  it("uses the lease as the authoritative source for related IDs and rent", () => {
    expect(
      validateRentIncomeCreateDefaults({
        leaseOptions,
        payerOptions,
        propertyOptions,
        request: {
          incomeType: "rent",
          leaseId: "lease-1",
          payerPersonId: "unknown",
          propertyId: "unknown",
          unitId: "unknown",
        },
        unitOptions,
      }),
    ).toEqual({
      amountDue: "1250",
      incomeType: "rent",
      leaseId: "lease-1",
      payerPersonId: "tenant-1",
      propertyId: "property-1",
      unitId: "unit-1",
    });
  });

  it("drops forged or cross-property IDs when no valid lease is selected", () => {
    expect(
      validateRentIncomeCreateDefaults({
        leaseOptions,
        payerOptions,
        propertyOptions,
        request: {
          incomeType: "rent",
          leaseId: "unknown",
          payerPersonId: "unknown",
          propertyId: "property-1",
          unitId: "other-unit",
        },
        unitOptions,
      }),
    ).toMatchObject({
      leaseId: "",
      payerPersonId: "",
      propertyId: "property-1",
      unitId: "",
    });
  });
});
