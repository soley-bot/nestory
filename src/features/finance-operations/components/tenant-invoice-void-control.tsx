"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TenantInvoiceSummary } from "@/features/finance-operations/finance-operations.types";
import { TransactionDeleteDialog } from "./transaction-delete-dialog";

export function TenantInvoiceVoidControl({
  canCorrectFinance,
  invoice,
  onSuccess,
}: {
  canCorrectFinance: boolean;
  invoice: TenantInvoiceSummary;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasActiveSettlement = invoice.settlements.some(
    (settlement) => !settlement.isReversed,
  );
  const canVoid =
    canCorrectFinance &&
    invoice.paymentStatus !== "voided" &&
    !hasActiveSettlement;

  if (!canVoid) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="destructive">
        Void invoice
      </Button>
      <TransactionDeleteDialog
        canDelete={canVoid}
        entry={{
          amount: invoice.totalAmount,
          date: invoice.issueDate,
          expectedLines: invoice.lines.map((line) => ({
            amount: line.amount.toFixed(2),
            id: line.id,
          })),
          id: invoice.id,
          kind: "tenant-invoice",
          label: invoice.invoiceNumber,
          propertyId: invoice.propertyId,
        }}
        onOpenChange={setOpen}
        onSuccess={onSuccess}
        open={open}
      />
    </>
  );
}
