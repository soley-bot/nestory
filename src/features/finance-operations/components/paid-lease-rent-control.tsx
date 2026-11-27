"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDate, formatLeaseMonth } from "@/lib/dates/format";
import { useFinancialFormData, useFinancialWriteContext } from "@/lib/finance/financial-write-provider";
import { formatMoney } from "@/lib/money/format";
import { confirmPaidLeaseRentAction, previewPaidLeaseRentAction } from "../actions";

type Review = NonNullable<Awaited<ReturnType<typeof previewPaidLeaseRentAction>>["data"]>;

export function PaidLeaseRentControl({ invoiceId, onSuccess }: { invoiceId: string; onSuccess: (message: string) => void }) {
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const makeIntent = useFinancialFormData();
  const session = useFinancialWriteContext();
  const available = !!session && !session.invalid && session.context.status === "open";

  function handleReview() {
    setError("");
    start(async () => {
      try {
        const result = await previewPaidLeaseRentAction(invoiceId);
        if (result.data) setReview(result.data);
        else setError(result.error);
      } catch {
        setError("Could not open the rent review. Try again.");
      }
    });
  }

  function handleConfirm() {
    if (!review) return;
    setError("");
    start(async () => {
      try {
        const result = await confirmPaidLeaseRentAction(invoiceId, review.token, makeIntent());
        if (result.data) onSuccess(`Rent confirmed for ${formatLeaseMonth(review.month, "long")}. Receipt ${review.receipt} is linked.`);
        else { setReview(undefined); setError(result.error); }
      } catch {
        setReview(undefined);
        setError("Refresh the invoice to check whether the correction was saved.");
      }
    });
  }

  return <section aria-label="Monthly rent correction" className="space-y-2">
    {review ? <>
      <p className="font-medium">{formatLeaseMonth(review.month, "long")} rent · {formatMoney(review.rent)}</p>
      <p className="text-sm">Owner management fee of {formatMoney(review.fee)} on {formatDate(review.month)}.</p>
      <p className="text-sm">Use the payment received on {formatDate(review.receivedDate)} · {review.receipt}.</p>
      <div className="flex gap-2">
        <Button type="button" disabled={!available || pending} onClick={handleConfirm}>Confirm monthly rent</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setReview(undefined)}>Cancel</Button>
      </div>
    </> : <Button type="button" variant="outline" disabled={pending || !available} onClick={handleReview}>Review as monthly rent</Button>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
