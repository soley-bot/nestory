"use client";

import { useState } from "react";
import Link from "next/link";
import { buildIssuedChargeEditHref } from "@/features/leases/lease-detail-route";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TransactionRow } from "../data/transaction-workspace";
import { TransactionDeleteDialog } from "./transaction-delete-dialog";
import { transactionUndoLabels, type TransactionDeleteEntry } from "../transaction-delete";

export function TransactionRowActions({ row, canCorrect, canViewLeases, canCorrectIssuedRent = false, onEditExpense, onDeleteExpense, onReviewPayments, returnTo }: {
  row: TransactionRow; canCorrect: boolean; canViewLeases: boolean; canCorrectIssuedRent?: boolean;
  onEditExpense?: () => void; onDeleteExpense?: () => void;
  onReviewPayments?: () => void;
  returnTo?: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const source = row.source;
  const canOpenCharge = canCorrect && canViewLeases && canCorrectIssuedRent;
  let entry: TransactionDeleteEntry | null = null;
  const hasPayments = source.kind === "charge" && source.invoice.settlements.some(settlement => !settlement.isReversed);
  if (source.kind === "charge") {
    if (!hasPayments) entry = { kind: "tenant-invoice", id: source.invoice.id, date: source.invoice.issueDate, amount: source.invoice.totalAmount, label: row.label, propertyId: row.propertyId, expectedLines: source.invoice.lines.map(line => ({ id: line.id, amount: line.amount.toFixed(2) })) };
  } else if (source.kind === "payment") {
    entry = { kind: source.settlement.route === "through_ips" ? "tenant-payment" : "owner-collection", id: source.settlement.id, date: source.settlement.date, amount: source.settlement.amount, label: row.label, propertyId: row.propertyId };
  }
  if (row.history || (!canCorrect && !onEditExpense && !onDeleteExpense)) return null;
  if (source.kind !== "charge" && source.kind !== "payment" && source.kind !== "expense") return null;
  if (source.kind === "expense" && !onEditExpense && !onDeleteExpense) return null;
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.label}`}><Ellipsis aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {source.kind === "charge" && canOpenCharge && source.invoice.generationSource === "lease_rules_v1" ? <DropdownMenuItem asChild><Link href={buildIssuedChargeEditHref(source.invoice.leaseId, { mode: "rent", invoiceId: source.invoice.id }, returnTo)}>Edit issued rent on lease</Link></DropdownMenuItem> : null}
        {onEditExpense ? <DropdownMenuItem onSelect={onEditExpense}>Edit</DropdownMenuItem> : null}
        {onDeleteExpense ? <DropdownMenuItem onSelect={onDeleteExpense}>{source.kind === "expense" && source.submission.status === "submitted" ? "Cancel expense" : "Reverse expense"}</DropdownMenuItem> : null}
        {canCorrect && entry ? <DropdownMenuItem onSelect={() => setDeleting(true)}>{transactionUndoLabels[entry.kind]}</DropdownMenuItem> : null}
        {canCorrect && hasPayments && onReviewPayments ? <DropdownMenuItem onSelect={onReviewPayments}>View linked payments</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {entry ? <TransactionDeleteDialog open={deleting} onOpenChange={setDeleting} entry={entry} canDelete={canCorrect} /> : null}
  </>;
}
