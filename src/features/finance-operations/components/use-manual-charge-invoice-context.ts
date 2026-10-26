"use client";

import { useFinancialFormData, useFinancialWriteContext } from "@/lib/finance/financial-write-provider";
import { useEffect, useMemo, useState } from "react";
import { loadManualChargeInvoiceContext } from "../manual-charge-invoice-context";

export function useManualChargeInvoiceContext(enabled: boolean, leaseId: string, billingPeriod: string) {
  const createFinancialFormData = useFinancialFormData();
  const financialSession = useFinancialWriteContext();
  const blocked = financialSession?.invalid ?? false;
  const [attempt, setAttempt] = useState(0);
  // Object identity changes even when a later selection returns to the same
  // lease/month. A completed earlier check must never unlock a new request.
  const request = useMemo(() => ({ enabled, leaseId, billingPeriod, attempt, blocked }), [enabled, leaseId, billingPeriod, attempt, blocked]);
  const [result, setResult] = useState<{
    request: typeof request;
    invoice?: Awaited<ReturnType<typeof loadManualChargeInvoiceContext>>;
    error?: string;
  }>();
  useEffect(() => {
    if (!request.enabled || !request.leaseId || request.blocked) return;
    let cancelled = false;
    loadManualChargeInvoiceContext({ leaseId: request.leaseId, billingPeriod: request.billingPeriod }, createFinancialFormData()).then(invoice => {
      if (!cancelled) setResult({ request, invoice });
    }).catch(() => {
      if (!cancelled) setResult({ request, error: "Could not verify this month's invoice. Retry before adding the charge." });
    });
    return () => { cancelled = true; };
  }, [request, createFinancialFormData]);
  const current = result?.request === request ? result : undefined;
  return {
    invoice: current?.invoice,
    error: current?.error,
    ready: !enabled || Boolean(!blocked && leaseId && current && !current.error),
    retry: () => setAttempt(value => value + 1),
  };
}
