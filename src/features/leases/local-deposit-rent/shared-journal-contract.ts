import { createHash } from "node:crypto";
import { z } from "zod";

// Dormant domain contract only. No storage, RPC, grant, route or feature binding.
const uuid = z.uuid();
const scopeSchema = z.strictObject({ organizationId: uuid, actorId: uuid, leaseId: uuid });
const base = { leaseId: uuid, date: z.iso.date(), reason: z.string().transform(value => value.replace(/^ +| +$/g, "")).pipe(z.string().min(3).max(200)).refine(value => !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) };
export const sharedJournalPayloadSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...base, operation: z.literal("apply"), depositId: uuid, invoiceId: uuid, lineId: uuid, amount: z.string().regex(/^\d{1,12}\.\d{2}$/).refine(value => Number(value) > 0) }),
  z.strictObject({ ...base, operation: z.literal("reverse"), applicationId: uuid }),
]);
export type SharedJournalScope = Readonly<z.infer<typeof scopeSchema>>;
export type SharedJournalPayload = Readonly<z.infer<typeof sharedJournalPayloadSchema>>;
export type JournalSelectedScope = Readonly<{ propertyId: string; unitId: string | null }>;
export type SharedJournalIntent = Readonly<{
  selectedScope: JournalSelectedScope;
  scope: SharedJournalScope; token: string; idempotencyKey: string; payload: SharedJournalPayload;
  payloadHash: string; snapshotHash: string; authorizationHash: string; expiresAt: number;
  revision: number; state: "preview" | "attempted" | "resolved";
  result?: Readonly<{ commandId: string; message: string }>;
}>;
export type JournalProof = Readonly<{ token: string; idempotencyKey: string; payloadHash: string; revision: number }>;
export type JournalAuthority = Readonly<{ scope: SharedJournalScope; selectedScope: JournalSelectedScope; authorizationHash: string; allowed: boolean }>;
// Fixed ordered string-array UTF-8 JSON matches PostgreSQL array_to_json(text[]).
export function canonicalJournalPayload(input: SharedJournalPayload) {
  const parsed = sharedJournalPayloadSchema.parse(input);
  const payload = parsed.operation === "apply" ? { ...parsed, leaseId: parsed.leaseId.toLowerCase(), depositId: parsed.depositId.toLowerCase(), invoiceId: parsed.invoiceId.toLowerCase(), lineId: parsed.lineId.toLowerCase(), amount: parsed.amount.replace(/^0+(?=\d)/, "") } : { ...parsed, leaseId: parsed.leaseId.toLowerCase(), applicationId: parsed.applicationId.toLowerCase() };
  const fields = ["deposit-rent-journal-payload-v1",payload.operation,payload.leaseId,payload.date,payload.reason,...(payload.operation === "apply" ? [payload.depositId,payload.invoiceId,payload.lineId,payload.amount] : [payload.applicationId])];
  const text = JSON.stringify(fields);
  return { payload, text, hash: createHash("sha256").update(text,"utf8").digest("hex") };
}
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
function fail(message: string): never { throw new Error(message); }
function scopeEqual(a: SharedJournalScope, b: SharedJournalScope) { return a.organizationId === b.organizationId && a.actorId === b.actorId && a.leaseId === b.leaseId; }
function freeze(record: SharedJournalIntent): SharedJournalIntent {
  return Object.freeze({ ...record, scope: Object.freeze({ ...record.scope }), selectedScope: Object.freeze({ ...record.selectedScope }), payload: Object.freeze({ ...record.payload }), ...(record.result ? { result: Object.freeze({ ...record.result }) } : {}) });
}
function authorize(record: SharedJournalIntent, authority: JournalAuthority) {
  if (!authority.allowed || !scopeEqual(record.scope, authority.scope) || record.authorizationHash !== authority.authorizationHash || record.selectedScope.propertyId !== authority.selectedScope.propertyId || record.selectedScope.unitId !== authority.selectedScope.unitId) fail("Current access does not permit the original intent.");
}
function proofMatches(record: SharedJournalIntent, proof: JournalProof, checkRevision = true) {
  if (record.token !== proof.token || record.idempotencyKey !== proof.idempotencyKey || record.payloadHash !== proof.payloadHash || checkRevision && record.revision !== proof.revision) fail("Original intent conflict.");
}
export function createJournalPreview(input: {
  scope: SharedJournalScope; selectedScope: JournalSelectedScope; token: string; idempotencyKey: string; payload: SharedJournalPayload;
  snapshotHash: string; authorizationHash: string; expiresAt: number;
}): SharedJournalIntent {
  const scope = scopeSchema.parse(input.scope), { payload, hash } = canonicalJournalPayload(input.payload);
  const selectedScope = z.strictObject({ propertyId: uuid, unitId: uuid.nullable() }).parse(input.selectedScope);
  if (payload.leaseId !== scope.leaseId) fail("Intent lease mismatch.");
  uuid.parse(input.token); uuid.parse(input.idempotencyKey); hashSchema.parse(input.snapshotHash); hashSchema.parse(input.authorizationHash);
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) fail("Invalid preview expiry.");
  return freeze({ scope, selectedScope, payload, token: input.token, idempotencyKey: input.idempotencyKey, snapshotHash: input.snapshotHash, authorizationHash: input.authorizationHash, expiresAt: input.expiresAt, payloadHash: hash, revision: 1, state: "preview" });
}
// Called under an atomic shared slot lock. A resolved predecessor is archived;
// an attempted predecessor is never deleted/replaced, including after expiry.
export function replaceJournalPreview(current: SharedJournalIntent | null, next: SharedJournalIntent, authority: JournalAuthority) {
  if (next.state !== "preview" || next.revision !== 1 || next.result !== undefined) fail("Replacement must be a fresh unused preview.");
  if (next.payloadHash !== canonicalJournalPayload(next.payload).hash) fail("Preview payload evidence conflict.");
  const validated = createJournalPreview(next);
  authorize(validated, authority);
  if (current) {
    authorize(current, authority);
    if (current.state === "attempted") fail("Original attempt remains unconfirmed.");
    if (current.token === next.token || current.idempotencyKey === next.idempotencyKey) fail("Replacement must use a new intent identity.");
  }
  return validated;
}
export function beginJournalAttempt(record: SharedJournalIntent, proof: JournalProof, authority: JournalAuthority, snapshotHash: string, now: number) {
  authorize(record, authority); proofMatches(record, proof, record.state === "preview");
  if (record.state !== "preview") return record; // Original replay survives expiry/changed financial snapshot.
  if (record.expiresAt <= now || record.snapshotHash !== snapshotHash) fail("Unused preview expired or changed.");
  return freeze({ ...record, state: "attempted", revision: record.revision + 1 });
}
export function recoverJournalIntent(record: SharedJournalIntent, proof: JournalProof, authority: JournalAuthority) {
  authorize(record, authority); proofMatches(record, proof, false); return record;
}
// Backend commits this result in the SAME transaction as the checked command.
// Unknown outcomes have no transition: retain attempted state and original key.
export function resolveJournalAttempt(record: SharedJournalIntent, proof: JournalProof, authority: JournalAuthority, result: { commandId: string; message: string }) {
  authorize(record, authority); proofMatches(record, proof, false); uuid.parse(result.commandId);
  if (!result.message || result.message.length > 300) fail("Invalid command result.");
  if (record.state === "preview") fail("Attempt must be durably recorded before dispatch.");
  if (record.state === "resolved") {
    if (record.result?.commandId !== result.commandId || record.result.message !== result.message) fail("Resolved result conflict.");
    return record;
  }
  return freeze({ ...record, state: "resolved", revision: record.revision + 1, result: { ...result } });
}
// Concrete SQL draft is dormant and pending runtime acceptance. Each operation is one
// scoped authorized atomic RPC; never a transaction spanning a JS callback.
export type SharedDepositJournalPort = {
  readCurrent(leaseId: string): Promise<SharedJournalIntent | null>;
  prepare(payload: SharedJournalPayload): Promise<SharedJournalIntent>;
  beginAttempt(leaseId: string, proof: JournalProof): Promise<SharedJournalIntent>;
  executeOriginal(leaseId: string, proof: JournalProof): Promise<SharedJournalIntent>;
};
