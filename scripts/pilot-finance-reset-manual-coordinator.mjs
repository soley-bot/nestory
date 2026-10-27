// Local metadata custody only. No cloud client, credentials, actor issuance,
// mutation, input upload or inference that GitHub can read the owner's C: drive.
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { inspectWindowsResetJournal } from './pilot-finance-reset-windows-journal.mjs';
import { createJsonJournal } from './pilot-finance-reset-durable-store.mjs';
import { assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';

const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const stages = ['freeze', 'checkpoint', 'prepare', 'seal', 'execute', 'prepare-recovery', 'execute-recovery'];
const exact = (v, fields) => v && Object.getPrototypeOf(v) === Object.prototype && canonicalJson(Object.keys(v).sort()) === canonicalJson([...fields].sort());
const fail = code => { const e = new Error(`manual_reset_${code}`); e.requiresReconciliation = true; throw e; };

export function assertManualResetIntent(document) {
  const fields = ['format', 'mainSha', 'inputBundleSha256', 'custody', 'transportIntent'];
  if (!exact(document, fields) || document.format !== 'nestory-manual-reset-intent-v1' || !/^[a-f0-9]{40}$/.test(document.mainSha) ||
    !digest.test(document.inputBundleSha256)) fail('intent_invalid');
  const t = document.transportIntent;
  if (!exact(t, ['format', 'operationId', 'packetSha256', 'action', 'bindingSha256', 'authorizationId', 'authoritySha256', 'sourceObservationSha256', 'sqlSha256']) ||
    t.format !== 'nestory-hosted-reset-action-intent-v1' || !uuid.test(t.operationId) || !uuid.test(t.authorizationId) || !stages.includes(t.action) ||
    !['packetSha256', 'bindingSha256', 'authoritySha256', 'sourceObservationSha256', 'sqlSha256'].every(k => digest.test(t[k]))) fail('transport_intent_invalid');
  const custody = document.custody;
  const hashes = ['archiveEnvelopeSha256', 'archivePlaintextSha256', 'filesArchiveSha256', 'restoreEvidenceSha256',
    'keyRecoveryEvidenceSha256', 'privateDestinationReviewSha256', 'foreignBaselineSha256', 'evidenceRecordSha256'];
  if (!exact(custody, ['format', 'operationId', 'packetSha256', ...hashes]) || custody.format !== 'nestory-local-reset-custody-reference-v1' ||
    custody.operationId !== t.operationId || custody.packetSha256 !== t.packetSha256 || !hashes.every(k => digest.test(custody[k]))) fail('custody_binding_invalid');
  // References identify reviewed evidence; this check does not perform restore,
  // verify BitLocker or turn an operator assertion into a provider attestation.
  return document;
}

export function createManualResetCoordinator({ store }) {
  const mechanism = inspectWindowsResetJournal(store);
  if (mechanism.kind !== 'windows-create-new-write-through-flush-readback') fail('windows_journal_required');
  const journal = createJsonJournal({ store });
  const prefix = (operationId, action) => {
    if (!uuid.test(operationId) || !stages.includes(action)) fail('scope_invalid');
    return `financial-reset/${operationId}/manual-stage/${action}`;
  };
  async function persist(slot, value) {
    const bytes = canonicalJson(value);
    if (await journal.putIfAbsent(slot, bytes) !== 'created' || await journal.read(slot) !== bytes) fail('existing_or_uncertain_record');
    return hashBytes(bytes);
  }
  async function original(operationId, action, expectedSha256) {
    if (!digest.test(expectedSha256)) fail('intent_digest_invalid');
    const bytes = await journal.read(`${prefix(operationId, action)}/intent`);
    if (bytes === null || hashBytes(bytes) !== expectedSha256) fail('original_intent_missing_or_changed');
    const document = assertManualResetIntent(JSON.parse(bytes));
    if (document.transportIntent.operationId !== operationId || document.transportIntent.action !== action) fail('intent_scope_changed');
    return document;
  }
  async function dispatchClaim(operationId, action, expectedSha256) {
    await original(operationId, action, expectedSha256);
    const bytes = await journal.read(`${prefix(operationId, action)}/dispatch-claim`);
    const expected = canonicalJson({ format: 'nestory-manual-reset-dispatch-claim-v1', operationId, action, intentSha256: expectedSha256 });
    if (bytes !== expected) fail('original_dispatch_claim_required');
  }
  const bootstrapPrefix=(operationId,action,nonce)=>{
    if(!uuid.test(nonce))fail('bootstrap_nonce_invalid');return `${prefix(operationId,action)}/bootstrap/${nonce}`;
  };
  return Object.freeze({
    async recordBootstrapClaim(document){
      if(!exact(document,['format','operationId','action','nonce','mainSha','packetSha256','payloadSha256','transferArchiveId','transferArchiveSha256'])||
       document.format!=='nestory-manual-reset-bootstrap-claim-v1'||!/^[a-f0-9]{40}$/.test(document.mainSha)||!uuid.test(document.transferArchiveId)||
       !['packetSha256','payloadSha256','transferArchiveSha256'].every(k=>digest.test(document[k])))fail('bootstrap_invalid');
      const key=bootstrapPrefix(document.operationId,document.action,document.nonce);
      return {bootstrapClaimSha256:await persist(`${key}/claim`,document),executionSupported:false};
    },
    async recordBootstrapResponse({operationId,action,nonce,bootstrapClaimSha256,runId,runAttempt}){
      const key=bootstrapPrefix(operationId,action,nonce),bytes=await journal.read(`${key}/claim`);
      if(bytes===null||hashBytes(bytes)!==bootstrapClaimSha256||!Number.isSafeInteger(runId)||runId<1||runAttempt!==1)fail('bootstrap_original_required');
      return persist(`${key}/response`,{format:'nestory-manual-reset-bootstrap-response-v1',operationId,action,nonce,bootstrapClaimSha256,runId,runAttempt});
    },
    async recordIntent(value) {
      const document = structuredClone(assertManualResetIntent(value)), t = document.transportIntent;
      return Object.freeze({ intentSha256: await persist(`${prefix(t.operationId, t.action)}/intent`, document), executionSupported: false });
    },
    async claimDispatch({ operationId, action, intentSha256 }) {
      await original(operationId, action, intentSha256);
      // This permanent local claim MUST precede the single future network POST.
      // If its response is lost, another claim is prohibited even after restart.
      const claim = { format: 'nestory-manual-reset-dispatch-claim-v1', operationId, action, intentSha256 };
      return Object.freeze({ claimSha256: await persist(`${prefix(operationId, action)}/dispatch-claim`, claim), executionSupported: false });
    },
    async recordDispatchResponse({ operationId, action, intentSha256, runId, runAttempt }) {
      if (!Number.isSafeInteger(runId) || runId < 1 || runAttempt !== 1) fail('dispatch_response_invalid');
      await dispatchClaim(operationId, action, intentSha256);
      return persist(`${prefix(operationId, action)}/dispatch-response`, { format: 'nestory-manual-reset-dispatch-response-v1',
        operationId, action, intentSha256, runId, runAttempt });
    },
    async recordReconciliation({ operationId, action, intentSha256, runId, runAttempt, receiptSha256, observationSha256, outcome }) {
      if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
        !digest.test(receiptSha256) || !digest.test(observationSha256) || !['committed-and-verified', 'not-proven-do-not-retry'].includes(outcome)) fail('reconciliation_invalid');
      await dispatchClaim(operationId, action, intentSha256);
      const dispatched = await journal.read(`${prefix(operationId, action)}/dispatch-response`);
      if (dispatched !== null) {
        const response = JSON.parse(dispatched);
        if (response.runId !== runId || response.runAttempt !== runAttempt || response.intentSha256 !== intentSha256) fail('original_run_changed');
      }
      // Receipt source authentication belongs to the fixed protected reader.
      // Recording this summary cannot issue a new stage or authorize a retry.
      return persist(`${prefix(operationId, action)}/reconciliation/${receiptSha256}`, { format: 'nestory-manual-reset-reconciliation-record-v1',
        operationId, action, intentSha256, runId, runAttempt, receiptSha256, observationSha256, outcome });
    },
    async inspect({ operationId, action, intentSha256 }) {
      await original(operationId, action, intentSha256);
      const claim = await journal.read(`${prefix(operationId, action)}/dispatch-claim`);
      const response = await journal.read(`${prefix(operationId, action)}/dispatch-response`);
      if (response !== null && claim === null) fail('orphan_dispatch_response');
      if (claim !== null) await dispatchClaim(operationId, action, intentSha256);
      return Object.freeze({ status: claim === null ? 'intent-recorded' : response === null ? 'dispatch-claimed-outcome-unknown' : 'dispatch-response-recorded',
        operationId, action, intentSha256, automaticRetryAllowed: false, executionSupported: false });
    },
  });
}

// The authenticated private ciphertext handoff and local-custody attestation
// adapter are not yet implemented. Never substitute a hash/flag or local path.
export function dispatchManualReset() { assertHostedTransportDispatchImplemented(); }
