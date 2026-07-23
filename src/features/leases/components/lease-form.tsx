"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormSection } from "@/components/ui/form-section";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { PersonSelect } from "@/features/people/components/person-select";
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
  onSuccess?: (message: string, leaseId?: string) => void;
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
  const [selectedStatus, setSelectedStatus] = useState(defaults.status);
  const [selectedTenantId, setSelectedTenantId] = useState(
    defaults.tenantPersonId,
  );
  const [selectedUnitId, setSelectedUnitId] = useState(defaults.unitId);
  const propertyOptions = ensureSelectedProperty(
    properties,
    selectedPropertyId,
  );
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
    selectedTenantId,
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
  const selectedTenantOption = tenantOptions.find(
    (tenant) => tenant.id === selectedTenantId,
  );
  const selectedStatusOption = normalizedStatusOptions.find(
    (status) => status.value === selectedStatus,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Lease saved.", state.leaseId);
      onClose();
    }
  }, [onClose, onSuccess, state.leaseId, state.message, state.status]);

  return (
    <RecordForm
      action={action}
      ariaLabel={isEditMode ? "Edit lease form" : "Add lease form"}
      onCancel={onClose}
      pending={pending}
      saveLabel={isEditMode ? "Save changes" : "Add lease"}
      savingLabel={isEditMode ? "Saving lease" : "Adding lease"}
      state={{
        ...state,
        fieldErrors: state.fieldErrors ? { ...state.fieldErrors } : undefined,
      }}
    >
      {isEditMode && lease ? (
        <input name="leaseId" type="hidden" value={lease.id} />
      ) : null}

      <ConsequencePanel
        rows={[
          {
            label: "Tenant",
            value: selectedTenantOption?.label ?? "Select tenant",
          },
          {
            label: "Property",
            value: selectedPropertyOption?.label ?? "Select property",
          },
          {
            label: "Unit",
            value: selectedUnitOption?.label ?? "No unit assigned",
          },
          {
            label: "Status",
            value: selectedStatusOption?.label ?? selectedStatus,
          },
        ]}
        summary={
          initialValues?.unitId
            ? "Saving links this tenant to the selected vacancy. Open lease statuses affect unit occupancy."
            : "Saving links this tenant, property, and optional unit. Open lease statuses affect unit occupancy."
        }
        title="Tenancy effect"
      />

      <FormSection title="Lease party">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <RecordField
            error={state.fieldErrors?.tenantPersonId?.[0]}
            label="Tenant"
            name="tenantPersonId"
            required
          >
            <PersonSelect
              context="Lease tenant"
              name="tenantPersonId"
              onValueChange={setSelectedTenantId}
              options={tenantOptions}
              placeholder="Select tenant"
              preservedOption={
                selectedTenantId && defaults.tenantName
                  ? {
                      archived: true,
                      description: "Historical lease tenant",
                      id: selectedTenantId,
                      label: defaults.tenantName,
                      roles: ["tenant"] as const,
                    }
                  : undefined
              }
              roles={["tenant"]}
              value={selectedTenantId}
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.status?.[0]}
            label="Status"
            name="status"
            required
          >
            <SelectControl
              ariaLabel="Status"
              name="status"
              onValueChange={(value) =>
                setSelectedStatus(value as LeaseStatusValue)
              }
              options={normalizedStatusOptions}
              required
              value={selectedStatus}
            />
          </RecordField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={state.fieldErrors?.propertyId?.[0]}
            label="Property"
            name="propertyId"
            required
          >
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
          </RecordField>

          <RecordField
            error={state.fieldErrors?.unitId?.[0]}
            label="Unit"
            name="unitId"
          >
            <SelectControl
              ariaLabel="Unit"
              disabled={!selectedPropertyId}
              name="unitId"
              onValueChange={setSelectedUnitId}
              options={[
                { label: "No unit assigned", value: "" },
                ...unitOptions.map((unit) => ({
                  label: formatUnitSelectLabel(unit.label),
                  value: unit.id,
                })),
              ]}
              value={formUnitId}
            />
          </RecordField>
        </div>
      </FormSection>

      <FormSection title="Term and money">
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            label="Start date"
            name="leaseStartDate"
            error={state.fieldErrors?.leaseStartDate?.[0]}
            required
          >
            <DatePickerField
              ariaLabel="Lease start date"
              defaultValue={defaults.leaseStartDate}
              name="leaseStartDate"
              required
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.leaseEndDate?.[0]}
            label="End date"
            name="leaseEndDate"
            required
          >
            <DatePickerField
              ariaLabel="Lease end date"
              defaultValue={defaults.leaseEndDate}
              name="leaseEndDate"
              required
            />
          </RecordField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            label="Monthly rent"
            name="monthlyRentAmount"
            error={state.fieldErrors?.monthlyRentAmount?.[0]}
            required
          >
            <NumberInput
              defaultValue={defaults.monthlyRentAmount}
              min="0"
              name="monthlyRentAmount"
              placeholder="0.00"
              required
              step="0.01"
            />
          </RecordField>

          <RecordField
            error={state.fieldErrors?.depositAmount?.[0]}
            label="Deposit"
            name="depositAmount"
          >
            <NumberInput
              defaultValue={defaults.depositAmount}
              min="0"
              name="depositAmount"
              placeholder="0.00"
              step="0.01"
            />
          </RecordField>
        </div>
      </FormSection>
    </RecordForm>
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
  if (
    !selectedUnitId ||
    scopedUnits.some((unit) => unit.id === selectedUnitId)
  ) {
    return scopedUnits;
  }

  const selectedUnit = allUnits.find((unit) => unit.id === selectedUnitId);

  return selectedUnit ? [...scopedUnits, selectedUnit] : scopedUnits;
}

function ensureSelectedTenant(
  tenants: LeaseTenantOption[],
  selectedTenantId: string,
  selectedTenantName: string,
): LeaseTenantOption[] {
  if (
    !selectedTenantId ||
    tenants.some((tenant) => tenant.id === selectedTenantId)
  ) {
    return tenants;
  }

  return [
    ...tenants,
    {
      archived: true,
      description: "Historical lease tenant",
      id: selectedTenantId,
      label: selectedTenantName || "Current tenant",
      roles: ["tenant"],
    },
  ];
}

function formatUnitSelectLabel(label: string) {
  return label.includes(" / ") ? (label.split(" / ").at(-1) ?? label) : label;
}

function ensureSelectedStatus(
  options: { label: string; value: string }[],
  selectedStatus: string,
) {
  if (
    !selectedStatus ||
    options.some((option) => option.value === selectedStatus)
  ) {
    return options;
  }

  return [
    ...options,
    { label: selectedStatus.replace(/_/g, " "), value: selectedStatus },
  ];
}
