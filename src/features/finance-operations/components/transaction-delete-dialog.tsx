"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCalendarDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { deleteTransactionAction } from "../transaction-delete-actions";
import type { TransactionDeleteEntry } from "../transaction-delete";
import type { FinanceOperationsActionState } from "../finance-operations.types";

type TransactionDeleteCopy = {
  description: string;
  pendingLabel: string;
  reasonLabel: string;
  submitLabel: string;
  successMessage: string;
  title: string;
};

export function TransactionDeleteDialog({
  open,
  onOpenChange,
  entry,
  canDelete,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TransactionDeleteEntry;
  canDelete: boolean;
  onSuccess?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const copy = transactionDeleteCopy(entry.kind);
  if (!canDelete) return null;
  return <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
    <DialogContent onEscapeKeyDown={event => { if (pending) event.preventDefault(); }} onInteractOutside={event => { if (pending) event.preventDefault(); }}>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogDescription>{copy.description}</DialogDescription>
      {open ? <DeleteForm copy={copy} key={entry.id} entry={entry} onClose={() => onOpenChange(false)} onPendingChange={setPending} onSuccess={onSuccess} /> : null}
    </DialogContent>
  </Dialog>;
}

function DeleteForm({
  copy,
  entry,
  onClose,
  onPendingChange,
  onSuccess,
}: {
  copy: TransactionDeleteCopy;
  entry: TransactionDeleteEntry;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess?: (message: string) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [key] = useState(() => `delete-transaction-${crypto.randomUUID()}`);
  const [state, action, pending] = useActionState(deleteTransactionAction, {} as FinanceOperationsActionState);
  const handledStateRef = useRef<FinanceOperationsActionState | null>(null);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => {
    if (state.status !== "success" || handledStateRef.current === state) return;
    handledStateRef.current = state;
    onSuccess?.(state.message ?? copy.successMessage);
    onClose();
    router.refresh();
  }, [copy.successMessage, onClose, onSuccess, router, state]);
  return <form action={action} className="space-y-4">
    {Object.entries({ kind: entry.kind, id: entry.id, propertyId: entry.propertyId, date: entry.date, idempotencyKey: key }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {entry.expectedLines ? <input type="hidden" name="expectedLines" value={JSON.stringify(entry.expectedLines)} /> : null}
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt>Transaction</dt><dd>{entry.label}</dd><dt>Date</dt><dd>{formatCalendarDate(entry.date)}</dd><dt>Amount</dt><dd className="tabular-nums">{formatMoney(entry.amount)}</dd>
    </dl>
    <label className="grid gap-1 text-sm">{copy.reasonLabel}<Input name="reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={8} maxLength={500} disabled={pending} /></label>
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 8}>{pending ? copy.pendingLabel : copy.submitLabel}</Button></div>
  </form>;
}

function transactionDeleteCopy(kind: TransactionDeleteEntry["kind"]): TransactionDeleteCopy {
  if (kind === "tenant-invoice") {
    return {
      description: "This removes the invoice from current balances and Rent & collections. Its audit history is retained, and no money is transferred or refunded. This does not cancel the lease or stop future rent charges.",
      pendingLabel: "Voiding…",
      reasonLabel: "Reason for voiding",
      submitLabel: "Void invoice",
      successMessage: "Invoice voided and removed from Rent & collections. Review the lease to prevent future charges.",
      title: "Void invoice",
    };
  }

  return {
    description: "This removes the transaction from current balances and reports. Its history is retained. No money is transferred or refunded.",
    pendingLabel: "Deleting…",
    reasonLabel: "Reason for deletion",
    submitLabel: "Delete transaction",
    successMessage: "Transaction deleted. Its history is retained.",
    title: "Delete transaction",
  };
}
