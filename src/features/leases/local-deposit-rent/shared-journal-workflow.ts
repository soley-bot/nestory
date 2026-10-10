import "server-only";
import { z } from "zod";
import type { DepositRentDraft, DepositRentLocalActions, DepositRentPreview, DepositRentView } from "./contracts";
import { sharedJournalPayloadSchema, type SharedDepositJournalPort, type SharedJournalIntent } from "./shared-journal-contract";
import type { LocalDepositRentSnapshot } from "./candidate-reader";
import { SharedJournalError } from "./shared-journal-adapter";
export type SharedJournalView = DepositRentView & { businessDate: string; lastResolvedMessage?: string };
export type SharedJournalActions = Omit<DepositRentLocalActions, "list" | "confirm"> & {
  list(leaseId: string): Promise<{ status: "success"; value: SharedJournalView } | { status: "error"; message: string }>;
  confirm(input: { leaseId: string; token: string; idempotencyKey: string }): Promise<{ status: "success"; value: { message: string } } | { status: "error"; message: string; recoveryState?: "unused" | "original" }>;
};
export type SharedJournalWorkflowDependencies = { journal: SharedDepositJournalPort; readSnapshot(leaseId: string): Promise<{ snapshot: LocalDepositRentSnapshot; permissions: readonly string[] }> };
const confirmSchema = z.strictObject({ leaseId: z.uuid(), token: z.uuid(), idempotencyKey: z.uuid() });
const cents = (v: string) => BigInt(v.replace(".", ""));
const money = (v: bigint) => `${v < BigInt(0) ? "-" : ""}${(v < BigInt(0) ? -v : v) / BigInt(100)}.${String((v < BigInt(0) ? -v : v) % BigInt(100)).padStart(2, "0")}`;
const proof = (r: SharedJournalIntent) => ({ token: r.token, idempotencyKey: r.idempotencyKey, payloadHash: r.payloadHash, revision: r.revision });
const allowed = (permissions: readonly string[], op: "apply" | "reverse") => ["leases.view", "finance.view", "leases.change_terms", op === "apply" ? "finance.record_payments" : "finance.correct_records"].every(p => permissions.includes(p));
function effects(s: LocalDepositRentSnapshot, r: SharedJournalIntent): DepositRentPreview {
  const d = r.payload, original = d.operation === "reverse" ? s.applications.find(row => row.id === d.applicationId) : undefined;
  const deposit = s.deposits.find(row => row.id === (d.operation === "apply" ? d.depositId : original?.depositId)), invoice = s.invoices.find(row => row.id === (d.operation === "apply" ? d.invoiceId : original?.invoiceId));
  if (!deposit || !invoice || r.selectedScope.propertyId !== s.propertyId || r.selectedScope.unitId !== s.unitId) throw new SharedJournalError(409, "Original selected scope could not be verified.");
  const amount = d.operation === "apply" ? d.amount : original!.amount, signed = cents(amount) * (d.operation === "apply" ? BigInt(1) : -BigInt(1));
  return { token: r.token, idempotencyKey: r.idempotencyKey, operation: d.operation, date: d.date, amount, heldAfter: money(cents(deposit.held) - signed), outstandingAfter: money(cents(invoice.outstanding) - signed), custodyChange: money(-signed), ownerCashChange: deposit.custodian === "ips" ? money(signed) : "0.00" };
}
// Additive shared backend for the actual modal controls. No mounted actions,
// filesystem persistence, frontend key generation or finance-only read fallback.
export function createSharedJournalWorkflow(deps: SharedJournalWorkflowDependencies): SharedJournalActions {
  const error = () => ({ status: "error" as const, message: "The action could not be confirmed. Keep the original saved details and retry after access or service recovery." });
  return {
    list: async leaseId => {
      try {
        z.uuid().parse(leaseId); const { snapshot: s, permissions } = await deps.readSnapshot(leaseId), r = await deps.journal.readCurrent(leaseId);
        const view: SharedJournalView = { businessDate: s.businessDate, leaseLabel: s.leaseLabel, canApply: allowed(permissions, "apply"), canReverse: allowed(permissions, "reverse"),
          deposits: s.deposits.map(row => ({ id: row.id, label: row.label, amount: row.held, eligible: !row.archived && row.custodyVerified && row.custodian !== null && row.singleUnchangedOwner && row.custodyReconciles && cents(row.held) > BigInt(0), custodianLabel: !row.custodyVerified || row.custodian === null ? "Deposit custody is not verified" : row.custodian === "ips" ? "IPS holds the deposit" : "The owner holds the deposit" })),
          invoices: s.invoices.map(row => ({ id: row.id, label: row.label, amount: row.outstanding, issued: row.issued, rentLines: row.rentLines.map(line => ({ id: line.id, label: line.label, amount: line.outstanding })) })), applications: s.applications.filter(row => row.active && !row.consumed).map(row => ({ id: row.id, label: row.label, amount: row.amount })) };
        if (r?.state === "attempted") {
          const payload = r.payload, amount = payload.operation === "apply" ? payload.amount : s.applications.find(row => row.id === payload.applicationId)?.amount;
          if (!amount) throw new SharedJournalError(409, "Original amount unavailable; review required.");
          view.recovery = { token: r.token, idempotencyKey: r.idempotencyKey, operation: payload.operation, date: payload.date, amount, reason: payload.reason };
        }
        if (r?.state === "resolved") view.lastResolvedMessage = r.result!.message;
        return { status: "success", value: view };
      } catch { return error(); }
    },
    preview: async (input: DepositRentDraft) => {
      try {
        const d = sharedJournalPayloadSchema.parse(input), r = await deps.journal.prepare(d); const { snapshot: s } = await deps.readSnapshot(d.leaseId);
        if (r.state !== "preview" || r.snapshotHash !== s.fingerprint) throw new SharedJournalError(409, "Unused preview changed. Refresh its details.");
        return { status: "success", value: effects(s, r) };
      } catch { return { status: "error", message: "The preview could not be confirmed. Refresh only an unused preview; any original attempted action must be recovered first." }; }
    },
    confirm: async input => {
      let executeRequested = false;
      try {
        const checked = confirmSchema.parse(input), r = await deps.journal.readCurrent(checked.leaseId);
        if (!r || r.token !== checked.token || r.idempotencyKey !== checked.idempotencyKey) throw new SharedJournalError(409, "Original intent conflict.");
        const attempted = r.state === "preview" ? await deps.journal.beginAttempt(checked.leaseId, proof(r)) : r;
        executeRequested = true; const resolved = await deps.journal.executeOriginal(checked.leaseId, proof(attempted));
        if (resolved.state !== "resolved" || !resolved.result) throw new SharedJournalError(503, "Original result unknown.");
        return { status: "success", value: { message: resolved.result.message } };
      } catch (caught) {
        // Refresh only after returned conflict AND authorized proof that this
        // original remains unused. Network/execute/unknown cases retain key.
        if (!executeRequested && caught instanceof SharedJournalError && caught.status === 409) {
          try {
            const checked = confirmSchema.parse(input), r = await deps.journal.readCurrent(checked.leaseId);
            if (r?.state === "preview" && r.token === checked.token && r.idempotencyKey === checked.idempotencyKey) return { status: "error", recoveryState: "unused", message: "This unused preview changed or expired. Refresh the preview before confirming." };
          } catch { /* Unknown storage/access stays original. */ }
        }
        return { ...error(), recoveryState: "original" };
      }
    },
  };
}
export function createDisabledSharedJournalWorkflow(): SharedJournalActions {
  const disabled = async () => ({ status: "error" as const, message: "Deposit rent workflow is disabled." }); return { list: disabled, preview: disabled, confirm: disabled };
}
