"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TransactionRow } from "../data/transaction-workspace";
import { TransactionDeleteDialog } from "./transaction-delete-dialog";
import type { TransactionDeleteEntry } from "../transaction-delete";

export function TransactionRowActions({ row, canCorrect, canViewLeases, canCorrectIssuedRent = false, onEditExpense, onDeleteExpense }: {
  row: TransactionRow; canCorrect: boolean; canViewLeases: boolean; canCorrectIssuedRent?: boolean;
  onEditExpense?: () => void; onDeleteExpense?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const source = row.source;
  let entry: TransactionDeleteEntry | null = null;
  let block = "";
  if (source.kind === "charge") {
    if (source.invoice.settlements.some(settlement => !settlement.isReversed)) block = "Review payments before deleting this charge";
    else entry = { kind: "tenant-invoice", id: source.invoice.id, date: source.invoice.issueDate, amount: source.invoice.totalAmount, label: row.label, propertyId: row.propertyId, expectedLines: source.invoice.lines.map(line => ({ id: line.id, amount: line.amount.toFixed(2) })) };
  } else if (source.kind === "payment") {
    entry = { kind: source.settlement.route === "through_ips" ? "tenant-payment" : "owner-collection", id: source.settlement.id, date: source.settlement.date, amount: source.settlement.amount, label: row.label, propertyId: row.propertyId };
  }
  if (row.history || (!canCorrect && !onEditExpense && !onDeleteExpense)) return null;
  if (source.kind === "expense" && !onEditExpense && !onDeleteExpense) return null;
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.label}`}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {source.kind === "charge" && canCorrect && canViewLeases && canCorrectIssuedRent && source.invoice.lines.some(line => line.lineType === "rent") ? <DropdownMenuItem asChild><Link href={`/leases/${source.invoice.leaseId}`}>Edit issued rent on lease</Link></DropdownMenuItem> : null}
        {onEditExpense ? <DropdownMenuItem onSelect={onEditExpense}>Edit</DropdownMenuItem> : null}
        {onDeleteExpense ? <DropdownMenuItem onSelect={onDeleteExpense}>Delete</DropdownMenuItem> : null}
        {canCorrect && entry ? <DropdownMenuItem onSelect={() => setDeleting(true)}>Delete</DropdownMenuItem> : null}
        {canCorrect && block ? <DropdownMenuItem disabled>{block}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {entry ? <TransactionDeleteDialog open={deleting} onOpenChange={setDeleting} entry={entry} canDelete={canCorrect} /> : null}
  </>;
}
