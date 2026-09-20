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

export function AccountEntryActions({ entry, propertyLabel, canCorrectFinance, sourceAction }: {
  entry: PropertyAccountEntry;
  propertyLabel: string;
  canCorrectFinance: boolean;
  sourceAction?: { label: string; onSelect?: () => void; href?: string };
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const source = entry.source;
  const cash = source?.kind === "distribution" || source?.kind === "contribution" ? source : null;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.label} on ${formatCalendarDate(entry.date)}`}><Ellipsis aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>View transaction</DropdownMenuItem>
        {canCorrectFinance && cash && !cash.blockedReason ? <><DropdownMenuItem onSelect={() => setCorrectionOpen(true)}>Edit</DropdownMenuItem><DropdownMenuItem onSelect={() => setDeleteOpen(true)}>Delete</DropdownMenuItem></> : null}
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
        {source?.kind === "lease" ? <p className="text-muted-foreground">To correct an issued fee, open the lease and choose Manage lease, then Correct management fee.</p> : null}
        {source?.blockedReason ? <p className="text-muted-foreground">{source.blockedReason}</p> : null}
      </DialogContent>
    </Dialog>
    {cash ? <OwnerTransactionCorrectionDialog open={correctionOpen} onOpenChange={setCorrectionOpen} canCorrectFinance={canCorrectFinance && !cash.blockedReason} propertyId={entry.propertyId} entry={{ id: cash.id, kind: cash.kind as "distribution" | "contribution", date: entry.date, amount: entry.amount.toFixed(2), reference: cash.reference }} /> : null}
    {cash ? <TransactionDeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} canDelete={canCorrectFinance && !cash.blockedReason} entry={{ id: cash.id, kind: cash.kind as "distribution" | "contribution", date: entry.date, amount: entry.amount, label: entry.label, propertyId: entry.propertyId }} /> : null}
  </>;
}
