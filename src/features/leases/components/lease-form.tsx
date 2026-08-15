"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormSection } from "@/components/ui/form-section";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import { PersonForm } from "@/features/people/components/person-form";
import { PersonSelect } from "@/features/people/components/person-select";
import type { PersonRoleValue } from "@/features/people/people.types";
import {
  createLeaseAction,
  type LeaseActionState,
  updateLeaseAction,
} from "@/features/leases/actions";
import type {
  LeaseFormValues,
  LeasePaymentFrequency,
  LeasePropertyOption,
  LeaseStatusValue,
  LeaseSummary,
  LeaseTenantOption,
  LeaseTermStatus,
  LeaseUnitOption,
} from "@/features/leases/lease.types";

const initialState: LeaseActionState = {};

const paymentFrequencyOptions: {
  label: string;
  value: LeasePaymentFrequency;
}[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Semi-annual", value: "semi_annual" },
  { label: "Annual", value: "annual" },
  { label: "One time", value: "one_time" },
];
type LeaseFormProps = {
  initialValues?: LeaseFormInitialValues;
  initialStatus?: LeaseStatusValue;
  initialTermStatus?: LeaseTermStatus;
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
  initialStatus,
  initialTermStatus,
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
  const defaults = getLeaseDefaults(
    lease,
    initialValues,
    initialStatus,
    initialTermStatus,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    defaults.propertyId,
  );
  const [selectedPaymentFrequency, setSelectedPaymentFrequency] = useState(
    defaults.paymentFrequency,
  );
  const [selectedTenantId, setSelectedTenantId] = useState(
    defaults.tenantPersonId,
  );
  const [selectedUnitId, setSelectedUnitId] = useState(defaults.unitId);
  const [leaseStartDate, setLeaseStartDate] = useState(defaults.leaseStartDate);
  const [leaseEndDate, setLeaseEndDate] = useState(defaults.leaseEndDate);
  const [availableTenantOptions, setAvailableTenantOptions] = useState(tenants);
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const hasValidLeaseDates =
    Boolean(leaseStartDate && leaseEndDate) && leaseEndDate > leaseStartDate;
  const availableUnits = useMemo(
    () =>
      hasValidLeaseDates
        ? units.filter((unit) =>
            isUnitAvailableForLease(
              unit,
              leaseStartDate,
              leaseEndDate,
              isEditMode ? lease?.id : undefined,
            ),
          )
        : [],
    [
      hasValidLeaseDates,
      isEditMode,
      lease?.id,
      leaseEndDate,
      leaseStartDate,
      units,
    ],
  );
  const availablePropertyIds = useMemo(
    () => new Set(availableUnits.map((unit) => unit.propertyId)),
    [availableUnits],
  );
  const availableProperties = useMemo(
    () =>
      hasValidLeaseDates
        ? properties.filter((property) => availablePropertyIds.has(property.id))
        : [],
    [availablePropertyIds, hasValidLeaseDates, properties],
  );
  const propertyOptions = availableProperties;
  const unitOptions = useMemo(
    () =>
      ensureSelectedUnit(
        availableUnits.filter((unit) => unit.propertyId === selectedPropertyId),
        units,
        selectedUnitId,
      ),
    [availableUnits, selectedPropertyId, selectedUnitId, units],
  );
  const tenantOptions = ensureSelectedTenant(
    availableTenantOptions,
    selectedTenantId,
    defaults.tenantName,
  );
  const formUnitId =
    selectedUnitId && unitOptions.some((unit) => unit.id === selectedUnitId)
      ? selectedUnitId
      : "";

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Lease saved.", state.leaseId);
      onClose();
    }
  }, [onClose, onSuccess, state.leaseId, state.message, state.status]);

  function handleTenantCreated(
    personId?: string,
    roles?: PersonRoleValue[],
    displayName?: string,
  ) {
    if (!personId || !displayName || !roles?.includes("tenant")) return;

    setAvailableTenantOptions((current) => [
      {
        archived: false,
        description: "Tenant",
        id: personId,
        label: displayName,
        roles: ["tenant"],
      },
      ...current.filter((option) => option.id !== personId),
    ]);
    setSelectedTenantId(personId);
    setCreateTenantOpen(false);
  }

  function handleLeaseStartDateChange(value: string) {
    setLeaseStartDate(value);

    if (!isEditMode) {
      setSelectedPropertyId("");
      setSelectedUnitId("");
    }
  }

  function handleLeaseEndDateChange(value: string) {
    setLeaseEndDate(value);

    if (!isEditMode) {
      setSelectedPropertyId("");
      setSelectedUnitId("");
    }
  }

  return (
    <>
      <RecordForm
        action={action}
        ariaLabel={isEditMode ? "Edit draft form" : "Add lease form"}
        onCancel={onClose}
        pending={pending}
        saveLabel={isEditMode ? "Save draft changes" : "Create draft lease"}
        savingLabel={isEditMode ? "Saving draft" : "Creating draft"}
        state={{
          ...state,
          fieldErrors: state.fieldErrors ? { ...state.fieldErrors } : undefined,
        }}
      >
        {isEditMode && lease ? (
          <input name="leaseId" type="hidden" value={lease.id} />
        ) : null}
        <input
          name="idempotencyKey"
          suppressHydrationWarning
          type="hidden"
          value={idempotencyKey}
        />

        {isEditMode ? (
          <>
            <input
              name="tenantPersonId"
              type="hidden"
              value={selectedTenantId}
            />
            <input name="propertyId" type="hidden" value={selectedPropertyId} />
            <input name="unitId" type="hidden" value={formUnitId} />
            <input name="status" type="hidden" value={defaults.status} />
            <input
              name="termStatus"
              type="hidden"
              value={defaults.termStatus}
            />
          </>
        ) : (
          <>
            <input name="status" type="hidden" value="draft" />
            <input name="termStatus" type="hidden" value="draft" />
            <input name="paymentFrequency" type="hidden" value="monthly" />
            <input name="scheduledMoveInDate" type="hidden" value="" />
            <input name="scheduledMoveOutDate" type="hidden" value="" />
            <input name="actualMoveInDate" type="hidden" value="" />
            <input name="actualMoveOutDate" type="hidden" value="" />
          </>
        )}

        <FormSection title="Lease period">
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
                onValueChange={handleLeaseStartDateChange}
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
                onValueChange={handleLeaseEndDateChange}
                required
              />
            </RecordField>
          </div>

        </FormSection>

        {!isEditMode ? (
          <FormSection title="Tenant and unit">
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
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

              <Button
                className="w-full sm:w-auto"
                onClick={() => setCreateTenantOpen(true)}
                type="button"
                variant="outline"
              >
                <Plus aria-hidden size={15} />
                New tenant
              </Button>
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
                  disabled={!hasValidLeaseDates}
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
                required
              >
                <SelectControl
                  ariaLabel="Unit"
                  disabled={!hasValidLeaseDates || !selectedPropertyId}
                  name="unitId"
                  onValueChange={setSelectedUnitId}
                  options={[
                    { label: "Select unit", value: "" },
                    ...unitOptions.map((unit) => ({
                      label: formatUnitSelectLabel(unit.label),
                      value: unit.id,
                    })),
                  ]}
                  required
                  value={formUnitId}
                />
              </RecordField>
            </div>
          </FormSection>
        ) : null}

        <FormSection title="Rent and deposit">
          <div className="grid gap-4 sm:grid-cols-2">
            <RecordField
              label="Rent amount"
              name="monthlyRentAmount"
              error={state.fieldErrors?.monthlyRentAmount?.[0]}
              required
            >
              <NumberInput
                defaultValue={defaults.monthlyRentAmount}
                min="0.01"
                name="monthlyRentAmount"
                placeholder="0.00"
                required
                step="0.01"
              />
            </RecordField>

            <RecordField
              error={state.fieldErrors?.rentDueDay?.[0]}
              label="Rent due day"
              name="rentDueDay"
              required
            >
              <NumberInput
                defaultValue={defaults.rentDueDay}
                max="31"
                min="1"
                name="rentDueDay"
                placeholder="1-31"
                required
                step="1"
              />
            </RecordField>
          </div>

          {isEditMode ? (
            <div className="max-w-sm">
              <RecordField
                error={state.fieldErrors?.paymentFrequency?.[0]}
                label="Payment frequency"
                name="paymentFrequency"
                required
              >
                <SelectControl
                  ariaLabel="Payment frequency"
                  name="paymentFrequency"
                  onValueChange={(value) =>
                    setSelectedPaymentFrequency(value as LeasePaymentFrequency)
                  }
                  options={[
                    { label: "Choose frequency", value: "" },
                    ...paymentFrequencyOptions,
                  ]}
                  required
                  value={selectedPaymentFrequency}
                />
              </RecordField>
            </div>
          ) : null}

          <RecordField
            error={state.fieldErrors?.depositAmount?.[0]}
            label="Security deposit"
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
        </FormSection>
      </RecordForm>
      <Modal
        onClose={() => setCreateTenantOpen(false)}
        open={createTenantOpen}
        title="Create tenant"
      >
        <PersonForm
          initialRoles={["tenant"]}
          onClose={() => setCreateTenantOpen(false)}
          onSuccess={(_message, personId, roles, displayName) =>
            handleTenantCreated(personId, roles, displayName)
          }
          roleContext="tenant"
        />
      </Modal>
    </>
  );
}

function getLeaseDefaults(
  lease?: LeaseSummary | null,
  initialValues: LeaseFormInitialValues = {},
  initialStatus?: LeaseStatusValue,
  initialTermStatus?: LeaseTermStatus,
) {
  const formValues = lease?.formValues;

  return {
    depositAmount: toInputNumber(formValues?.depositAmount),
    leaseEndDate: formValues?.leaseEndDate ?? "",
    leaseStartDate: formValues?.leaseStartDate ?? "",
    monthlyRentAmount: toInputNumber(formValues?.monthlyRentAmount),
    paymentFrequency: formValues?.paymentFrequency ?? "",
    propertyId: formValues?.propertyId ?? initialValues.propertyId ?? "",
    rentDueDay: toInputNumber(formValues?.rentDueDay),
    status: initialStatus ?? formValues?.status ?? "",
    tenantPersonId:
      formValues?.tenantPersonId ?? initialValues.tenantPersonId ?? "",
    tenantName: formValues?.tenantName ?? "",
    termStatus: initialTermStatus ?? formValues?.termStatus ?? "",
    unitId: formValues?.unitId ?? initialValues.unitId ?? "",
  };
}

function toInputNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value);
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

function isUnitAvailableForLease(
  unit: LeaseUnitOption,
  startDate: string,
  endDate: string,
  currentLeaseId?: string,
) {
  return !(unit.reservations ?? []).some(
    (reservation) =>
      reservation.leaseId !== currentLeaseId &&
      reservation.startDate <= endDate &&
      reservation.endDate >= startDate,
  );
}
