"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import type {
  LeaseBillingRule,
  LeaseBillingRuleFieldErrors,
  LeaseBillingFormConfig,
} from "@/features/leases/lease.types";

type RentSchedule = {
  currency?: "USD";
  finalMonthRentAmount?: number | string | null;
  firstMonthRentAmount?: number | string | null;
  leaseEndDate?: string;
  leaseStartDate?: string;
  monthlyRentAmount?: number | string | null;
  rentDueDay?: number | string | null;
};

export function LeaseBillingRuleFields({
  companyOptions = [],
  defaults,
  fieldErrors,
  operationalTimezone = "UTC",
  organizationName = "our company",
  presentation = "expanded",
  rentSchedule,
  tenantRecipient,
}: {
  companyOptions?: LeaseBillingFormConfig["companyOptions"];
  defaults?: LeaseBillingRule | null;
  fieldErrors?: LeaseBillingRuleFieldErrors;
  operationalTimezone?: string;
  organizationName?: string;
  presentation?: "expanded" | "summary";
  rentSchedule?: RentSchedule;
  tenantRecipient: {
    id: string;
    label: string;
    partyType: "company" | "individual";
  } | null;
}) {
  const initialRecipientKind =
    defaults?.billingRecipientKind ??
    tenantRecipient?.partyType ??
    "individual";
  const [recipientKind, setRecipientKind] = useState<"company" | "individual">(
    initialRecipientKind,
  );
  const [recipientId, setRecipientId] = useState(
    defaults?.billingRecipientPersonId ??
      (initialRecipientKind === tenantRecipient?.partyType
        ? (tenantRecipient?.id ?? "")
        : ""),
  );
  const [route, setRoute] = useState<"direct_to_owner" | "through_ips">(
    defaults?.collectionRoute ?? "through_ips",
  );
  const [feeMode, setFeeMode] = useState<"flat" | "percentage">(
    defaults?.managementFeeMode ?? "percentage",
  );
  const [feeValue, setFeeValue] = useState(
    toInputValue(defaults?.managementFeeValue ?? 0),
  );
  const [chargeManagementFee, setChargeManagementFee] = useState<"no" | "yes">(
    defaults?.chargeManagementFeeWhenActive === false ? "no" : "yes",
  );
  const [billingSetupOpen, setBillingSetupOpen] = useState(
    presentation === "expanded",
  );
  const billingSummaryHeadingId = useId();
  const [firstPeriodAmount, setFirstPeriodAmount] = useState(
    toInputValue(defaults?.firstPeriodProratedAmount),
  );
  const [finalPeriodAmount, setFinalPeriodAmount] = useState(
    toInputValue(defaults?.finalPeriodProratedAmount),
  );
  const hasSpecialPeriodAmount =
    defaults?.firstPeriodProratedAmount != null ||
    defaults?.finalPeriodProratedAmount != null;
  const [specialPeriodMode, setSpecialPeriodMode] = useState<
    "agreed" | "automatic"
  >(hasSpecialPeriodAmount ? "agreed" : "automatic");
  const sameMonthLease = isSameCalendarMonth(
    parseCalendarDate(rentSchedule?.leaseStartDate),
    parseCalendarDate(rentSchedule?.leaseEndDate),
  );
  const sameMonthAmount = firstPeriodAmount || finalPeriodAmount;
  const previousTenantRecipientRef = useRef(tenantRecipient);
  const selectedRecipientId =
    recipientId ||
    (recipientKind === tenantRecipient?.partyType ? tenantRecipient.id : "");
  const selectedRecipientLabel =
    recipientOptionsLabel(
      selectedRecipientId,
      tenantRecipient,
      companyOptions,
      defaults,
    ) ?? "Choose recipient";

  useEffect(() => {
    const previousTenantRecipient = previousTenantRecipientRef.current;
    previousTenantRecipientRef.current = tenantRecipient;

    if (!tenantRecipient) {
      if (previousTenantRecipient?.id === recipientId) setRecipientId("");
      return;
    }

    const followsTenant = previousTenantRecipient
      ? recipientId === previousTenantRecipient.id
      : recipientId === "";
    if (!followsTenant) return;

    setRecipientKind(tenantRecipient.partyType);
    setRecipientId(tenantRecipient.id);
  }, [recipientId, tenantRecipient]);

  const recipientOptions = useMemo(() => {
    if (recipientKind === "individual") {
      return tenantRecipient?.partyType === "individual"
        ? [{ label: tenantRecipient.label, value: tenantRecipient.id }]
        : [];
    }

    const tenantCompany =
      tenantRecipient?.partyType === "company"
        ? [{ id: tenantRecipient.id, label: tenantRecipient.label }]
        : [];
    const selectedCompany =
      defaults?.billingRecipientKind === "company" &&
      defaults.billingRecipientPersonId &&
      !companyOptions.some(
        (option) => option.id === defaults.billingRecipientPersonId,
      )
        ? [
            {
              id: defaults.billingRecipientPersonId,
              label: defaults.billingRecipientLabel || "Current company",
            },
          ]
        : [];

    return [...tenantCompany, ...selectedCompany, ...companyOptions]
      .filter(
        (option, index, options) =>
          options.findIndex((candidate) => candidate.id === option.id) ===
          index,
      )
      .map((option) => ({
        label: option.label,
        value: option.id,
      }));
  }, [companyOptions, defaults, recipientKind, tenantRecipient]);

  return (
    <div className="space-y-4">
      <input name="billingRecipientKind" type="hidden" value={recipientKind} />
      <input
        name="billingRecipientPersonId"
        type="hidden"
        value={selectedRecipientId}
      />
      <input name="collectionRoute" type="hidden" value={route} />
      <input name="managementFeeMode" type="hidden" value={feeMode} />
      <input
        name="fullManagementFeeDuringProration"
        type="hidden"
        value={defaults?.fullManagementFeeDuringProration ? "yes" : "no"}
      />
      <input
        name="rentCalculationTimezone"
        type="hidden"
        value={defaults?.rentCalculationTimezone || operationalTimezone}
      />
      <input name="leaseStartProrationRule" type="hidden" value="actual_days" />
      <input name="leaseEndProrationRule" type="hidden" value="actual_days" />
      <input
        name="midPeriodRentChangeRule"
        type="hidden"
        value="next_full_month"
      />
      <input
        name="shortMonthDueDayRule"
        type="hidden"
        value="last_calendar_day"
      />
      <input name="chargeThroughLeaseEnd" type="hidden" value="yes" />

      {presentation === "summary" ? (
        <>
          <section
            aria-labelledby={billingSummaryHeadingId}
            className="border-y border-border bg-muted/25 px-3 py-3"
          >
            <h3
              className="text-sm font-medium text-foreground"
              id={billingSummaryHeadingId}
            >
              Billing setup summary
            </h3>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <SummaryValue
                label="Bill"
                value={`${selectedRecipientLabel} monthly`}
              />
              <SummaryValue
                label="Collection"
                value={
                  route === "through_ips" ? organizationName : "Property owner"
                }
              />
              <SummaryValue
                label="Management fee"
                value={formatManagementFee(
                  chargeManagementFee,
                  feeMode,
                  feeValue,
                )}
              />
              <SummaryValue
                label="Short months"
                value="Calculated from actual days"
              />
            </dl>
          </section>
          <button
            className="text-sm font-medium text-accent outline-none transition-colors hover:text-accent/75 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setBillingSetupOpen((current) => !current)}
            type="button"
          >
            {billingSetupOpen ? "Hide billing setup" : "Change billing setup"}
          </button>
        </>
      ) : null}

      <div hidden={!billingSetupOpen}>
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordField
            error={fieldErrors?.billingRecipientKind?.[0]}
            label="Bill to"
            name="billingRecipientKind"
          >
            <SelectControl
              ariaLabel="Bill to"
              onValueChange={(value) => {
                const nextKind = value as "company" | "individual";
                setRecipientKind(nextKind);
                setRecipientId(
                  nextKind === tenantRecipient?.partyType
                    ? tenantRecipient.id
                    : "",
                );
              }}
              options={[
                { label: "Individual tenant", value: "individual" },
                { label: "Company", value: "company" },
              ]}
              value={recipientKind}
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.billingRecipientPersonId?.[0]}
            label="Recipient"
            name="billingRecipientPersonId"
          >
            <SelectControl
              ariaLabel="Recipient"
              onValueChange={setRecipientId}
              options={[
                { disabled: true, label: "Choose recipient", value: "" },
                ...recipientOptions,
              ]}
              placeholder="Choose recipient"
              value={selectedRecipientId}
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.collectionRoute?.[0]}
            label="Who collects rent?"
            name="collectionRoute"
          >
            <SelectControl
              ariaLabel="Who collects rent?"
              onValueChange={(value) =>
                setRoute(value as "direct_to_owner" | "through_ips")
              }
              options={[
                {
                  label: `Collected by ${organizationName}`,
                  value: "through_ips",
                },
                { label: "Collected by owner", value: "direct_to_owner" },
              ]}
              value={route}
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.managementFeeMode?.[0]}
            label="Management fee"
            name="managementFeeMode"
          >
            <SelectControl
              ariaLabel="Management fee"
              onValueChange={(value) =>
                setFeeMode(value as "flat" | "percentage")
              }
              options={[
                { label: "Percentage", value: "percentage" },
                { label: "Flat amount", value: "flat" },
              ]}
              value={feeMode}
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.managementFeeValue?.[0]}
            label={feeMode === "percentage" ? "Fee percentage" : "Fee amount"}
            name="managementFeeValue"
            required
          >
            <NumberInput
              max={feeMode === "percentage" ? "100" : undefined}
              min="0"
              name="managementFeeValue"
              onChange={(event) => setFeeValue(event.currentTarget.value)}
              required
              step={feeMode === "percentage" ? "0.0001" : "0.01"}
              value={feeValue}
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.chargeManagementFeeWhenActive?.[0]}
            label="Charge management fee?"
            name="chargeManagementFeeWhenActive"
            required
          >
            <SelectControl
              name="chargeManagementFeeWhenActive"
              onValueChange={(value) =>
                setChargeManagementFee(value as "no" | "yes")
              }
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              required
              value={chargeManagementFee}
            />
          </RecordField>
        </div>

        <div className="border-t border-border pt-4">
          <RecordField
            label="First or final month amount"
            name="specialPeriodAmountMode"
          >
            <SelectControl
              ariaLabel="First or final month amount"
              onValueChange={(value) => {
                const nextMode = value as "agreed" | "automatic";
                setSpecialPeriodMode(nextMode);
                if (nextMode === "automatic") {
                  setFirstPeriodAmount("");
                  setFinalPeriodAmount("");
                }
              }}
              options={[
                {
                  label: "Calculate automatically",
                  value: "automatic",
                },
                { label: "Use agreed amounts", value: "agreed" },
              ]}
              value={specialPeriodMode}
            />
          </RecordField>

          {specialPeriodMode === "agreed" && sameMonthLease ? (
            <div className="mt-3">
              <RecordField
                error={
                  fieldErrors?.firstPeriodProratedAmount?.[0] ??
                  fieldErrors?.finalPeriodProratedAmount?.[0]
                }
                label="Lease month amount (optional)"
                name="firstPeriodProratedAmount"
              >
                <NumberInput
                  min="0"
                  name="firstPeriodProratedAmount"
                  onChange={(event) => {
                    setFirstPeriodAmount(event.currentTarget.value);
                    setFinalPeriodAmount("");
                  }}
                  placeholder="e.g. 750.00"
                  step="0.01"
                  value={sameMonthAmount}
                />
              </RecordField>
              <input name="finalPeriodProratedAmount" type="hidden" value="" />
            </div>
          ) : specialPeriodMode === "agreed" ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <RecordField
                error={fieldErrors?.firstPeriodProratedAmount?.[0]}
                label="First month amount (optional)"
                name="firstPeriodProratedAmount"
              >
                <NumberInput
                  min="0"
                  name="firstPeriodProratedAmount"
                  onChange={(event) =>
                    setFirstPeriodAmount(event.currentTarget.value)
                  }
                  placeholder="e.g. 750.00"
                  step="0.01"
                  value={firstPeriodAmount}
                />
              </RecordField>

              <RecordField
                error={fieldErrors?.finalPeriodProratedAmount?.[0]}
                label="Final month amount (optional)"
                name="finalPeriodProratedAmount"
              >
                <NumberInput
                  min="0"
                  name="finalPeriodProratedAmount"
                  onChange={(event) =>
                    setFinalPeriodAmount(event.currentTarget.value)
                  }
                  placeholder="e.g. 750.00"
                  step="0.01"
                  value={finalPeriodAmount}
                />
              </RecordField>
            </div>
          ) : (
            <>
              <input name="firstPeriodProratedAmount" type="hidden" value="" />
              <input name="finalPeriodProratedAmount" type="hidden" value="" />
            </>
          )}
        </div>
      </div>

      <RentCalculationSummary
        finalPeriodAmount={finalPeriodAmount}
        firstPeriodAmount={firstPeriodAmount}
        rentSchedule={rentSchedule}
      />
    </div>
  );
}

function recipientOptionsLabel(
  selectedRecipientId: string,
  tenantRecipient: {
    id: string;
    label: string;
    partyType: "company" | "individual";
  } | null,
  companyOptions: LeaseBillingFormConfig["companyOptions"],
  defaults?: LeaseBillingRule | null,
) {
  if (selectedRecipientId === tenantRecipient?.id) return tenantRecipient.label;
  if (selectedRecipientId === defaults?.billingRecipientPersonId) {
    return defaults.billingRecipientLabel;
  }
  return companyOptions.find((option) => option.id === selectedRecipientId)
    ?.label;
}

function formatManagementFee(
  chargeManagementFee: "no" | "yes",
  feeMode: "flat" | "percentage",
  feeValue: string,
) {
  if (chargeManagementFee === "no") return "Not charged";

  const value = toFiniteNumber(feeValue) ?? 0;
  return feeMode === "flat"
    ? `${formatUsd(value)} per month while rent is active`
    : `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}% while rent is active`;
}

function RentCalculationSummary({
  finalPeriodAmount,
  firstPeriodAmount,
  rentSchedule,
}: {
  finalPeriodAmount: string;
  firstPeriodAmount: string;
  rentSchedule?: RentSchedule;
}) {
  const monthlyRent = toFiniteNumber(rentSchedule?.monthlyRentAmount);
  const firstMonthRent =
    toFiniteNumber(rentSchedule?.firstMonthRentAmount) ?? monthlyRent;
  const finalMonthRent =
    toFiniteNumber(rentSchedule?.finalMonthRentAmount) ?? monthlyRent;
  const dueDay = toFiniteNumber(rentSchedule?.rentDueDay);
  const startDate = parseCalendarDate(rentSchedule?.leaseStartDate);
  const endDate = parseCalendarDate(rentSchedule?.leaseEndDate);
  const firstOverride = toFiniteNumber(firstPeriodAmount);
  const finalOverride = toFiniteNumber(finalPeriodAmount);
  const sameMonthLease = isSameCalendarMonth(startDate, endDate);
  const leaseMonth =
    firstMonthRent !== null && startDate && sameMonthLease
      ? (firstOverride ??
        finalOverride ??
        prorateFirstMonth(firstMonthRent, startDate, endDate))
      : null;
  const firstMonth =
    firstMonthRent !== null && startDate
      ? (firstOverride ?? prorateFirstMonth(firstMonthRent, startDate, endDate))
      : null;
  const finalMonth =
    finalMonthRent !== null && endDate
      ? (finalOverride ?? prorateFinalMonth(finalMonthRent, endDate, startDate))
      : null;

  if (monthlyRent === null) return null;

  return (
    <section
      aria-labelledby="rent-preview-heading"
      className="mt-4 border-y border-border bg-muted/25 px-3 py-3"
    >
      <h3
        className="text-sm font-medium text-foreground"
        id="rent-preview-heading"
      >
        Rent preview
      </h3>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {sameMonthLease ? (
          <SummaryValue
            label="Lease month"
            value={leaseMonth === null ? "—" : formatUsd(leaseMonth)}
          />
        ) : (
          <>
            <SummaryValue
              label="First month"
              value={firstMonth === null ? "—" : formatUsd(firstMonth)}
            />
            <SummaryValue label="Regular month" value={formatUsd(monthlyRent)} />
            <SummaryValue
              label="Final month"
              value={finalMonth === null ? "—" : formatUsd(finalMonth)}
            />
          </>
        )}
        <SummaryValue
          label="Rent due"
          value={dueDay !== null ? `Day ${dueDay}` : "—"}
        />
      </dl>
    </section>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

type CalendarDate = { day: number; month: number; year: number };

function isSameCalendarMonth(
  startDate: CalendarDate | null,
  endDate: CalendarDate | null,
) {
  return (
    startDate !== null &&
    endDate !== null &&
    startDate.year === endDate.year &&
    startDate.month === endDate.month
  );
}

function parseCalendarDate(value?: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(year, month, 0).getDate();

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  return { day, month, year };
}

function prorateFirstMonth(
  monthlyRent: number,
  startDate: CalendarDate,
  endDate: CalendarDate | null,
) {
  const daysInMonth = new Date(startDate.year, startDate.month, 0).getDate();
  const lastBilledDay =
    endDate && isSameMonth(startDate, endDate) ? endDate.day : daysInMonth;
  const billedDays = Math.max(0, lastBilledDay - startDate.day + 1);

  return roundMoney((monthlyRent * billedDays) / daysInMonth);
}

function prorateFinalMonth(
  monthlyRent: number,
  endDate: CalendarDate,
  startDate: CalendarDate | null,
) {
  const daysInMonth = new Date(endDate.year, endDate.month, 0).getDate();
  const firstBilledDay =
    startDate && isSameMonth(endDate, startDate) ? startDate.day : 1;
  const billedDays = Math.max(0, endDate.day - firstBilledDay + 1);

  return roundMoney((monthlyRent * billedDays) / daysInMonth);
}

function isSameMonth(left: CalendarDate, right: CalendarDate | null) {
  return (
    right !== null && left.year === right.year && left.month === right.month
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatUsd(value: number) {
  return `USD ${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function toFiniteNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}
