"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
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

const createLeaseSteps = [
  { label: "Tenant", step: 1 },
  { label: "Lease terms", step: 2 },
  { label: "Rent and deposit", step: 3 },
  { label: "Billing setup", step: 4 },
] as const;

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
  canRecordDepositReceipt?: boolean;
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
  canRecordDepositReceipt = false,
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
  const [createStep, setCreateStep] = useState(1);
  const [furthestCreateStep, setFurthestCreateStep] = useState(1);
  const [state, action, pending] = useActionState(
    async (previousState: LeaseActionState, formData: FormData) => {
      const nextState = await (isEditMode
        ? updateLeaseAction(previousState, formData)
        : createLeaseAction(previousState, formData));

      if (!isEditMode && nextState.status === "error" && nextState.fieldErrors) {
        const errorStep = getCreateStepForFieldErrors(nextState.fieldErrors);
        if (errorStep !== null) {
          setCreateStep(errorStep);
          setFurthestCreateStep((current) => Math.max(current, errorStep));
        }
      }

      return nextState;
    },
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
  const [leaseEndDate, setLeaseEndDate] = useState(defaults.leaseEndDate);
  const [monthlyRentAmount, setMonthlyRentAmount] = useState(
    defaults.monthlyRentAmount,
  );
  const [rentDueDay, setRentDueDay] = useState(defaults.rentDueDay);
  const [depositRequiredAmount, setDepositRequiredAmount] = useState(
    defaults.depositAmount,
  );
  const [depositReceived, setDepositReceived] = useState<"no" | "yes">("no");
  const [depositReceivedAmount, setDepositReceivedAmount] = useState(
    defaults.depositAmount,
  );
  const [depositReceivedAmountEdited, setDepositReceivedAmountEdited] =
    useState(false);
  const [moveInTiming, setMoveInTiming] = useState<"moved_in" | "later">(
    "moved_in",
  );
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
  }, [
    isEditMode,
    onClose,
    onSuccess,
    state.leaseId,
    state.message,
    state.status,
  ]);

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

  function handleCreateStepSave(form: HTMLFormElement) {
    if (createStep < createLeaseSteps.length) {
      const nextStep = createStep + 1;
      setCreateStep(nextStep);
      setFurthestCreateStep((current) => Math.max(current, nextStep));
      return;
    }

    startTransition(() => action(new FormData(form)));
  }

  return (
    <>
      <RecordForm
        action={action}
        ariaLabel={isEditMode ? "Edit draft form" : "Add lease form"}
        onCancel={onClose}
        onSave={isEditMode ? undefined : handleCreateStepSave}
        pending={pending}
        saveLabel={
          isEditMode
            ? "Save draft changes"
            : createStep < createLeaseSteps.length
              ? "Next"
              : setupMode
                ? "Save tenant and lease"
                : "Create draft lease"
        }
        savingLabel={
          isEditMode
            ? "Saving draft"
            : setupMode
              ? "Saving tenant and lease"
              : "Creating draft"
        }
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

        {!isEditMode ? (
          <nav aria-label="Create lease steps">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {createLeaseSteps.map((item) => {
                const current = createStep === item.step;
                const available = item.step <= furthestCreateStep;

                return (
                  <li key={item.step}>
                    <button
                      aria-current={current ? "step" : undefined}
                      aria-label={`${item.step} ${item.label}`}
                      className={`w-full border-t-2 px-1 py-2 text-left text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                        current
                          ? "border-accent text-foreground"
                          : available
                            ? "border-border text-muted-foreground hover:text-foreground"
                            : "border-border/60 text-muted-foreground/55"
                      }`}
                      disabled={!available}
                      onClick={() => setCreateStep(item.step)}
                      type="button"
                    >
                      <span className="mr-1 tabular-nums text-muted-foreground">
                        {String(item.step).padStart(2, "0")}
                      </span>
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

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
            <input
              name="status"
              type="hidden"
              value={createAsActive ? "active" : "draft"}
            />
            <input
              name="termStatus"
              type="hidden"
              value={createAsActive ? "active" : "draft"}
            />
            <input name="paymentFrequency" type="hidden" value="monthly" />
            <input
              name="scheduledMoveInDate"
              type="hidden"
              value={setupMode ? leaseStartDate : ""}
            />
            <input name="scheduledMoveOutDate" type="hidden" value="" />
            <input
              name="actualMoveInDate"
              type="hidden"
              value={createAsActive ? leaseStartDate : ""}
            />
            <input name="actualMoveOutDate" type="hidden" value="" />
          </>
        )}

        {!isEditMode ? (
          <div hidden={createStep !== 1}>
            <FormSection title="Tenant">
              {createContext ? (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-3 text-sm">
                  <span className="font-medium text-foreground">
                    {createContext.propertyLabel}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    /
                  </span>
                  <span className="text-muted-foreground">
                    {createContext.unitLabel ?? "Whole property"}
                  </span>
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
          </div>
        ) : null}

        <div hidden={!isEditMode && createStep !== 2}>
          <FormSection
            step={isEditMode ? "01" : undefined}
            title={isEditMode ? "Lease period" : "Lease terms"}
          >
            {!isEditMode ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  aria-pressed="true"
                  className="min-h-24 border border-accent bg-accent/5 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                >
                  <span className="block font-medium text-foreground">
                    Fixed term
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Start and end date
                  </span>
                </button>
                <div>
                  <button
                    className="min-h-24 w-full cursor-not-allowed border border-border bg-muted/25 px-4 py-3 text-left text-muted-foreground opacity-70"
                    disabled
                    type="button"
                  >
                    <span className="block font-medium">Month-to-month</span>
                    <span className="mt-1 block text-sm">No end date</span>
                  </button>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Requires a future lease-contract update
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <RecordField
                label={isEditMode ? "Start date" : "Lease start date"}
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
                label={isEditMode ? "End date" : "Lease end date"}
                name="leaseEndDate"
                required
              >
                <DatePickerField
                  ariaLabel="Lease end date"
                  defaultValue={defaults.leaseEndDate}
                  minValue={leaseStartDate}
                  name="leaseEndDate"
                  onValueChange={setLeaseEndDate}
                  required
                />
              </RecordField>
            </div>

            {setupMode && !isEditMode ? (
              <RecordField label="Move-in status" name="moveInTiming" required>
                <SelectControl
                  ariaLabel="Move-in status"
                  onValueChange={(value) =>
                    setMoveInTiming(value as "moved_in" | "later")
                  }
                  options={[
                    {
                      label: "Tenant moved in on the lease start date",
                      value: "moved_in",
                    },
                    { label: "Tenant will move in later", value: "later" },
                  ]}
                  value={moveInTiming}
                />
              </RecordField>
            ) : null}
          </FormSection>
        </div>

        <div hidden={!isEditMode && createStep !== 3}>
          <FormSection
            step={isEditMode ? "02" : undefined}
            title="Rent and deposit"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <RecordField
                label={isEditMode ? "Rent amount" : "Monthly rent"}
                name="monthlyRentAmount"
                error={state.fieldErrors?.monthlyRentAmount?.[0]}
                required
              >
                <NumberInput
                  min="0.01"
                  name="monthlyRentAmount"
                  onChange={(event) =>
                    setMonthlyRentAmount(event.currentTarget.value)
                  }
                  placeholder="0.00"
                  required
                  step="0.01"
                  value={monthlyRentAmount}
                />
              </RecordField>

              <RecordField
                error={state.fieldErrors?.rentDueDay?.[0]}
                label={isEditMode ? "Rent due day" : "Due each month on"}
                name="rentDueDay"
                required
              >
                <NumberInput
                  max="31"
                  min="1"
                  name="rentDueDay"
                  onChange={(event) => setRentDueDay(event.currentTarget.value)}
                  placeholder="1-31"
                  required
                  step="1"
                  value={rentDueDay}
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
                      setSelectedPaymentFrequency(
                        value as LeasePaymentFrequency,
                      )
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

            {!isEditMode && canRecordDepositReceipt ? (
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
        </div>

        <div hidden={!isEditMode && createStep !== 4}>
          <FormSection
            step={isEditMode ? "03" : undefined}
            title={isEditMode ? "Rent collection and billing" : "Billing setup"}
          >
            {isEditMode ? (
              <p className="text-sm text-muted-foreground">
                This unused draft rule follows the lease start date.
              </p>
            ) : null}
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
              presentation={isEditMode ? "expanded" : "summary"}
              rentSchedule={{
                currency: "USD",
                leaseEndDate,
                leaseStartDate,
                monthlyRentAmount,
                rentDueDay,
              }}
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
        </div>

        {!isEditMode && createStep > 1 ? (
          <div>
            <Button
              onClick={() =>
                setCreateStep((current) => Math.max(1, current - 1))
              }
              type="button"
              variant="ghost"
            >
              Back
            </Button>
          </div>
        ) : null}
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

function getCreateStepForFieldErrors(
  fieldErrors: NonNullable<LeaseActionState["fieldErrors"]>,
) {
  const stepFields = [
    ["propertyId", "tenantPersonId", "unitId"],
    [
      "actualMoveInDate",
      "actualMoveOutDate",
      "leaseEndDate",
      "leaseStartDate",
      "scheduledMoveInDate",
      "scheduledMoveOutDate",
      "status",
      "termStatus",
    ],
    [
      "depositAmount",
      "depositReceived",
      "depositReceivedAmount",
      "depositReceivedOn",
      "monthlyRentAmount",
      "paymentFrequency",
      "rentDueDay",
    ],
    [
      "billingRecipientKind",
      "billingRecipientPersonId",
      "chargeManagementFeeWhenActive",
      "chargeThroughLeaseEnd",
      "collectionRoute",
      "finalPeriodProratedAmount",
      "firstPeriodProratedAmount",
      "fullManagementFeeDuringProration",
      "leaseEndProrationRule",
      "leaseStartProrationRule",
      "managementFeeMode",
      "managementFeeValue",
      "midPeriodRentChangeRule",
      "rentCalculationTimezone",
      "shortMonthDueDayRule",
    ],
  ] as const;

  const index = stepFields.findIndex((fields) =>
    fields.some((field) => fieldErrors[field]?.length),
  );
  return index === -1 ? null : index + 1;
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
