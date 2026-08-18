import { describe, expect, it } from "vitest";
import {
  clearPropertySetupSelectionAfter,
  findOpenLeaseForUnit,
  getSelectableSetupTenants,
  getSetupUnitStatusLabel,
  getHighestPropertySetupStep,
  normalizePropertySetupStep,
  propertySetupRequiresUnit,
  shouldLoadPropertySetupReadiness,
} from "@/features/property-setup/property-setup";
import {
  normalizeRentalSetupReadiness,
  validateSelection,
} from "@/features/property-setup/data/property-setup";

const completeSelection = {
  leaseId: "lease-1",
  ownerId: "owner-1",
  propertyId: "property-1",
  tenantId: "tenant-1",
  unitId: "unit-1",
};

describe("property setup progression", () => {
  it("keeps finance migration and deposit custody out of the rent-start gate", () => {
    const readiness = normalizeRentalSetupReadiness({
      effectiveDate: "2026-08-18",
      items: [
        { code: "owner_roster", label: "Owner roster", ready: false, repairHref: "/property" },
        { code: "lease", label: "Active lease", ready: true, repairHref: "/lease" },
        { code: "opening_balance", label: "Opening balances", ready: false, repairHref: "/balances" },
        { code: "deposit", label: "Deposit handling", ready: false, repairHref: "/lease" },
      ],
      leaseId: "lease-1",
      organizationId: "organization-1",
      propertyId: "property-1",
      ready: false,
      unitId: "unit-1",
    });

    expect(readiness?.items.map((item) => item.code)).toEqual(["owner_roster", "lease"]);
    expect(readiness?.items[0]).toMatchObject({ label: "Property owner", ready: true });
    expect(readiness?.ready).toBe(true);
  });

  it("prevents forward navigation until each authoritative relationship exists", () => {
    expect(
      normalizePropertySetupStep(5, {
        ...completeSelection,
        leaseId: null,
        tenantId: null,
      }),
    ).toBe(3);
    expect(getHighestPropertySetupStep(completeSelection)).toBe(4);
    expect(getHighestPropertySetupStep(completeSelection, { ready: true })).toBe(5);
  });

  it("lets a whole-property setup reach the lease step without a unit", () => {
    const wholePropertySelection = {
      ...completeSelection,
      leaseId: null,
      unitId: null,
    };
    const properties = [
      {
        id: "property-1",
        label: "P1",
        ownerPersonId: "owner-1",
        rentalStructure: "single_space" as const,
      },
    ];

    expect(
      propertySetupRequiresUnit(properties, wholePropertySelection),
    ).toBe(false);
    expect(
      getHighestPropertySetupStep(wholePropertySelection, {
        requiresUnit: false,
      }),
    ).toBe(3);
    expect(
      normalizePropertySetupStep(3, wholePropertySelection, {
        requiresUnit: false,
      }),
    ).toBe(3);
  });

  it("still requires a unit before the lease step on a multi-unit property", () => {
    const properties = [
      {
        id: "property-1",
        label: "P1",
        ownerPersonId: "owner-1",
        rentalStructure: "multi_unit" as const,
      },
    ];
    const selection = { ...completeSelection, leaseId: null, unitId: null };

    expect(propertySetupRequiresUnit(properties, selection)).toBe(true);
    expect(normalizePropertySetupStep(3, selection)).toBe(2);
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

  it("loads readiness for a whole-property Lease without a Unit", () => {
    expect(
      shouldLoadPropertySetupReadiness({
        ...completeSelection,
        unitId: null,
      }),
    ).toBe(true);
    expect(
      shouldLoadPropertySetupReadiness({
        ...completeSelection,
        leaseId: null,
        unitId: null,
      }),
    ).toBe(false);
  });

  it("keeps unavailable tenants out of new lease creation", () => {
    const leases = [
      {
        endDate: "2027-06-30",
        id: "lease-1",
        label: "Existing tenant",
        monthlyRentAmount: 900,
        propertyId: "property-1",
        startDate: "2026-07-01",
        status: "active",
        tenantPersonId: "tenant-1",
        unitId: "unit-1",
      },
    ];
    const tenants = [person("tenant-1", ["tenant"]), person("tenant-2", ["tenant"])];

    expect(
      getSelectableSetupTenants(leases, tenants, {
        ...completeSelection,
        leaseId: null,
        tenantId: null,
        unitId: "unit-2",
      }).map((tenant) => tenant.id),
    ).toEqual(["tenant-2"]);
    expect(
      getSelectableSetupTenants(leases, tenants, {
        ...completeSelection,
        leaseId: null,
        tenantId: null,
      }).map((tenant) => tenant.id),
    ).toEqual(["tenant-1", "tenant-2"]);
  });

  it("labels a unit with an open lease from the lease authority", () => {
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

    expect(getSetupUnitStatusLabel("unit-1", "vacant", [lease])).toBe("open lease");
    expect(getSetupUnitStatusLabel("unit-2", "vacant", [lease])).toBe("vacant");
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
        {
          id: "property-1",
          label: "P1",
          ownerPersonId: "owner-1",
          rentalStructure: "multi_unit",
        },
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
        {
          id: "property-1",
          label: "P1",
          ownerPersonId: "owner-2",
          rentalStructure: "multi_unit",
        },
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
