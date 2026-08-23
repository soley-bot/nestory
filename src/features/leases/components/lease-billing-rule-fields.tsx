"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { RecordField } from "@/components/ui/record-form";
import { SelectControl } from "@/components/ui/select-control";
import type {
  LeaseBillingRule,
  LeaseBillingRuleFieldErrors,
  LeaseBillingFormConfig,
} from "@/features/leases/lease.types";

export function LeaseBillingRuleFields({
  companyOptions = [],
  defaults,
  fieldErrors,
  operationalTimezone = "UTC",
  organizationName = "our company",
  tenantRecipient,
}: {
  companyOptions?: LeaseBillingFormConfig["companyOptions"];
  defaults?: LeaseBillingRule | null;
  fieldErrors?: LeaseBillingRuleFieldErrors;
  operationalTimezone?: string;
  organizationName?: string;
  tenantRecipient: {
    id: string;
    label: string;
    partyType: "company" | "individual";
  } | null;
}) {
  const initialRecipientKind =
    defaults?.billingRecipientKind ?? tenantRecipient?.partyType ?? "individual";
  const [recipientKind, setRecipientKind] = useState<"company" | "individual">(
    initialRecipientKind,
  );
  const [recipientId, setRecipientId] = useState(
    defaults?.billingRecipientPersonId ??
      (initialRecipientKind === tenantRecipient?.partyType
        ? tenantRecipient?.id ?? ""
        : ""),
  );
  const [route, setRoute] = useState<"direct_to_owner" | "through_ips">(
    defaults?.collectionRoute ?? "through_ips",
  );
  const [feeMode, setFeeMode] = useState<"flat" | "percentage">(
    defaults?.managementFeeMode ?? "percentage",
  );
  const previousTenantRecipientRef = useRef(tenantRecipient);
  const selectedRecipientId = recipientId || (
    recipientKind === tenantRecipient?.partyType ? tenantRecipient.id : ""
  );

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

    const tenantCompany = tenantRecipient?.partyType === "company"
      ? [{ id: tenantRecipient.id, label: tenantRecipient.label }]
      : [];
    const selectedCompany =
      defaults?.billingRecipientKind === "company" &&
      defaults.billingRecipientPersonId &&
      !companyOptions.some(
        (option) => option.id === defaults.billingRecipientPersonId,
      )
        ? [{
            id: defaults.billingRecipientPersonId,
            label: defaults.billingRecipientLabel || "Current company",
          }]
        : [];

    return [...tenantCompany, ...selectedCompany, ...companyOptions]
      .filter(
        (option, index, options) =>
          options.findIndex((candidate) => candidate.id === option.id) === index,
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
        name="leaseStartProrationRule"
        type="hidden"
        value="actual_days"
      />
      <input
        name="leaseEndProrationRule"
        type="hidden"
        value="actual_days"
      />
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
            options={recipientOptions}
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
              { label: `Collected by ${organizationName}`, value: "through_ips" },
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
            onValueChange={(value) => setFeeMode(value as "flat" | "percentage")}
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
            defaultValue={defaults?.managementFeeValue ?? 0}
            max={feeMode === "percentage" ? "100" : undefined}
            min="0"
            name="managementFeeValue"
            required
            step={feeMode === "percentage" ? "0.0001" : "0.01"}
          />
        </RecordField>

        <RecordField
          error={fieldErrors?.chargeManagementFeeWhenActive?.[0]}
          label="Charge management fee?"
          name="chargeManagementFeeWhenActive"
          required
        >
          <SelectControl
            defaultValue={
              defaults?.chargeManagementFeeWhenActive === false ? "no" : "yes"
            }
            name="chargeManagementFeeWhenActive"
            options={[
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
            ]}
            required
          />
        </RecordField>
      </div>

      <details className="border-y border-border py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Advanced billing rules
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <RecordField
            error={fieldErrors?.fullManagementFeeDuringProration?.[0]}
            label="Keep full fee in pro-rata months?"
            name="fullManagementFeeDuringProration"
            required
          >
            <SelectControl
              defaultValue={
                (defaults?.fullManagementFeeDuringProration ?? false)
                  ? "yes"
                  : "no"
              }
              name="fullManagementFeeDuringProration"
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              required
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.rentCalculationTimezone?.[0]}
            label="Calculation timezone"
            name="rentCalculationTimezone"
            required
          >
            <Input
              defaultValue={
                defaults?.rentCalculationTimezone || operationalTimezone
              }
              name="rentCalculationTimezone"
              required
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.chargeThroughLeaseEnd?.[0]}
            label="Charge through lease end?"
            name="chargeThroughLeaseEnd"
            required
          >
            <SelectControl
              defaultValue={
                (defaults?.chargeThroughLeaseEnd ?? true) ? "yes" : "no"
              }
              name="chargeThroughLeaseEnd"
              options={[
                { label: "Yes", value: "yes" },
                { label: "No", value: "no" },
              ]}
              required
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.firstPeriodProratedAmount?.[0]}
            label="First-period amount (optional)"
            name="firstPeriodProratedAmount"
          >
            <NumberInput
              defaultValue={defaults?.firstPeriodProratedAmount ?? ""}
              min="0"
              name="firstPeriodProratedAmount"
              placeholder="Calculated from actual days"
              step="0.01"
            />
          </RecordField>

          <RecordField
            error={fieldErrors?.finalPeriodProratedAmount?.[0]}
            label="Final-period amount (optional)"
            name="finalPeriodProratedAmount"
          >
            <NumberInput
              defaultValue={defaults?.finalPeriodProratedAmount ?? ""}
              min="0"
              name="finalPeriodProratedAmount"
              placeholder="Calculated from actual days"
              step="0.01"
            />
          </RecordField>
        </div>
        <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>Short months use the last calendar day.</div>
          <div>Lease start and end use actual-day proration.</div>
          <div>Mid-period rent changes begin next full month.</div>
        </dl>
      </details>
    </div>
  );
}
