"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { carryForwardLeaseRenewalBillingAction, type LeaseActionState } from "@/features/leases/actions";
import type { LeaseSummary } from "@/features/leases/lease.types";
import { formatCalendarDate } from "@/lib/dates/format";
import { FinancialForm } from "@/lib/finance/financial-write-provider";

export function RenewalBillingRecovery({ lease }: { lease: LeaseSummary }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LeaseActionState, FormData>(carryForwardLeaseRenewalBillingAction, {});
  const [idempotencyKey] = useState(() => `renewal-billing:${crypto.randomUUID()}`);
  const term = lease.terms.filter(item => ["active", "upcoming"].includes(item.status))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const rule = term && term.endDate !== "infinity" ? lease.billingRules.find(item => {
    if (item.effectiveTo === "infinity" || item.effectiveTo >= term.endDate || item.effectiveFrom >= term.startDate) return false;
    const nextDate = nextCalendarDay(item.effectiveTo);
    return (item.effectiveTo === term.startDate || nextDate === term.startDate)
      && item.collectionRoute !== null && item.managementFeeMode !== null && item.managementFeeValue !== null
      && item.billingRecipientKind !== null && item.billingRecipientPersonId !== null
      && !lease.billingRules.some(other => other.id !== item.id && other.effectiveTo >= nextDate)
      && lease.terms.some(previous => previous.id !== term.id && nextCalendarDay(previous.endDate) === term.startDate);
  }) : undefined;

  useEffect(() => { if (state.status === "success") router.refresh(); }, [router, state.status]);
  if (!term || !rule) return null;
  return (
    <FinancialForm action={action} aria-label="Carry forward renewal billing" className="space-y-3 border-b border-border py-3 text-sm">
      <input name="leaseId" type="hidden" value={lease.id} />
      <input name="termId" type="hidden" value={term.id} />
      <input name="billingRuleId" type="hidden" value={rule.id} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <p>The renewal is saved. Carry forward the previous collection route, billing recipient and recurring fees from {formatCalendarDate(nextCalendarDay(rule.effectiveTo))} to {formatCalendarDate(term.endDate)}.</p>
      <p className="text-muted-foreground">{rule.billingRecipientLabel}; {rule.collectionRoute === "through_ips" ? "management collects" : "owner collects"}; {rule.chargeManagementFeeWhenActive ? `${rule.managementFeeValue}${rule.managementFeeMode === "percentage" ? "%" : " USD"} management fee` : "no management fee"}. Earlier billing history stays unchanged.</p>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      <Button disabled={pending || state.status === "success"} type="submit" variant="outline">{pending ? "Saving..." : "Carry forward renewal billing"}</Button>
    </FinancialForm>
  );
}

function nextCalendarDay(value: string) {
  if (value === "infinity") return value;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
