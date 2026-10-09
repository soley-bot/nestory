"use server";
import type { DepositRentDraft } from "./contracts";
import { createDormantSharedJournalModalSession } from "./shared-journal-modal-session";
// Product action bridge is hard-disabled. The ordinary shared-journal factory
// exists separately for owned acceptance; no request/env/browser switch enables it.
export async function listDormantDepositRent(leaseId: string) {
  return createDormantSharedJournalModalSession().list(leaseId);
}
export async function previewDormantDepositRent(draft: DepositRentDraft) {
  return createDormantSharedJournalModalSession().preview(draft);
}
export async function confirmDormantDepositRent(input: { leaseId: string; token: string; idempotencyKey: string }) {
  return createDormantSharedJournalModalSession().confirm(input);
}
