import { describe, expect, it } from "vitest";
import {
  clearPropertySetupSelectionAfter,
  findOpenLeaseForUnit,
  getHighestPropertySetupStep,
  normalizePropertySetupStep,
} from "@/features/property-setup/property-setup";
import { validateSelection } from "@/features/property-setup/data/property-setup";

const completeSelection = {
  leaseId: "lease-1",
  ownerId: "owner-1",
  propertyId: "property-1",
  tenantId: "tenant-1",
  unitId: "unit-1",
};

describe("property setup progression", () => {
  it("prevents forward navigation until each authoritative relationship exists", () => {
    expect(
      normalizePropertySetupStep(5, {
        ...completeSelection,
        leaseId: null,
        tenantId: null,
      }),
    ).toBe(4);
    expect(getHighestPropertySetupStep(completeSelection)).toBe(5);
  });

  it("clears downstream selections when an earlier record changes", () => {
    expect(
      clearPropertySetupSelectionAfter(
        completeSelection,
        "propertyId",
        "property-2",
      ),
    ).toEqual({
      leaseId: null,
      ownerId: "owner-1",
      propertyId: "property-2",
      tenantId: null,
      unitId: null,
    });
  });

  it("finds the existing open lease for the selected unit", () => {
    const lease = {
      endDate: "2027-06-30",
      id: "lease-1",
      label: "Existing tenant",
      monthlyRentAmount: 900,
      propertyId: "property-1",
      startDate: "2026-07-01",
      status: "active",
      tenantPersonId: "tenant-1",
      unitId: "unit-1",
    };

    expect(findOpenLeaseForUnit([lease], completeSelection)).toBe(lease);
    expect(
      findOpenLeaseForUnit([lease], {
        ...completeSelection,
        unitId: "unit-2",
      }),
    ).toBeUndefined();
  });
});

describe("validateSelection", () => {
  it("accepts only organization-loaded records with the required relationships", () => {
    const result = validateSelection({
      leases: [
        {
          endDate: "2027-06-30",
          id: "lease-1",
          label: "Tenant",
          monthlyRentAmount: 900,
          propertyId: "property-1",
          startDate: "2026-07-01",
          status: "active",
          tenantPersonId: "tenant-1",
          unitId: "unit-1",
        },
      ],
      owners: [person("owner-1", ["owner"])],
      properties: [
        { id: "property-1", label: "P1", ownerPersonId: "owner-1" },
      ],
      requestedSelection: completeSelection,
      tenants: [person("tenant-1", ["tenant"])],
      units: [
        {
          id: "unit-1",
          label: "P1 / 1A",
          propertyId: "property-1",
          statusLabel: "occupied",
        },
      ],
    });

    expect(result).toEqual(completeSelection);
  });

  it("drops a cross-relationship property and every dependent selection", () => {
    const result = validateSelection({
      leases: [],
      owners: [person("owner-1", ["owner"])],
      properties: [
        { id: "property-1", label: "P1", ownerPersonId: "owner-2" },
      ],
      requestedSelection: completeSelection,
      tenants: [person("tenant-1", ["tenant"])],
      units: [],
    });

    expect(result).toEqual({
      leaseId: null,
      ownerId: "owner-1",
      propertyId: null,
      tenantId: "tenant-1",
      unitId: null,
    });
  });
});

function person(id: string, roles: Array<"owner" | "tenant">) {
  return {
    archived: false,
    description: roles.join(", "),
    id,
    label: id,
    roles,
  };
}
