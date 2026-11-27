"use client";

import { FinancialForm, useFinancialWriteContext } from "@/lib/finance/financial-write-provider";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCalendarDate } from "@/lib/dates/format";
import { useBusinessDate } from "@/lib/dates/business-date-provider";
import { PILOT_ORGANIZATION_ID } from "@/lib/pilot-organization";
import { correctOwnerTransactionAction } from "../owner-transaction-correction-actions";
import { correctionChangesEntry, ownerCashCorrectionFields, type OwnerCashCorrectionEntry, type OwnerCashCorrectionFields } from "../owner-transaction-correction";
import type { OwnerCashActionState } from "../owner-cash-actions";
import { OwnerDistributionRecoveryDialog } from "./owner-distribution-recovery-dialog";

export function OwnerTransactionCorrectionDialog({ open, onOpenChange, propertyId, entry, canCorrectFinance, canRecoverOwnerDistribution = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; propertyId: string;
  entry: OwnerCashCorrectionEntry; canCorrectFinance: boolean; canRecoverOwnerDistribution?: boolean;
}) {
  const [pending, setPending] = useState(false);
  if (!canCorrectFinance) return null;
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" onInteractOutside={event => { if (pending) event.preventDefault(); }} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
      <DialogTitle>Correct owner {entry.kind}</DialogTitle>
      <DialogDescription className="break-words">Recorded {formatCalendarDate(entry.date)} · USD {entry.amount}{entry.reference ? ` · ${entry.reference}` : ""}</DialogDescription>
      {open ? <CorrectionForm canRecoverOwnerDistribution={canRecoverOwnerDistribution} key={entry.id} entry={entry} propertyId={propertyId} onClose={() => onOpenChange(false)} onPendingChange={setPending} /> : null}
    </DialogContent>
  </Dialog>;
}

function CorrectionForm({ entry, propertyId, onClose, onPendingChange, canRecoverOwnerDistribution }: {
  canRecoverOwnerDistribution: boolean; entry: OwnerCashCorrectionEntry; propertyId: string; onClose: () => void; onPendingChange: (pending: boolean) => void;
}) {
  const { getBusinessDateValue } = useBusinessDate();
  const singleSave = useFinancialWriteContext()?.organizationId === PILOT_ORGANIZATION_ID;
  const router = useRouter();
  const [date, setDate] = useState(entry.date);
  const [amount, setAmount] = useState(entry.amount);
  const [reference, setReference] = useState(entry.reference ?? "");
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  const [review, setReview] = useState<OwnerCashCorrectionFields | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const attempt = useRef<{ key: string; signature: string; fields: OwnerCashCorrectionFields } | null>(null);
  const [submitted, setSubmitted] = useState("");
  const signature = JSON.stringify([date, amount, reference, reason]);
  const [state, action, pending] = useActionState(correctOwnerTransactionAction, { status: "idle" } as OwnerCashActionState);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => { if (state.status === "success") { onClose(); router.refresh(); } }, [state, onClose, router]);

  function validate(event: FormEvent<HTMLFormElement>) {
    const result = ownerCashCorrectionFields.safeParse({ date, amount, reference, reason });
    const error = !result.success ? result.error.issues[0].message
      : result.data.date > getBusinessDateValue() ? "Choose a date on or before today."
      : !correctionChangesEntry(entry, result.data) ? "Change the date, amount, or reference before saving." : "";
    if (!result.success || error) { event.preventDefault(); setValidation(error); return; }
    setValidation("");
    const payload = JSON.stringify(result.data);
    if (attempt.current?.signature !== payload) {
      attempt.current = { key: `owner-correction-${crypto.randomUUID()}`, signature: payload, fields: result.data };
    }
    if (!singleSave && !review) {
      event.preventDefault();
      setReview(result.data);
      return;
    }
    setSubmitted(signature);
  }
  const rejection = state.status === "error" && submitted === signature ? state.message : undefined;
  return <FinancialForm draftGuard={{pending, saved: state.status === "success"}} onSubmit={validate} onChange={() => setValidation("")} action={data => {
    const current = attempt.current;
    if (!current) return;
    data.set("idempotencyKey", current.key);
    for (const [field, value] of Object.entries(current.fields)) data.set(field, value);
    action(data);
  }} className="space-y-4">
    <input type="hidden" name="propertyId" value={propertyId} />
    <input type="hidden" name="originalId" value={entry.id} />
    <input type="hidden" name="kind" value={entry.kind} />
    {review ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt>Corrected date</dt><dd>{formatCalendarDate(review.date)}</dd>
      <dt>Corrected amount</dt><dd>USD {review.amount}</dd>
      <dt>Reference</dt><dd className="break-words">{review.reference || "—"}</dd>
      <dt>Reason</dt><dd className="break-words">{review.reason}</dd>
    </dl> : <>
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1 text-sm">Date<DatePickerField ariaLabel="Correction date" name="date" defaultValue={date} onValueChange={setDate} required /></label>
      <label className="grid gap-1 text-sm">Amount (USD)<Input aria-label="Amount (USD)" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></label>
    </div>
    <label className="grid gap-1 text-sm">Reference<Input aria-label="Reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={240} /></label>
    <label className="grid gap-1 text-sm">Reason for correction<Input aria-label="Reason for correction" value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={500} required /></label>
    </>}
    {validation || rejection ? <p role="alert" className="text-sm text-destructive">{validation || rejection}</p> : null}
    {canRecoverOwnerDistribution && entry.kind === "distribution" && /cash/i.test(rejection ?? "") && date !== entry.date && Number(amount) === Number(entry.amount) && reference.trim() === (entry.reference ?? "") ? <>
      <Button type="button" variant="outline" onClick={() => setRecoveryOpen(true)}>Review related fee dates</Button>
      <OwnerDistributionRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} withdrawalId={entry.id} distributionDate={date} onSuccess={onClose} />
    </> : null}
    <div className="flex justify-end gap-2 border-t pt-3">
      <Button type="button" variant="outline" disabled={pending} onClick={review ? () => setReview(null) : onClose}>{review ? "Back to edit" : "Cancel"}</Button>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : singleSave ? "Save changes" : review ? "Confirm correction" : "Review correction"}</Button>
    </div>
  </FinancialForm>;
}
