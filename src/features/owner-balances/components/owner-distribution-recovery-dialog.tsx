"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCalendarDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { previewOwnerDistributionRecoveryAction, confirmOwnerDistributionRecoveryAction, type OwnerDistributionRecoveryState } from "../owner-distribution-recovery-actions";

export function OwnerDistributionRecoveryDialog({ open, onOpenChange, withdrawalId, distributionDate, onSuccess }: {
  open: boolean; onOpenChange: (open: boolean) => void; withdrawalId: string; distributionDate: string; onSuccess: () => void;
}) {
  const [pending, setPending] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent className="sm:max-w-xl" onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
      <DialogTitle>Review related fee dates</DialogTitle>
      <DialogDescription>A later management fee may have used cash from an earlier period. Review the fee payment date and distribution together.</DialogDescription>
      {open ? <RecoveryForm withdrawalId={withdrawalId} distributionDate={distributionDate} onClose={() => onOpenChange(false)} onSuccess={onSuccess} onPendingChange={setPending} /> : null}
    </DialogContent>
  </Dialog>;
}

function RecoveryForm({ withdrawalId, distributionDate, onClose, onSuccess, onPendingChange }: {
  withdrawalId: string; distributionDate: string; onClose: () => void; onSuccess: () => void; onPendingChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const initial: OwnerDistributionRecoveryState = { status: "idle" };
  const [previewState, previewAction, previewPending] = useActionState(previewOwnerDistributionRecoveryAction, initial);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmOwnerDistributionRecoveryAction, initial);
  const [feePaymentDate, setFeePaymentDate] = useState("");
  const [reason, setReason] = useState("");
  const [key] = useState(() => `fee-recovery-${crypto.randomUUID()}`);
  const pending = previewPending || confirmPending;
  const preview = previewState.preview;
  const currentPreview = preview && preview.newDate === feePaymentDate && preview.newDistributionDate === distributionDate ? preview : null;
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => { if (confirmState.status === "success") { onClose(); onSuccess(); router.refresh(); } }, [confirmState, onClose, onSuccess, router]);
  return <div className="space-y-4">
    <form action={previewAction} className="space-y-3">
      <input type="hidden" name="withdrawalId" value={withdrawalId} /><input type="hidden" name="distributionDate" value={distributionDate} />
      <p className="text-sm">Distribution date: {formatCalendarDate(distributionDate)}</p>
      <label className="grid gap-1 text-sm">Correct fee payment date<DatePickerField name="feePaymentDate" ariaLabel="Correct fee payment date" defaultValue={feePaymentDate} onValueChange={setFeePaymentDate} required /></label>
      <p className="text-xs text-muted-foreground">Use the date supported by your payment records.</p>
      <Button type="submit" variant="outline" disabled={pending || !feePaymentDate}>{previewPending ? "Checking…" : "Preview both changes"}</Button>
    </form>
    {previewState.status === "error" ? <p role="alert" className="text-sm text-destructive">{previewState.message}</p> : null}
    {currentPreview ? <form action={confirmAction} className="space-y-4">
      {Object.entries({ withdrawalId, distributionDate, feePaymentDate, allocationId: currentPreview.allocationId, previewHash: currentPreview.previewHash, idempotencyKey: `${key}-${currentPreview.previewHash.slice(0, 12)}` }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <table className="w-full text-left text-sm" aria-label="Related date correction review"><thead className="bg-[var(--table-header-bg)]"><tr><th className="p-2">Transaction</th><th className="p-2">Original date</th><th className="p-2">Corrected date</th><th className="p-2 text-right">Amount</th></tr></thead><tbody>
        <tr><th className="p-2 font-medium">Management fee</th><td className="p-2">{formatCalendarDate(currentPreview.oldDate)}</td><td className="p-2">{formatCalendarDate(currentPreview.newDate)}</td><td className="p-2 text-right tabular-nums">{formatMoney(currentPreview.amount)}</td></tr>
        <tr><th className="p-2 font-medium">Owner distribution</th><td className="p-2">{formatCalendarDate(currentPreview.oldDistributionDate)}</td><td className="p-2">{formatCalendarDate(currentPreview.newDistributionDate)}</td><td className="p-2 text-right tabular-nums">{formatMoney(currentPreview.distributionAmount)}</td></tr>
      </tbody></table>
      <p className="text-sm">Current balance change: {formatMoney(currentPreview.currentBalanceChange)}</p>
      {!currentPreview.canApply ? <p role="alert" className="text-sm text-destructive">{previewState.message || "These dates cannot be applied. Review the original payment records."}</p> : <>
        <label className="grid gap-1 text-sm">Reason for correction<Input name="reason" value={reason} onChange={event => setReason(event.target.value)} minLength={8} maxLength={500} required disabled={pending} /></label>
        <p className="text-xs text-muted-foreground">Both dates update together. Amounts stay unchanged and the original records remain in history.</p>
        <Button type="submit" disabled={pending || reason.trim().length < 8}>{confirmPending ? "Saving…" : "Confirm both corrections"}</Button>
      </>}
      {confirmState.status === "error" ? <p role="alert" className="text-sm text-destructive">{confirmState.message}</p> : null}
    </form> : null}
    <div className="flex justify-end border-t pt-3"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button></div>
  </div>;
}
