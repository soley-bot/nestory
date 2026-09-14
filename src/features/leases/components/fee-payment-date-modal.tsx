"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SelectControl } from "@/components/ui/select-control";
import {
  correctFeePaymentDateAction,
  listFeePaymentDateCandidatesAction,
  previewFeePaymentDateCorrectionAction,
  type FeePaymentDateCandidate,
  type FeePaymentDatePreview,
} from "@/features/leases/fee-payment-date-actions";

function blockerMessage(blocker: string) {
  if (/privileged_email_step_up_required|privileged email verification required/i.test(blocker)) return "Verify this signed-in session by email, then retry the correction.";
  if (/closed|financial_month_locked|locked.*period|period.*locked/i.test(blocker)) return "A financial month affected by this correction is closed. Reopen the period before continuing.";
  if (/payout|underfund_owner_cash|insufficient|negative/i.test(blocker)) return "The corrected date would leave insufficient owner cash on an affected date. Review the cash balance and later payouts.";
  if (/in_future|future_date/i.test(blocker)) return "The original and corrected payment dates must be on or before today's business date.";
  if (/owner_mismatch/i.test(blocker)) return "The settlement owner is not an owner on the corrected date. Check the ownership dates.";
  if (/stale|sources_changed/i.test(blocker)) return "The settlement changed. Preview the correction again.";
  if (/same.*date|date.*unchanged/i.test(blocker)) return "Choose a different payment date.";
  if (/source|conflict|reversed|eligible|already.*correct|not_correctable|not_found/i.test(blocker)) return "The original settlement is no longer eligible. Reload the lease before continuing.";
  return "This settlement could not be verified for correction. Reload the lease and preview again.";
}

export function FeePaymentDateModal({ leaseId, onClose, onSuccess }: {
  leaseId: string; onClose: () => void; onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<FeePaymentDateCandidate[] | null>(null);
  const [allocationId, setAllocationId] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<FeePaymentDatePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const idempotencyKey = useRef<string | null>(null);
  const selected = candidates?.find((candidate) => candidate.allocationId === allocationId);

  useEffect(() => {
    let active = true;
    listFeePaymentDateCandidatesAction(leaseId).then((result) => {
      if (!active) return;
      setCandidates(result.candidates ?? null);
      setMessage(result.message ?? null);
      const first = result.candidates?.[0];
      setAllocationId(first?.allocationId ?? "");
      setPaymentDate(first?.paymentDate ?? "");
    }).catch(() => {
      if (active) setMessage("Fee settlements could not be loaded. Try again.");
    });
    return () => { active = false; };
  }, [leaseId, reload]);

  function invalidatePreview() {
    revision.current += 1;
    setPreview(null);
    setMessage(null);
    idempotencyKey.current = null;
  }

  async function loadPreview() {
    const requestedRevision = revision.current;
    setPending(true);
    setPreview(null);
    setMessage(null);
    try {
      const result = await previewFeePaymentDateCorrectionAction({ allocationId, paymentDate });
      if (requestedRevision !== revision.current) return;
      setPreview(result.preview ?? null);
      setMessage(result.message ?? null);
    } catch {
      setMessage("The preview could not be loaded. Your changes are still here; try again.");
    } finally {
      setPending(false);
    }
  }

  async function applyCorrection() {
    if (!preview?.canApply || preview.allocationId !== allocationId || preview.newDate !== paymentDate || pending) return;
    setPending(true);
    setMessage(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const result = await correctFeePaymentDateAction({ allocationId, paymentDate, reason, previewHash: preview.previewHash, idempotencyKey: idempotencyKey.current });
      if (result.status === "success") {
        onSuccess(result.message ?? "Fee payment date corrected.");
        router.refresh();
      } else setMessage(result.message ?? "The correction could not be applied. Preview again.");
    } catch {
      setMessage("The correction could not be confirmed. Retry with the same details to check its result.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open title="Correct fee payment date" onClose={() => { if (!pending) onClose(); }}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">Set the actual payment date for a settled management fee. The original settlement remains in the audit history.</p>
        {candidates === null ? (
          <div role="status" className="text-sm">{message ?? "Loading fee settlements…"}{message ? <Button className="ml-2" variant="outline" onClick={() => { setMessage(null); setReload((value) => value + 1); }}>Try again</Button> : null}</div>
        ) : candidates.length === 0 ? <p role="status" className="text-sm">No eligible fee settlements are available for this lease.</p> : (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void loadPreview(); }}>
            <fieldset className="space-y-4" disabled={pending}>
              <label className="grid gap-1.5 text-sm font-medium">Fee settlement
                <SelectControl ariaLabel="Fee settlement" name="allocationId" value={allocationId} required options={candidates.map((candidate) => ({ value: candidate.allocationId, label: `${candidate.invoiceNumber} · ${candidate.amount.toFixed(2)} · ${candidate.paymentDate}` }))} onValueChange={(value) => {
                  invalidatePreview(); setAllocationId(value); setPaymentDate(candidates.find((candidate) => candidate.allocationId === value)?.paymentDate ?? "");
                }} />
              </label>
              {selected ? <p className="text-sm text-muted-foreground">Fee date: {selected.feeDate} · Recorded payment date: {selected.paymentDate}</p> : null}
              <label className="grid gap-1.5 text-sm font-medium">Actual payment date
                <DatePickerField key={allocationId} ariaLabel="Actual payment date" name="paymentDate" defaultValue={selected?.paymentDate ?? ""} required onValueChange={(value) => { invalidatePreview(); setPaymentDate(value); }} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">Reason
                <Input name="reason" required minLength={8} maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); idempotencyKey.current = null; }} />
              </label>
              <Button type="submit" variant="outline" disabled={pending || !paymentDate || paymentDate === selected?.paymentDate}>{pending ? "Working…" : "Preview correction"}</Button>
            </fieldset>
            {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
            {preview ? <div className="space-y-3 border-t border-border pt-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Payment date</dt><dd className="text-right">{preview.oldDate} → {preview.newDate}</dd>
                <dt className="text-muted-foreground">Settlement amount</dt><dd className="text-right tabular-nums">{preview.amount.toFixed(2)}</dd>
                <dt className="text-muted-foreground">Payment date effect on {preview.oldDate < preview.newDate ? preview.oldDate : preview.newDate}</dt><dd className="text-right tabular-nums">{preview.cashChangeOnEarlierDate > 0 ? "+" : ""}{preview.cashChangeOnEarlierDate.toFixed(2)}</dd>
                <dt className="text-muted-foreground">Owner ledger cash change</dt><dd className="text-right tabular-nums">{preview.currentBalanceChange > 0 ? "+" : ""}{preview.currentBalanceChange.toFixed(2)}</dd>
              </dl>
              {preview.currentBalanceChange !== 0 ? <p className="text-muted-foreground">Includes reconciliation of existing cash records, not a new payment.</p> : null}
              {preview.blockers.length ? <ul className="space-y-1 text-destructive" role="alert">{preview.blockers.map((blocker) => <li key={blocker}>{blockerMessage(blocker)}</li>)}</ul> : null}
              <Button type="button" disabled={pending || !preview.canApply || reason.trim().length < 8} onClick={() => void applyCorrection()}>Confirm payment date correction</Button>
            </div> : null}
          </form>
        )}
        <div className="flex justify-end"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button></div>
      </div>
    </Modal>
  );
}
