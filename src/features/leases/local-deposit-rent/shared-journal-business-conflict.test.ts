import { describe, expect, it, vi } from "vitest";
import { createJournalPreview, beginJournalAttempt, resolveJournalAttempt } from "./shared-journal-contract";
import { createOrdinarySharedJournalPort } from "./shared-journal-adapter";
import { createSyntheticJournalHttpHandler } from "./shared-journal-synthetic-http";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = { actorId: id(1), organizationId: id(2) }, leaseId = id(3);
function intent() {
  return createJournalPreview({ scope: { ...identity, leaseId }, selectedScope: { propertyId: id(4), unitId: null }, token: id(5), idempotencyKey: id(6),
    payload: { operation: "apply", leaseId, depositId: id(7), invoiceId: id(8), lineId: id(9), amount: "100.00", date: "2026-10-04", reason: "Settle rent" },
    snapshotHash: "a".repeat(64), authorizationHash: "b".repeat(64), expiresAt: 1000 });
}
const proof = (r: ReturnType<typeof intent>) => ({ token: r.token, idempotencyKey: r.idempotencyKey, payloadHash: r.payloadHash, revision: r.revision });
describe("proposed deterministic conflict code transport regression", () => {
  it("returns one bounded 409 for a business-conflict response without retrying or dispatching", async () => {
    for (const message of ["Unused preview snapshot changed", "Unused preview expired or changed", "Candidate snapshot changed"]) {
      const record = intent(), rpc = vi.fn(async () => ({ data: null, error: { code: "23514", message } }));
      const actions = createOrdinarySharedJournalPort({ identity: async () => identity, client: async () => ({ rpc }) });
      const handler = createSyntheticJournalHttpHandler(() => actions);
      const requestProof = { ...proof(record), revision: message.includes("expired") ? 99 : record.revision };
      const response = await handler(new Request("http://localhost:50123/journal", { method: "POST", headers: { origin: "http://localhost:50123" }, body: JSON.stringify({ operation: "begin", leaseId, proof: requestProof }) }));
      expect(response.status).toBe(409); expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("begin_deposit_rent_journal_attempt", expect.objectContaining({ p_token: record.token, p_key: record.idempotencyKey, p_revision: requestProof.revision }));
      expect(record.state).toBe("preview");
    }
  });
  it("keeps the original key and attempted intent when a genuine serialization error requires caller retry", async () => {
    const original = intent(), authority = { scope: original.scope, selectedScope: original.selectedScope, authorizationHash: original.authorizationHash, allowed: true };
    const attempted = beginJournalAttempt(original, proof(original), authority, original.snapshotHash, 1);
    const resolved = resolveJournalAttempt(attempted, proof(original), authority, { commandId: id(10), message: "Original confirmed." });
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "40001", message: "Genuine serialization conflict" } }).mockResolvedValueOnce({ data: resolved, error: null });
    const actions = createOrdinarySharedJournalPort({ identity: async () => identity, client: async () => ({ rpc }) });
    await expect(actions.executeOriginal(leaseId, proof(original))).rejects.toMatchObject({ status: 409 });
    expect(attempted.state).toBe("attempted");
    expect((await actions.executeOriginal(leaseId, proof(original))).idempotencyKey).toBe(original.idempotencyKey);
    expect(rpc).toHaveBeenCalledTimes(2); expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("returns committed original recovery without fetching a now-closed financial snapshot or creating a replacement", async () => {
    const original = intent(), authority = { scope: original.scope, selectedScope: original.selectedScope, authorizationHash: original.authorizationHash, allowed: true };
    const attempted = beginJournalAttempt(original, proof(original), authority, original.snapshotHash, 1);
    const resolved = resolveJournalAttempt(attempted, proof(original), authority, { commandId: id(10), message: "Original confirmed." });
    const rpc = vi.fn(async () => ({ data: resolved, error: null }));
    const actions = createOrdinarySharedJournalPort({ identity: async () => identity, client: async () => ({ rpc }) });
    expect((await actions.executeOriginal(leaseId, proof(original))).result).toEqual(resolved.result);
    expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith("execute_deposit_rent_journal", expect.objectContaining({ p_key: original.idempotencyKey }));
  });
});
