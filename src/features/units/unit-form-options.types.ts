import type {
  LeaseBillingFormConfig,
  LeaseTenantOption,
} from "@/features/leases/lease.types";
import type {
  MaintenanceActor,
  MaintenanceAssigneeOption,
  MaintenanceBranchOption,
  MaintenancePropertyOption,
  MaintenanceUnitOption,
  MaintenanceVendorOption,
} from "@/features/maintenance/maintenance.types";

export type UnitFormOptionsByMode = {
  lease: {
    billingFormConfig: LeaseBillingFormConfig;
    tenants: LeaseTenantOption[];
  };
  maintenance: {
    actor: MaintenanceActor;
    branches: MaintenanceBranchOption[];
    canRecordActualCost: boolean;
    properties: MaintenancePropertyOption[];
    staff: MaintenanceAssigneeOption[];
    units: MaintenanceUnitOption[];
    vendors: MaintenanceVendorOption[];
  };
};

export type UnitFormOptionsMode = keyof UnitFormOptionsByMode;

export type UnitFormOptionsResponse<M extends UnitFormOptionsMode> = {
  mode: M;
  options: UnitFormOptionsByMode[M];
  propertyId: string;
  unitId: string;
};
