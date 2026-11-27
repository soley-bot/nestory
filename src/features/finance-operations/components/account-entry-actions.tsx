"use client";

import Link from "next/link";
import { useState } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OwnerTransactionCorrectionDialog } from "@/features/owner-balances/components/owner-transaction-correction-dialog";
import type { PropertyAccountEntry } from "../finance-operations.types";
import { formatCalendarDate } from "@/lib/dates/format";
import { formatMoney } from "@/lib/money/format";
import { TransactionDeleteDialog } from "./transaction-delete-dialog";
import { transactionUndoLabels } from "../transaction-delete";

export function AccountEntryActions({ entry, propertyLabel, canCorrectFinance, canRecoverOwnerDistribution = false, sourceAction }: {
  entry: PropertyAccountEntry;
  propertyLabel: string;
  canCorrectFinance: boolean;
  canRecoverOwnerDistribution?: boolean;
  sourceAction?: { label: string; onSelect?: () => void; href?: string };
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const source = entry.source;
  const cash = source?.kind === "distribution" || source?.kind === "contribution" ? source : null;
  const editable = canCorrectFinance && cash && !cash.isReversed && !cash.blockedReason;
  const undoLabel = cash?.kind === "contribution" ? transactionUndoLabels.contribution : transactionUndoLabels.distribution;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.label} on ${formatCalendarDate(entry.date)}`}><Ellipsis aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>View transaction</DropdownMenuItem>
        {editable ? <><DropdownMenuItem onSelect={() => setCorrectionOpen(true)}>Edit</DropdownMenuItem><DropdownMenuItem onSelect={() => setDeleteOpen(true)}>{undoLabel}</DropdownMenuItem></> : null}
        {sourceAction?.href ? <DropdownMenuItem asChild><Link href={sourceAction.href}>{sourceAction.label}</Link></DropdownMenuItem> : sourceAction ? <DropdownMenuItem onSelect={sourceAction.onSelect}>{sourceAction.label}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transaction details</DialogTitle><DialogDescription>{entry.label} · {propertyLabel}</DialogDescription></DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
          <dt>Date</dt><dd>{formatCalendarDate(entry.date)}</dd>
          <dt>Amount</dt><dd>{formatMoney(entry.amount)}</dd>
          <dt>Balance after</dt><dd>{formatMoney(entry.runningBalance)}</dd>
          <dt>Reference</dt><dd>{source?.reference || "No reference"}</dd>
          {entry.note ? <><dt>Details</dt><dd>{entry.note}</dd></> : null}
        </dl>
        {!source ? <p className="text-muted-foreground">This entry is available for reference. Its source is unavailable for correction here.</p> : null}
        {source?.blockedReason ? <p className="text-muted-foreground">{source.blockedReason}</p> : null}
        {sourceAction?.href ? <Button asChild variant="outline"><Link href={sourceAction.href}>{sourceAction.label}</Link></Button> : sourceAction?.onSelect ? (
          <Button variant="outline" onClick={() => { setDetailsOpen(false); sourceAction.onSelect?.(); }}>{sourceAction.label}</Button>
        ) : null}
        {editable ? <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => { setDetailsOpen(false); setDeleteOpen(true); }}>{undoLabel}</Button>
          <Button onClick={() => { setDetailsOpen(false); setCorrectionOpen(true); }}>Edit</Button>
        </div> : null}
      </DialogContent>
    </Dialog>
    {editable ? <OwnerTransactionCorrectionDialog canRecoverOwnerDistribution={canRecoverOwnerDistribution} open={correctionOpen} onOpenChange={setCorrectionOpen} canCorrectFinance propertyId={entry.propertyId} entry={{ id: cash.id, kind: cash.kind as "distribution" | "contribution", date: entry.date, amount: entry.amount.toFixed(2), reference: cash.reference }} /> : null}
    {editable ? <TransactionDeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} canDelete entry={{ id: cash.id, kind: cash.kind as "distribution" | "contribution", date: entry.date, amount: entry.amount, label: entry.label, propertyId: entry.propertyId }} /> : null}
  </>;
}
