"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import {
  createLeaseAction,
  type LeaseActionState,
  updateLeaseAction,
} from "@/features/leases/actions";
import type {
  LeaseFormValues,
  LeasePropertyOption,
  LeaseStatusValue,
  LeaseSummary,
  LeaseTenantOption,
  LeaseUnitOption,
} from "@/features/leases/lease.types";

const initialState: LeaseActionState = {};

const statusOptions: { label: string; value: LeaseStatusValue }[] = [
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Notice", value: "notice_given" },
  { label: "Ended", value: "ended" },
  { label: "Terminated", value: "terminated" },
  { label: "Cancelled", value: "cancelled" },
];

type LeaseFormProps = {
  initialValues?: LeaseFormInitialValues;
  lease?: LeaseSummary | null;
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string) => void;
  properties: LeasePropertyOption[];
  tenants: LeaseTenantOption[];
  units: LeaseUnitOption[];
};

type LeaseFormInitialValues = Partial<
  Pick<LeaseFormValues, "propertyId" | "tenantPersonId" | "unitId">
>;

export function LeaseForm({
  initialValues,
  lease,
  mode = "create",
  onClose,
  onSuccess,
  properties,
  tenants,
  units,
}: LeaseFormProps) {
  const isEditMode = mode === "edit";
  const [state, action, pending] = useActionState(
    isEditMode ? updateLeaseAction : createLeaseAction,
    initialState,
  );
  const defaults = getLeaseDefaults(lease, initialValues);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    defaults.propertyId,
  );
  const [selectedUnitId, setSelectedUnitId] = useState(defaults.unitId);
  const propertyOptions = ensureSelectedProperty(properties, selectedPropertyId);
  const unitOptions = useMemo(
    () =>
      ensureSelectedUnit(
        units.filter((unit) => unit.propertyId === selectedPropertyId),
        units,
        selectedUnitId,
      ),
    [selectedPropertyId, selectedUnitId, units],
  );
  const normalizedStatusOptions = ensureSelectedStatus(
    statusOptions,
    defaults.status,
  );
  const tenantOptions = ensureSelectedTenant(
    tenants,
    defaults.tenantPersonId,
    defaults.tenantName,
  );
  const formUnitId =
    selectedUnitId && unitOptions.some((unit) => unit.id === selectedUnitId)
      ? selectedUnitId
      : "";
  const selectedUnitOption = units.find((unit) => unit.id === formUnitId);
  const selectedPropertyOption = properties.find(
    (property) => property.id === selectedPropertyId,
  );
  const showVacancyContext = Boolean(initialValues?.unitId && selectedUnitOption);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Lease saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}

        {isEditMode && lease ? (
          <input name="leaseId" type="hidden" value={lease.id} />
        ) : null}

        {showVacancyContext ? (
          <div className="rounded-md border border-warning/30 bg-warning-soft/30 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">Filling vacancy</p>
            <p className="mt-1 text-foreground-muted">
              {selectedUnitOption?.label}
              {selectedPropertyOption ? ` / ${selectedPropertyOption.label}` : ""}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Tenant" error={state.fieldErrors?.tenantPersonId?.[0]}>
            <SelectControl
              ariaLabel="Tenant"
              defaultValue={defaults.tenantPersonId}
              name="tenantPersonId"
              options={[
                { label: "Select tenant", value: "" },
                ...tenantOptions.map((tenant) => ({
                  label: tenant.label,
                  value: tenant.id,
                })),
              ]}
              required
            />
          </Field>

          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue={defaults.status}
              name="status"
              options={normalizedStatusOptions}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
            <SelectControl
              ariaLabel="Property"
              name="propertyId"
              onValueChange={(value) => {
                setSelectedPropertyId(value);
                setSelectedUnitId("");
              }}
              options={[
                { label: "Select property", value: "" },
                ...propertyOptions.map((property) => ({
                  label: property.label,
                  value: property.id,
                })),
              ]}
              required
              value={selectedPropertyId}
            />
          </Field>

          <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
            <SelectControl
              ariaLabel="Unit"
              disabled={!selectedPropertyId}
              name="unitId"
              onValueChange={setSelectedUnitId}
              options={[
                { label: "No unit assigned", value: "" },
                ...unitOptions.map((unit) => ({
                  label: unit.label,
                  value: unit.id,
                })),
              ]}
              value={formUnitId}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start date"
            error={state.fieldErrors?.leaseStartDate?.[0]}
          >
            <DatePickerField
              ariaLabel="Lease start date"
              defaultValue={defaults.leaseStartDate}
              name="leaseStartDate"
              required
            />
          </Field>

          <Field label="End date" error={state.fieldErrors?.leaseEndDate?.[0]}>
            <DatePickerField
              ariaLabel="Lease end date"
              defaultValue={defaults.leaseEndDate}
              name="leaseEndDate"
              required
            />
          </Field>
        </div>

        <div className="grid gap-4">
          <Field
            label="Monthly rent"
            error={state.fieldErrors?.monthlyRentAmount?.[0]}
          >
            <Input
              defaultValue={defaults.monthlyRentAmount}
              min="0"
              name="monthlyRentAmount"
              placeholder="0.00"
              required
              step="0.01"
              type="number"
            />
          </Field>
        </div>

        <div className="grid gap-4">
          <Field
            label="Deposit"
            error={state.fieldErrors?.depositAmount?.[0]}
          >
            <Input
              defaultValue={defaults.depositAmount}
              min="0"
              name="depositAmount"
              placeholder="0.00"
              step="0.01"
              type="number"
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="primary"
          >
            {isEditMode
              ? pending
                ? "Saving..."
                : "Save changes"
              : pending
                ? "Adding..."
                : "Add lease"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function getLeaseDefaults(
  lease?: LeaseSummary | null,
  initialValues: LeaseFormInitialValues = {},
) {
  const formValues = lease?.formValues;

  return {
    depositAmount: toInputNumber(formValues?.depositAmount),
    leaseEndDate: formValues?.leaseEndDate ?? "",
    leaseStartDate: formValues?.leaseStartDate ?? "",
    monthlyRentAmount: toInputNumber(formValues?.monthlyRentAmount),
    propertyId: formValues?.propertyId ?? initialValues.propertyId ?? "",
    status: formValues?.status ?? "active",
    tenantPersonId:
      formValues?.tenantPersonId ?? initialValues.tenantPersonId ?? "",
    tenantName: formValues?.tenantName ?? "",
    unitId: formValues?.unitId ?? initialValues.unitId ?? "",
  };
}

function toInputNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value);
}

function ensureSelectedProperty(
  properties: LeasePropertyOption[],
  selectedPropertyId: string,
) {
  if (
    !selectedPropertyId ||
    properties.some((property) => property.id === selectedPropertyId)
  ) {
    return properties;
  }

  return [...properties, { id: selectedPropertyId, label: "Current property" }];
}

function ensureSelectedUnit(
  scopedUnits: LeaseUnitOption[],
  allUnits: LeaseUnitOption[],
  selectedUnitId: string,
) {
  if (!selectedUnitId || scopedUnits.some((unit) => unit.id === selectedUnitId)) {
    return scopedUnits;
  }

  const selectedUnit = allUnits.find((unit) => unit.id === selectedUnitId);

  return selectedUnit ? [...scopedUnits, selectedUnit] : scopedUnits;
}

function ensureSelectedTenant(
  tenants: LeaseTenantOption[],
  selectedTenantId: string,
  selectedTenantName: string,
) {
  if (
    !selectedTenantId ||
    tenants.some((tenant) => tenant.id === selectedTenantId)
  ) {
    return tenants;
  }

  return [
    ...tenants,
    {
      id: selectedTenantId,
      label: selectedTenantName || "Current tenant",
    },
  ];
}

function ensureSelectedStatus(
  options: { label: string; value: string }[],
  selectedStatus: string,
) {
  if (!selectedStatus || options.some((option) => option.value === selectedStatus)) {
    return options;
  }

  return [
    ...options,
    { label: selectedStatus.replace(/_/g, " "), value: selectedStatus },
  ];
}
