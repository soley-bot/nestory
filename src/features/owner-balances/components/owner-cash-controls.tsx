"use client";

import { FinancialForm, FinancialFormCancel } from "@/lib/finance/financial-write-provider";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SelectControl } from "@/components/ui/select-control";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Modal } from "@/components/ui/modal";
import { useBusinessDate } from "@/lib/dates/business-date-provider";
import { formatDate, formatLeaseMonth } from "@/lib/dates/format";
import { correctOwnerDistributionDateAction, recordOwnerContributionAction, type OwnerCashActionState } from "@/features/owner-balances/owner-cash-actions";
type Scope = { propertyId: string; ownerPersonId: string; ownerLabel: string; units?: { id: string; label: string; propertyId?: string | null }[]; unitId?: string; selectedMonth?: string };
type Correction = { withdrawalId: string; originalDate: string; amount: string };
export function OwnerContributionControl({ canRecordOwnerCash, ...scope }: Scope & { canRecordOwnerCash: boolean }) {
  return canRecordOwnerCash ? <OwnerCashDialog scope={scope} /> : null;
}
export function OwnerDistributionDateControl({ canCorrectFinance, propertyId, ...correction }: Correction & { canCorrectFinance: boolean; propertyId: string }) {
  return canCorrectFinance ? <OwnerCashDialog propertyId={propertyId} correction={correction} /> : null;
}
function OwnerCashDialog({ scope, propertyId, correction }: { scope?: Scope; propertyId?: string; correction?: Correction }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<OwnerCashActionState | null>(null);
  const label = correction ? "Correct date" : "Record owner contribution";
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => { setSaved(null); setOpen(true); }}>{label}</Button>
    <Modal open={open} size="compact" onClose={() => setOpen(false)} title={correction ? "Correct owner distribution date" : label} description={correction ? "Confirm the new date and reason. This reverses the original distribution and records its replacement for the same amount." : "Use this when the owner pays new money into the property account."}>
      {open ? <OwnerCashForm scope={scope} propertyId={propertyId} correction={correction} onClose={() => setOpen(false)} onSuccess={(value) => { setSaved(value); setOpen(false); }} /> : null}
    </Modal>
    {saved ? <p role="status" className="basis-full text-sm text-success">
      {saved.message} {saved.activityHref ? <Link className="underline underline-offset-2" href={saved.activityHref}>View owner account activity</Link> : null}
    </p> : null}
  </>;
}
function OwnerCashForm({ scope, propertyId, correction, onClose, onSuccess }: {
  scope?: Scope; propertyId?: string; correction?: Correction; onClose: () => void; onSuccess: (state: OwnerCashActionState) => void;
}) {
  const { getBusinessDateValue } = useBusinessDate();
  const router = useRouter();
  const today = getBusinessDateValue();
  const selectedMonth = scope?.selectedMonth || today.slice(0, 7);
  const initialDate = correction?.originalDate ?? (selectedMonth === today.slice(0, 7) ? today : "");
  const [eventDate, setEventDate] = useState(initialDate);
  const [key] = useState(() => `owner-cash-${globalThis.crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(correction ? correctOwnerDistributionDateAction : recordOwnerContributionAction, { status: "idle" } as OwnerCashActionState);
  useEffect(() => { if (state.status === "success") { onSuccess(state); router.refresh(); } }, [state, onSuccess, router]);
  const dateLabel = correction ? "New date" : "Contribution date";
  return <FinancialForm draftGuard={{pending, saved: state.status === "success"}} action={action} onReset={event => event.preventDefault()}>
    <input name="propertyId" type="hidden" value={scope?.propertyId ?? propertyId} />
    <input name="idempotencyKey" type="hidden" value={key} />
    <div className="space-y-4 p-4">
      {correction ? <>
        <input name="withdrawalId" type="hidden" value={correction.withdrawalId} />
        <dl className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm"><dt>Original date</dt><dd>{formatDate(correction.originalDate)}</dd><dt>Distribution amount</dt><dd>{correction.amount} USD</dd></dl>
      </> : <>
        <input name="ownerPersonId" type="hidden" value={scope?.ownerPersonId} />
        <input name="currency" type="hidden" value="USD" />
        <dl className="flex flex-wrap gap-x-2 text-sm"><dt className="text-muted-foreground">Owner</dt><dd className="font-medium">{scope?.ownerLabel}</dd></dl>
        {scope?.units ? <label className="grid min-w-0 gap-1 text-sm">Unit
          <SelectControl ariaLabel="Contribution unit" name="unitId" defaultValue={scope.unitId ?? ""} options={[{ value: "", label: "Property-wide" }, ...scope.units.filter(unit => unit.propertyId === scope.propertyId).map(unit => ({ value: unit.id, label: unit.label }))]} />
        </label> : null}
      </>}
      <div className={correction ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {correction ? null : <label className="grid min-w-0 gap-1 text-sm">Amount (USD)
          <NumberInput currencyPaste aria-label="Amount (USD)" name="amount" required placeholder="0.00" />
        </label>}
        <label className="grid min-w-0 gap-1 text-sm">{dateLabel}
          <DatePickerField ariaLabel={dateLabel} name={correction ? "distributionDate" : "eventDate"} defaultValue={initialDate} initialMonth={selectedMonth} onValueChange={setEventDate} required />
        </label>
      </div>
      {correction ? null : <p className="text-xs text-muted-foreground">
        {eventDate ? `Appears under Owner funding contributions for ${formatLeaseMonth(eventDate, "long")}.` : `Choose the day the owner paid in ${formatLeaseMonth(`${selectedMonth}-01`, "long")}.`}
      </p>}
      <label className="grid gap-1 text-sm">Reason
        <Input aria-label="Reason" name="reason" required minLength={correction ? 8 : 3} maxLength={500} />
      </label>
      {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
      <FinancialFormCancel variant="outline" onClick={onClose} disabled={pending}>Cancel</FinancialFormCancel>
      <Button type="submit" disabled={pending || !eventDate}>{pending ? "Saving…" : correction ? "Confirm date correction" : "Record contribution"}</Button>
    </div>
  </FinancialForm>;
}
