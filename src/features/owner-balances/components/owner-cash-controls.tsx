"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getBusinessDateValue } from "@/lib/dates/business-date";
import { correctOwnerDistributionDateAction, recordOwnerContributionAction, type OwnerCashActionState } from "@/features/owner-balances/owner-cash-actions";
type Scope = { propertyId: string; ownerPersonId: string; ownerLabel: string };
type Correction = { withdrawalId: string; originalDate: string; amount: string };
export function OwnerContributionControl({ canRecordOwnerCash, ...scope }: Scope & { canRecordOwnerCash: boolean }) {
  return canRecordOwnerCash ? <OwnerCashDialog scope={scope} /> : null;
}
export function OwnerDistributionDateControl({ canCorrectFinance, propertyId, ...correction }: Correction & { canCorrectFinance: boolean; propertyId: string }) {
  return canCorrectFinance ? <OwnerCashDialog propertyId={propertyId} correction={correction} /> : null;
}
function OwnerCashDialog({ scope, propertyId, correction }: { scope?: Scope; propertyId?: string; correction?: Correction }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const label = correction ? "Correct date" : "Record owner contribution";
  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" size="sm" variant="outline">{label}</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>{correction ? "Correct owner distribution date" : label}</DialogTitle>
        <DialogDescription>{correction ? "Confirm the new date and reason. This reverses the original distribution and records its replacement for the same amount." : "Record cash received from this owner for the property."}</DialogDescription>
        {open ? <OwnerCashForm scope={scope} propertyId={propertyId} correction={correction} onClose={() => setOpen(false)} onSuccess={(value) => { setMessage(value); setOpen(false); }} /> : null}
      </DialogContent>
    </Dialog>
    {message ? <p role="status" className="text-xs text-success">{message}</p> : null}
  </>;
}
function OwnerCashForm({ scope, propertyId, correction, onClose, onSuccess }: {
  scope?: Scope; propertyId?: string; correction?: Correction; onClose: () => void; onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [key] = useState(() => `owner-cash-${globalThis.crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(correction ? correctOwnerDistributionDateAction : recordOwnerContributionAction, { status: "idle" } as OwnerCashActionState);
  useEffect(() => { if (state.status === "success") { onSuccess(state.message ?? "Saved."); router.refresh(); } }, [state, onSuccess, router]);
  return <form action={action} onReset={event => event.preventDefault()} className="space-y-4">
    <input name="propertyId" type="hidden" value={scope?.propertyId ?? propertyId} />
    <input name="idempotencyKey" type="hidden" value={key} />
    {correction ? <>
      <input name="withdrawalId" type="hidden" value={correction.withdrawalId} />
      <dl className="grid grid-cols-2 gap-2 rounded-md border p-3"><dt>Original date</dt><dd>{correction.originalDate}</dd><dt>Distribution amount</dt><dd>{correction.amount} USD</dd></dl>
    </> : <>
      <input name="ownerPersonId" type="hidden" value={scope?.ownerPersonId} />
      <input name="currency" type="hidden" value="USD" />
      <p className="text-sm">Owner: {scope?.ownerLabel}</p>
      <label className="grid gap-1 text-sm">Amount (USD)<Input aria-label="Amount (USD)" name="amount" inputMode="decimal" required placeholder="0.00" /></label>
    </>}
    <label className="grid gap-1 text-sm">{correction ? "New date" : "Contribution date"}<DatePickerField ariaLabel={correction ? "New date" : "Contribution date"} name={correction ? "distributionDate" : "eventDate"} defaultValue={correction?.originalDate ?? getBusinessDateValue()} required /></label>
    <label className="grid gap-1 text-sm">Reason<Input aria-label="Reason" name="reason" required minLength={correction ? 8 : 3} maxLength={500} /></label>
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : correction ? "Confirm date correction" : "Record contribution"}</Button></div>
  </form>;
}
