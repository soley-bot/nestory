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
import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";
import type { PersonRoleValue } from "@/features/people/people.types";
import {
  createLeaseAction,
  type LeaseActionState,
  updateLeaseAction,
} from "@/features/leases/actions";
import type {
  LeaseFormValues,
  LeaseBillingFormConfig,
  LeaseCreateContext,
  LeasePaymentFrequency,
  LeasePropertyOption,
  LeaseStatusValue,
  LeaseSummary,
  LeaseTenantOption,
  LeaseTermStatus,
  LeaseUnitOption,
} from "@/features/leases/lease.types";
import { getBusinessDateValue } from "@/lib/dates/business-date";

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
  billingFormConfig?: LeaseBillingFormConfig;
  createContext?: LeaseCreateContext;
  initialValues?: LeaseFormInitialValues;
  initialStatus?: LeaseStatusValue;
  initialTermStatus?: LeaseTermStatus;
  lease?: LeaseSummary | null;
  mode?: "create" | "edit";
  onClose: () => void;
  onSuccess?: (message: string, leaseId?: string) => void;
  properties: LeasePropertyOption[];
  setupMode?: boolean;
  tenants: LeaseTenantOption[];
  units: LeaseUnitOption[];
};

type LeaseFormInitialValues = Partial<
  Pick<LeaseFormValues, "propertyId" | "tenantPersonId" | "unitId">
>;

export function LeaseForm({
  billingFormConfig,
  createContext,
  initialValues,
  initialStatus,
  initialTermStatus,
  lease,
  mode = "create",
  onClose,
  onSuccess,
  setupMode = false,
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
  const [leaseStartDate, setLeaseStartDate] = useState(defaults.leaseStartDate);
  const [depositRequiredAmount, setDepositRequiredAmount] = useState(
    defaults.depositAmount,
  );
  const [depositReceived, setDepositReceived] = useState<"no" | "yes">("no");
  const [depositReceivedAmount, setDepositReceivedAmount] = useState(
    defaults.depositAmount,
  );
  const [depositReceivedAmountEdited, setDepositReceivedAmountEdited] =
    useState(false);
  const [moveInTiming, setMoveInTiming] = useState<"moved_in" | "later">("moved_in");
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const tenantOptions = ensureSelectedTenant(
    availableTenantOptions,
    selectedTenantId,
    defaults.tenantName,
  );
  const formUnitId = selectedUnitId ?? "";
  const createAsActive = shouldCreateSetupLeaseAsActive(
    setupMode,
    moveInTiming,
    formUnitId,
  );
  const tenantRecipient = tenantOptions.find(
    (tenant) => tenant.id === selectedTenantId,
  );
  const billingDefaults =
    lease?.billingRules.find((rule) => rule.state === "current") ??
    lease?.billingRules[0] ??
    null;

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
    partyType?: "company" | "individual",
  ) {
    if (!personId || !displayName || !partyType || !roles?.includes("tenant")) {
      return;
    }

    setAvailableTenantOptions((current) => [
      {
        archived: false,
        description: "Tenant",
        id: personId,
        label: displayName,
        partyType,
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
        saveLabel={isEditMode ? "Save draft changes" : setupMode ? "Save tenant and lease" : "Create draft lease"}
        savingLabel={isEditMode ? "Saving draft" : setupMode ? "Saving tenant and lease" : "Creating draft"}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-success/30 py-2 text-sm">
            <p className="font-medium text-foreground">Draft created</p>
            <Link
              className="inline-flex h-8 items-center gap-1.5 font-medium text-accent outline-none transition-colors hover:text-accent/75 focus-visible:ring-2 focus-visible:ring-ring"
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
            <input name="status" type="hidden" value={createAsActive ? "active" : "draft"} />
            <input name="termStatus" type="hidden" value={createAsActive ? "active" : "draft"} />
            <input name="paymentFrequency" type="hidden" value="monthly" />
            <input name="scheduledMoveInDate" type="hidden" value={setupMode ? leaseStartDate : ""} />
            <input name="scheduledMoveOutDate" type="hidden" value="" />
            <input name="actualMoveInDate" type="hidden" value={createAsActive ? leaseStartDate : ""} />
            <input name="actualMoveOutDate" type="hidden" value="" />
          </>
        )}

        {!isEditMode ? (
          <FormSection step="01" title="Tenant">
            {createContext ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-3 text-sm">
                <span className="font-medium text-foreground">{createContext.propertyLabel}</span>
                <span aria-hidden className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">{createContext.unitLabel ?? "Whole property"}</span>
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

        <FormSection step={isEditMode ? "01" : "02"} title="Lease period">
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
                onValueChange={setLeaseStartDate}
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
                minValue={leaseStartDate}
                name="leaseEndDate"
                required
              />
            </RecordField>
          </div>

          {setupMode && !isEditMode ? (
            <RecordField label="Move-in status" name="moveInTiming" required>
              <SelectControl
                ariaLabel="Move-in status"
                onValueChange={(value) => setMoveInTiming(value as "moved_in" | "later")}
                options={[
                  { label: "Tenant moved in on the lease start date", value: "moved_in" },
                  { label: "Tenant will move in later", value: "later" },
                ]}
                value={moveInTiming}
              />
            </RecordField>
          ) : null}

        </FormSection>

        <FormSection step={isEditMode ? "02" : "03"} title="Rent and deposit">
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
            label={isEditMode ? "Security deposit" : "Deposit required"}
            name="depositAmount"
          >
            <NumberInput
              min="0"
              name="depositAmount"
              onChange={(event) => {
                const nextAmount = event.currentTarget.value;
                setDepositRequiredAmount(nextAmount);
                if (!depositReceivedAmountEdited) {
                  setDepositReceivedAmount(nextAmount);
                }
              }}
              placeholder="0.00"
              step="0.01"
              value={depositRequiredAmount}
            />
          </RecordField>

          {!isEditMode ? (
            <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
              <RecordField
                error={state.fieldErrors?.depositReceived?.[0]}
                label="Deposit received?"
                name="depositReceived"
              >
                <SelectControl
                  ariaLabel="Deposit received?"
                  name="depositReceived"
                  onValueChange={(value) => {
                    const nextValue = value as "no" | "yes";
                    setDepositReceived(nextValue);
                    if (nextValue === "yes" && !depositReceivedAmountEdited) {
                      setDepositReceivedAmount(depositRequiredAmount);
                    }
                  }}
                  options={[
                    { label: "No, still pending", value: "no" },
                    { label: "Yes, received", value: "yes" },
                  ]}
                  value={depositReceived}
                />
              </RecordField>

              {depositReceived === "yes" ? (
                <>
                  <RecordField
                    error={state.fieldErrors?.depositReceivedAmount?.[0]}
                    label="Received amount"
                    name="depositReceivedAmount"
                    required
                  >
                    <NumberInput
                      min="0.01"
                      name="depositReceivedAmount"
                      onChange={(event) => {
                        setDepositReceivedAmount(event.currentTarget.value);
                        setDepositReceivedAmountEdited(true);
                      }}
                      required
                      step="0.01"
                      value={depositReceivedAmount}
                    />
                  </RecordField>
                  <RecordField
                    error={state.fieldErrors?.depositReceivedOn?.[0]}
                    label="Received on"
                    name="depositReceivedOn"
                    required
                  >
                    <DatePickerField
                      ariaLabel="Received on"
                      defaultValue={getBusinessDateValue()}
                      name="depositReceivedOn"
                      required
                    />
                  </RecordField>
                </>
              ) : null}
            </div>
          ) : null}
        </FormSection>

        <FormSection
          step={isEditMode ? "03" : "04"}
          title="Rent collection and billing"
        >
          <p className="text-sm text-muted-foreground">
            {isEditMode
              ? "This unused draft rule follows the lease start date."
              : "Begins on the lease start date."}
          </p>
          <LeaseBillingRuleFields
            companyOptions={billingFormConfig?.companyOptions}
            defaults={billingDefaults}
            fieldErrors={state.fieldErrors}
            operationalTimezone={
              billingFormConfig?.operationalTimezone ?? "UTC"
            }
            organizationName={
              billingFormConfig?.organizationName ?? "our company"
            }
            tenantRecipient={
              tenantRecipient?.partyType
                ? {
                    id: tenantRecipient.id,
                    label: tenantRecipient.label,
                    partyType: tenantRecipient.partyType,
                  }
                : null
            }
          />
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
          onSuccess={(_message, personId, roles, displayName, partyType) =>
            handleTenantCreated(personId, roles, displayName, partyType)
          }
          roleContext="tenant"
        />
      </Modal>
    </>
  );
}

export function shouldCreateSetupLeaseAsActive(
  setupMode: boolean,
  moveInTiming: "moved_in" | "later",
  unitId: string,
): boolean {
  return setupMode && moveInTiming === "moved_in" && unitId.length > 0;
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
