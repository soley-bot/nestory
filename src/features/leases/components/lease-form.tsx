"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
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
  LeaseCreateContext,
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
  createContext?: LeaseCreateContext;
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
  createContext,
  initialValues,
  initialStatus,
  initialTermStatus,
  lease,
  mode = "create",
  onClose,
  onSuccess,
  tenants,
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
  const selectedPropertyId = createContext?.propertyId ?? defaults.propertyId;
  const [selectedPaymentFrequency, setSelectedPaymentFrequency] = useState(
    defaults.paymentFrequency,
  );
  const [selectedTenantId, setSelectedTenantId] = useState(
    defaults.tenantPersonId,
  );
  const selectedUnitId = createContext?.unitId ?? defaults.unitId;
  const [availableTenantOptions, setAvailableTenantOptions] = useState(tenants);
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const tenantOptions = ensureSelectedTenant(
    availableTenantOptions,
    selectedTenantId,
    defaults.tenantName,
  );
  const formUnitId = selectedUnitId ?? "";

  useEffect(() => {
    if (state.status === "success") {
      onSuccess?.(state.message ?? "Lease saved.", state.leaseId);
      if (isEditMode) {
        onClose();
      }
    }
  }, [isEditMode, onClose, onSuccess, state.leaseId, state.message, state.status]);

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

  return (
    <>
      <RecordForm
        action={action}
        ariaLabel={isEditMode ? "Edit draft form" : "Add lease form"}
        onCancel={onClose}
        pending={pending}
        saveLabel={isEditMode ? "Save draft changes" : "Create draft lease"}
        savingLabel={isEditMode ? "Saving draft" : "Creating draft"}
        hideSaveOnSuccess={!isEditMode}
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

        {!isEditMode && state.status === "success" && state.leaseId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm">
            <p className="font-medium text-foreground">
              Draft saved and ready for review.
            </p>
            <Link
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-accent outline-none transition-colors hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring"
              href={`/leases/${state.leaseId}`}
              prefetch={false}
            >
              Open draft
              <ArrowRight aria-hidden size={14} />
            </Link>
          </div>
        ) : null}

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
            <input name="propertyId" type="hidden" value={selectedPropertyId} />
            <input name="unitId" type="hidden" value={formUnitId} />
            <input name="status" type="hidden" value="draft" />
            <input name="termStatus" type="hidden" value="draft" />
            <input name="paymentFrequency" type="hidden" value="monthly" />
            <input name="scheduledMoveInDate" type="hidden" value="" />
            <input name="scheduledMoveOutDate" type="hidden" value="" />
            <input name="actualMoveInDate" type="hidden" value="" />
            <input name="actualMoveOutDate" type="hidden" value="" />
          </>
        )}

        {!isEditMode ? (
          <FormSection title="Tenant">
            {createContext ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{createContext.propertyLabel}</p>
                <p className="text-muted-foreground">
                  {createContext.unitLabel ?? "Whole property"}
                </p>
              </div>
            ) : null}
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
          </FormSection>
        ) : null}

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

        </FormSection>

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
