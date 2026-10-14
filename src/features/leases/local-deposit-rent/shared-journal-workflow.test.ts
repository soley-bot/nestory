import { describe, expect, it, vi } from "vitest";
import { createSharedJournalWorkflow } from "./shared-journal-workflow";
import { fixture, ids } from "./workflow.test-fixture";
import type { SharedDepositJournalPort } from "./shared-journal-contract";

describe("current custody in the mounted journal", () => {
  it("blocks new applications while keeping historical reversal choices available", async () => {
    const h = fixture();
    await h.rpc("apply_deposit_to_rent", { p_org: ids.org, p_deposit: ids.deposit, p_invoice: ids.invoice,
      p_date: "2026-10-04", p_allocations: [{ lineId: ids.line, amount: "100.00" }], p_reason: "Original application", p_key: "original-application-key" });
    const snapshot = h.snapshot();
    snapshot.deposits[0].custodyCurrent = false;
    const unused = vi.fn(async () => { throw Error("No mutation expected"); });
    const journal: SharedDepositJournalPort = { readCurrent: vi.fn(async () => null), prepare: unused, beginAttempt: unused, executeOriginal: unused };
    const actions = createSharedJournalWorkflow({ journal, readSnapshot: async () => ({ snapshot, permissions: h.control.permissions }) });
    const result = await actions.list(ids.lease);
    expect(result).toMatchObject({ status: "success", value: { deposits: [{ eligible: false, custodianLabel: "Renew deposit custody evidence" }] } });
    if (result.status !== "success") throw Error("Missing journal");
    expect(result.value.applications).toHaveLength(1);
    expect(journal.prepare).not.toHaveBeenCalled();
  });
});
