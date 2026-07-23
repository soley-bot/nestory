import type { LeasePropertyOption, LeaseTenantOption, LeaseUnitOption } from "@/features/leases/lease.types";
import type { PersonSelectOption } from "@/features/people/person-select";

export type PropertySetupSelection = {
  leaseId: string | null;
  ownerId: string | null;
  propertyId: string | null;
  tenantId: string | null;
  unitId: string | null;
};

export type PropertySetupPropertyOption = LeasePropertyOption & {
  ownerPersonId: string;
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

export type PropertySetupData = {
  leases: PropertySetupLeaseOption[];
  owners: PersonSelectOption[];
  properties: PropertySetupPropertyOption[];
  selection: PropertySetupSelection;
  tenants: LeaseTenantOption[];
  units: PropertySetupUnitOption[];
};

export type PropertySetupStep = 1 | 2 | 3 | 4 | 5;
