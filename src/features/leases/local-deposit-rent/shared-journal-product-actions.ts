"use server";
import type { DepositRentDraft } from "./contracts";
import { createDormantSharedJournalModalSession } from "./shared-journal-modal-session";
import { createOrdinarySharedJournalModalSession } from "./shared-journal-modal-session";
import { revalidatePath } from "next/cache";

export async function listDepositRent(leaseId: string) {
  return createOrdinarySharedJournalModalSession().list(leaseId);
}
export async function previewDepositRent(draft: DepositRentDraft) {
  return createOrdinarySharedJournalModalSession().preview(draft);
}
export async function confirmDepositRent(input: { leaseId: string; token: string; idempotencyKey: string }) {
  const result = await createOrdinarySharedJournalModalSession().confirm(input);
  if (result.status === "success") {
    for (const path of ["/leases", "/rent", "/ledger", "/balances", "/reports", "/timeline"]) revalidatePath(path);
  }
  return result;
}
// Retained disabled adapter for isolated regression tests.
export async function listDormantDepositRent(leaseId: string) {
  return createDormantSharedJournalModalSession().list(leaseId);
}
export async function previewDormantDepositRent(draft: DepositRentDraft) {
  return createDormantSharedJournalModalSession().preview(draft);
}
export async function confirmDormantDepositRent(input: { leaseId: string; token: string; idempotencyKey: string }) {
  return createDormantSharedJournalModalSession().confirm(input);
}
