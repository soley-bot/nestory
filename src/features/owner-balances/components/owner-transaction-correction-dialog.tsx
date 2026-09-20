"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCalendarDate } from "@/lib/dates/format";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { correctOwnerTransactionAction } from "../owner-transaction-correction-actions";
import { correctionChangesEntry, ownerCashCorrectionFields, type OwnerCashCorrectionEntry, type OwnerCashCorrectionFields } from "../owner-transaction-correction";
import type { OwnerCashActionState } from "../owner-cash-actions";
import { OwnerDistributionRecoveryDialog } from "./owner-distribution-recovery-dialog";

export function OwnerTransactionCorrectionDialog({ open, onOpenChange, propertyId, entry, canCorrectFinance }: {
  open: boolean; onOpenChange: (open: boolean) => void; propertyId: string;
  entry: OwnerCashCorrectionEntry; canCorrectFinance: boolean;
}) {
  const [pending, setPending] = useState(false);
  if (!canCorrectFinance) return null;
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent onInteractOutside={event => { if (pending) event.preventDefault(); }} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
      <DialogTitle>Correct owner {entry.kind}</DialogTitle>
      <DialogDescription>Review the changes before confirming. The original transaction stays in history, with a reversal and replacement.</DialogDescription>
      {open ? <CorrectionForm key={entry.id} entry={entry} propertyId={propertyId} onClose={() => onOpenChange(false)} onPendingChange={setPending} /> : null}
    </DialogContent>
  </Dialog>;
}

function CorrectionForm({ entry, propertyId, onClose, onPendingChange }: {
  entry: OwnerCashCorrectionEntry; propertyId: string; onClose: () => void; onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(entry.date);
  const [amount, setAmount] = useState(entry.amount);
  const [reference, setReference] = useState(entry.reference ?? "");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<OwnerCashCorrectionFields | null>(null);
  const [validation, setValidation] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `owner-correction-${crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(correctOwnerTransactionAction, { status: "idle" } as OwnerCashActionState);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => { if (state.status === "success") { onClose(); router.refresh(); } }, [state, onClose, router]);

  function reviewChanges() {
    const result = ownerCashCorrectionFields.safeParse({ date, amount, reference, reason });
    if (!result.success) { setValidation(result.error.issues[0].message); return; }
    if (result.data.date > getBusinessDateValue()) { setValidation("Choose a date on or before today."); return; }
    if (!correctionChangesEntry(entry, result.data)) { setValidation("Change the date, amount, or reference before reviewing the correction."); return; }
    setValidation("");
    setReview(result.data);
  }
  return review ? <form action={action} className="space-y-4">
    <input type="hidden" name="propertyId" value={propertyId} />
    <input type="hidden" name="originalId" value={entry.id} />
    <input type="hidden" name="kind" value={entry.kind} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    {Object.entries(review).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <table className="w-full text-sm" aria-label="Review transaction correction">
      <thead className="bg-[var(--table-header-bg)]"><tr className="border-b"><th className="py-2 text-left">Field</th><th className="py-2 text-left">Original</th><th className="py-2 text-left">Corrected</th></tr></thead>
      <tbody>
        <tr><th className="py-2 text-left font-medium">Date</th><td>{formatCalendarDate(entry.date)}</td><td>{formatCalendarDate(review.date)}</td></tr>
        <tr><th className="py-2 text-left font-medium">Amount (USD)</th><td className="tabular-nums">{entry.amount}</td><td className="tabular-nums">{review.amount}</td></tr>
        <tr><th className="py-2 text-left align-top font-medium">Reference</th><td className="max-w-40 break-words">{entry.reference || "—"}</td><td className="max-w-40 break-words">{review.reference || "—"}</td></tr>
      </tbody>
    </table>
    <p className="break-words text-sm"><span className="font-medium">Reason for correction: </span>{review.reason}</p>
    <p className="text-xs text-muted-foreground">Balances and reports will reflect the corrected transaction. Closed periods and available cash are checked when you confirm.</p>
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    {state.status === "error" && entry.kind === "distribution" && /cash/i.test(state.message ?? "") && review.date !== entry.date && Number(review.amount) === Number(entry.amount) && review.reference === (entry.reference ?? "") ? <>
      <Button type="button" variant="outline" onClick={() => setRecoveryOpen(true)}>Review related fee dates</Button>
      <OwnerDistributionRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} withdrawalId={entry.id} distributionDate={review.date} onSuccess={onClose} />
    </> : null}
    <div className="flex justify-end gap-2 border-t pt-3">
      <Button type="button" variant="outline" disabled={pending} onClick={() => { setReview(null); setIdempotencyKey(`owner-correction-${crypto.randomUUID()}`); }}>Back to edit</Button>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Confirm correction"}</Button>
    </div>
  </form> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); reviewChanges(); }}>
    <label className="grid gap-1 text-sm">Date<DatePickerField ariaLabel="Correction date" name="date" defaultValue={date} onValueChange={setDate} required /></label>
    <label className="grid gap-1 text-sm">Amount (USD)<Input aria-label="Amount (USD)" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></label>
    <label className="grid gap-1 text-sm">Reference<Input aria-label="Reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={240} /></label>
    <label className="grid gap-1 text-sm">Reason for correction<Input aria-label="Reason for correction" value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={500} required /></label>
    {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Review correction</Button></div>
  </form>;
}
