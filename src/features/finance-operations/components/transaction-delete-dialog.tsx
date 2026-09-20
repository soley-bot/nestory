"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCalendarDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { deleteTransactionAction } from "../transaction-delete-actions";
import type { TransactionDeleteEntry } from "../transaction-delete";
import type { FinanceOperationsActionState } from "../finance-operations.types";

export function TransactionDeleteDialog({ open, onOpenChange, entry, canDelete }: {
  open: boolean; onOpenChange: (open: boolean) => void; entry: TransactionDeleteEntry; canDelete: boolean;
}) {
  const [pending, setPending] = useState(false);
  if (!canDelete) return null;
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
      <DialogTitle>Delete transaction</DialogTitle>
      <DialogDescription>This removes the transaction from current balances and reports. Its history is retained. No money is transferred or refunded.</DialogDescription>
      {open ? <DeleteForm key={entry.id} entry={entry} onClose={() => onOpenChange(false)} onPendingChange={setPending} /> : null}
    </DialogContent>
  </Dialog>;
}

function DeleteForm({ entry, onClose, onPendingChange }: {
  entry: TransactionDeleteEntry; onClose: () => void; onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [key] = useState(() => `delete-transaction-${crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(deleteTransactionAction, {} as FinanceOperationsActionState);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => { if (state.status === "success") { onClose(); router.refresh(); } }, [state, onClose, router]);
  return <form action={action} className="space-y-4">
    {Object.entries({ kind: entry.kind, id: entry.id, propertyId: entry.propertyId, date: entry.date, idempotencyKey: key }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {entry.expectedLines ? <input type="hidden" name="expectedLines" value={JSON.stringify(entry.expectedLines)} /> : null}
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt>Transaction</dt><dd>{entry.label}</dd><dt>Date</dt><dd>{formatCalendarDate(entry.date)}</dd><dt>Amount</dt><dd className="tabular-nums">{formatMoney(entry.amount)}</dd>
    </dl>
    <label className="grid gap-1 text-sm">Reason for deletion<Input name="reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={8} maxLength={500} disabled={pending} /></label>
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 8}>{pending ? "Deleting…" : "Delete transaction"}</Button></div>
  </form>;
}
