import type { LeasePropertyOption, LeaseTenantOption, LeaseUnitOption } from "@/features/leases/lease.types";
import type { PersonSelectOption } from "@/features/people/person-select";
import type { PropertyRentalStructure } from "@/features/properties/property-rental-structure";

export type PropertySetupSelection = {
  leaseId: string | null;
  ownerId: string | null;
  propertyId: string | null;
  tenantId: string | null;
  unitId: string | null;
};

export type PropertySetupPropertyOption = LeasePropertyOption & {
  ownerPersonId: string;
  rentalStructure: PropertyRentalStructure;
};

export type PropertySetupUnitOption = LeaseUnitOption & {
  statusLabel: string;
};

export type PropertySetupLeaseOption = {
  endDate: string;
  id: string;
  label: string;
  monthlyRentAmount: number;
  propertyId: string;
  startDate: string;
  status: string;
  tenantPersonId: string;
  unitId: string | null;
};

export type PropertySetupReadinessItem = {
  code: string;
  label: string;
  ready: boolean;
  reason?: string;
  repairHref: string;
};

export type PropertySetupReadiness = {
  effectiveDate: string;
  items: PropertySetupReadinessItem[];
  leaseId: string;
  organizationId: string;
  propertyId: string;
  ready: boolean;
  unitId: string;
};

export type PropertySetupData = {
  leases: PropertySetupLeaseOption[];
  owners: PersonSelectOption[];
  properties: PropertySetupPropertyOption[];
  readiness?: PropertySetupReadiness | null;
  selection: PropertySetupSelection;
  tenants: LeaseTenantOption[];
  units: PropertySetupUnitOption[];
};

export type PropertySetupStep = 1 | 2 | 3 | 4 | 5;
