"use client";

import { useActionState } from "react";

import { LeaseBillingRuleFields } from "@/features/leases/components/lease-billing-rule-fields";

import type { LeaseBillingRule } from "@/features/leases/lease.types";
import { saveLeaseBillingAction } from "@/features/finance-operations/actions";

import type { FinanceLease, FinanceOperationsActionState, FinanceOperationsData } from "@/features/finance-operations/finance-operations.types";

import { formatMoneyDisplay } from "@/lib/money/format";

import { useStableActionId, useSuccess, FormFooter, SubmitButton, ActionMessage, DefinitionRows } from "./finance-form-primitives";
const actionInitialState: FinanceOperationsActionState = {};

export function BillingSetupForm({
  lease,
  onSuccess,
  operationalTimezone,
  organizationName,
  peopleOptions,
}: {
  lease: FinanceLease;
  onSuccess: (message: string) => void;
  operationalTimezone: string;
  organizationName: string;
  peopleOptions: FinanceOperationsData["peopleOptions"];
}) {
  const idempotencyKey = useStableActionId("billing");
  const [state, action] = useActionState(
    saveLeaseBillingAction,
    actionInitialState,
  );
  const defaults = toLeaseBillingRuleDefaults(lease, peopleOptions);
  useSuccess(state, onSuccess);
  return (
    <form action={action} className="space-y-4 p-4">
      <input name="leaseId" type="hidden" value={lease.id} />
      <input
        name="expectedCurrentBillingRuleId"
        type="hidden"
        value={lease.expectedCurrentBillingRuleId ?? ""}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />

      <DefinitionRows
        rows={[
          ["Property", lease.propertyLabel],
          ["Owner", lease.ownerLabel],
          ["Lease", `${lease.tenantLabel} · ${lease.unitLabel}`],
          ["Monthly rent", formatMoneyDisplay(lease.monthlyRent).primary],
        ]}
      />
      <p className="text-sm text-muted-foreground">
        {lease.billing
          ? "Repairs this lease-owned rule without changing generated invoices."
          : "Begins on the lease start date."}
      </p>
      <LeaseBillingRuleFields
        companyOptions={peopleOptions
          .filter((option) => option.partyType === "company")
          .map((option) => ({ id: option.id, label: option.label }))}
        defaults={defaults}
        operationalTimezone={operationalTimezone}
        organizationName={organizationName}
        rentSchedule={{
          currency: "USD",
          finalMonthRentAmount:
            lease.billingPreview?.finalMonthRent ?? lease.monthlyRent,
          firstMonthRentAmount:
            lease.billingPreview?.firstMonthRent ?? lease.monthlyRent,
          leaseEndDate: lease.billingPreview?.endDate ?? lease.endDate,
          leaseStartDate: lease.billingPreview?.startDate ?? lease.startDate,
          monthlyRentAmount: lease.monthlyRent,
        }}
        tenantRecipient={
          lease.tenantPersonId
            ? {
                id: lease.tenantPersonId,
                label: lease.tenantLabel,
                partyType:
                  peopleOptions.find(
                    (option) => option.id === lease.tenantPersonId,
                  )?.partyType === "company"
                    ? "company"
                    : "individual",
              }
            : null
        }
      />
      <ActionMessage state={state} />
      <FormFooter>
        <span />
        <SubmitButton label="Save billing rules" />
      </FormFooter>
    </form>
  );
}

function toLeaseBillingRuleDefaults(
  lease: FinanceLease,
  peopleOptions: FinanceOperationsData["peopleOptions"],
): LeaseBillingRule | null {
  const billing = lease.billing;
  if (!billing) return null;
  const tenantPartyType =
    peopleOptions.find((option) => option.id === lease.tenantPersonId)
      ?.partyType === "company"
      ? "company"
      : "individual";
  const billingRecipientKind =
    billing.billingRecipientKind ?? tenantPartyType;
  const billingRecipientPersonId =
    billing.billingRecipientPersonId ??
    (billingRecipientKind === tenantPartyType
      ? (lease.tenantPersonId ?? "")
      : "");
  return {
    ...billing,
    billingRecipientKind,
    billingRecipientLabel:
      peopleOptions.find(
        (option) => option.id === billingRecipientPersonId,
      )?.label ?? lease.tenantLabel,
    billingRecipientPersonId,
    collectionRoute: billing.collectionRoute ?? "through_ips",
    leaseEndProrationRule: billing.leaseEndProrationRule ?? "actual_days",
    leaseStartProrationRule: billing.leaseStartProrationRule ?? "actual_days",
    managementFeeMode: billing.managementFeeMode ?? "percentage",
    managementFeeValue: billing.managementFeeValue ?? 0,
    midPeriodRentChangeRule:
      billing.midPeriodRentChangeRule ?? "next_full_month",
    rentCalculationTimezone: billing.rentCalculationTimezone ?? "UTC",
    shortMonthDueDayRule:
      billing.shortMonthDueDayRule ?? "last_calendar_day",
    state: "current",
  };
}
