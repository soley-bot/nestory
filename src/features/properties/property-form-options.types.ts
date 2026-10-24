import type { LeaseBillingFormConfig, LeaseTenantOption } from "@/features/leases/lease.types";
import type { PropertyOwnerOption } from "./property.types";

export type PropertyFormOptionsByMode = {
  edit: { owners: PropertyOwnerOption[] };
  lease: { billingFormConfig?: LeaseBillingFormConfig; tenants: LeaseTenantOption[] };
};

export type PropertyFormOptionsMode = keyof PropertyFormOptionsByMode;

export type PropertyFormOptionsResponse<M extends PropertyFormOptionsMode> = {
  mode: M;
  options: PropertyFormOptionsByMode[M];
  propertyId: string;
};
