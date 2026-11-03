"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { updateDepositRequirementAction, type DepositRequirementState } from "@/features/leases/deposit-requirement-actions";
import type { LeaseSummary } from "@/features/leases/lease.types";

export function DepositRequirementForm({ lease, onClose, onSuccess }: {
  lease: LeaseSummary;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [deposit] = useState(() => lease.deposits.find(item => item.typeValue === "security"));
  const [expectedAmount] = useState(() => deposit?.amount ?? Number(lease.formValues.depositAmount || 0));
  const [amount, setAmount] = useState(expectedAmount.toFixed(2));
  const [reason, setReason] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<DepositRequirementState, FormData>(async (previous, data) => {
    try { return await updateDepositRequirementAction(previous, data); }
    catch { return { status: "error", message: "The save could not be confirmed. Your changes are still here; retry with the same details." }; }
  }, {});
  useEffect(() => {
    if (state.status !== "success") return;
    onSuccess(state.message ?? "Required deposit updated.");
    onClose();
    router.refresh();
  }, [state, onClose, onSuccess, router]);

  return <RecordForm action={action} onCancel={onClose} state={state} pending={pending}
    ariaLabel="Edit required deposit" savingLabel="Saving required deposit…" saveLabel="Save required deposit">
    <input type="hidden" name="leaseId" value={lease.id} />
    <input type="hidden" name="expectedDepositId" value={deposit?.id ?? ""} />
    <input type="hidden" name="expectedAmount" value={expectedAmount.toFixed(2)} />
    <input type="hidden" name="idempotencyKey" value={key} />
    <p className="text-sm text-muted-foreground">Enter the deposit agreed in the lease. It can differ from rent. Use 0 if no deposit is required.</p>
    <RecordField label={`Required deposit (${deposit?.currency ?? "USD"})`} name="amount" required>
      <NumberInput name="amount" min="0" max="999999999999.99" step="0.01" required
        value={amount} onChange={event => setAmount(event.target.value)} />
    </RecordField>
    <p className="text-sm text-muted-foreground">Held balance: {deposit?.heldBalanceDisplay.primary ?? "USD 0.00"}. Receipts, refunds and the held balance stay unchanged.</p>
    <RecordField label="Reason for change" name="reason" required>
      <Input name="reason" minLength={8} maxLength={500} required value={reason}
        onChange={event => setReason(event.target.value)} />
    </RecordField>
  </RecordForm>;
}
