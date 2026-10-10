"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SelectControl } from "@/components/ui/select-control";
import { confirmDepositCustody, getDepositCustodyOptions } from "./custody-actions";

type Submission = Parameters<typeof confirmDepositCustody>[0];
export function DepositCustodyModal({ leaseId, accounts, onClose, onSuccess }: {
  leaseId: string; accounts: { id: string; displayName: string }[];
  onClose(): void; onSuccess(message: string): void;
}) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getDepositCustodyOptions>> | null>(null);
  const [depositId, setDepositId] = useState("");
  const [custodian, setCustodian] = useState("");
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [original, setOriginal] = useState<Submission | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    getDepositCustodyOptions(leaseId).then(value => { if (active) setOptions(value); })
      .catch(() => { if (active) setMessage("Custody details could not be loaded. Close and try again."); });
    return () => { active = false; };
  }, [leaseId]);
  async function save(value: Submission) {
    if (busy.current) return;
    busy.current = true; setPending(true); setOriginal(value); setMessage("");
    try {
      const result = await confirmDepositCustody(value);
      if (result.status === "success") onSuccess(result.message);
      else setMessage(result.message);
    } catch { setMessage("The result is unconfirmed. Retry the original custody details."); }
    finally { busy.current = false; setPending(false); }
  }
  return <Modal open title="Confirm deposit custody" onClose={() => { if (!busy.current) onClose(); }}
    description="Confirm who already holds this deposit using your supporting records.">
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">This records custody evidence. It does not receive, transfer or pay out money. Confirm the full deposit held and the liability account from your records.</p>
      {options?.status === "error" ? <p role="alert">{options.message}</p> : null}
      {options?.status === "success" && !original ? options.deposits.length ? <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void save({ leaseId, depositId, custodian: custodian as "ips" | "owner",
          ownerId: custodian === "owner" ? String(data.get("ownerId")) : null,
          liabilityAccountId: String(data.get("account")), date, held: String(data.get("held")),
          evidence: String(data.get("evidence")), key: crypto.randomUUID() });
      }}>
        <label className="grid gap-1.5 text-sm font-medium">Deposit<SelectControl ariaLabel="Deposit to verify" name="depositId" value={depositId} onValueChange={setDepositId} required placeholder="Choose a deposit" options={options.deposits.map(row => ({ value: row.id, label: `${row.label} — USD ${row.held} held` }))}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Who holds this deposit?<SelectControl ariaLabel="Deposit custodian" name="custodian" value={custodian} onValueChange={setCustodian} required placeholder="Choose from your records" options={[{ value: "ips", label: "IPS holds the deposit" }, { value: "owner", label: "The owner holds the deposit" }]}/></label>
        {custodian === "owner" ? <label className="grid gap-1.5 text-sm font-medium">Owner<SelectControl ariaLabel="Deposit custodian owner" name="ownerId" required placeholder="Choose the owner" options={options.owners.filter(row => !date || (!row.from || row.from <= date) && (!row.to || date < row.to)).map(row => ({ value: row.id, label: row.label }))}/></label> : null}
        <label className="grid gap-1.5 text-sm font-medium">Liability account<SelectControl ariaLabel="Custody liability account" name="account" required placeholder="Choose the liability account" options={accounts.map(row => ({ value: row.id, label: row.displayName }))}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Verified on<DatePickerField ariaLabel="Custody verification date" name="date" businessDate={options.businessDate} required onValueChange={setDate}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Full amount held (USD)<Input name="held" aria-label="Verified deposit held" inputMode="decimal" required pattern="[0-9]{1,12}\.[0-9]{2}" placeholder="0.00"/></label>
        <label className="grid gap-1.5 text-sm font-medium">Evidence reference<Input name="evidence" aria-label="Custody evidence reference" required minLength={8} maxLength={200}/></label>
        <Button type="submit" disabled={pending || !date || !custodian || !depositId}>Confirm existing deposit custody</Button>
      </form> : <p>All available deposits already have confirmed custody.</p> : null}
      {original ? <div className="space-y-3 text-sm"><p>Original confirmation: USD {original.held}, {original.custodian === "ips" ? "held by IPS" : "held by the selected owner"}, verified on {original.date}. Evidence: {original.evidence}.</p>
        <Button disabled={pending} onClick={() => void save(original)}>{pending ? "Confirming…" : "Retry original custody confirmation"}</Button></div> : null}
      {message ? <p role="status">{message}</p> : null}
      <Button variant="ghost" disabled={pending} onClick={onClose}>Close</Button>
    </div>
  </Modal>;
}
