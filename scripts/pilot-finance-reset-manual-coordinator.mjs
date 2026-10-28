// Local metadata custody only. No cloud client, credentials, actor issuance,
// mutation, input upload or inference that GitHub can read the owner's C: drive.
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { inspectWindowsResetJournal } from './pilot-finance-reset-windows-journal.mjs';
import { createJsonJournal } from './pilot-finance-reset-durable-store.mjs';
import { assertHostedTransportDispatchImplemented } from './pilot-finance-reset-hosted-transport.mjs';
import {assertPrepareRepairRecord,assertPrepareRepairOriginalJournal,localPrepareRepairStagePrefix,
  assertPrepareRepairObservation,assertPrepareRepairOriginalRun} from './local-backup-dispatch-repair.mjs';
import {assertExecuteResumeRecord,localExecuteResumeStagePrefix,assertExecuteResumeOriginalJournal,
  assertExecuteResumeObservation,assertExecuteResumeOriginalRun} from './local-backup-execute-resume.mjs';

import {assertPrepublicationRecoveryRecord,assertPrepublicationRecoveryParent,assertPrepublicationRecoveryOriginalJournal,
 assertPrepublicationRecoveryOriginalRun,assertPrepublicationRecoveryObservation,prepublicationRecoveryParentPrefix,
 prepublicationRecoveryRecordSlot,localPrepublicationRecoveryStagePrefix} from './local-backup-prepublication-recovery.mjs';

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

export function createManualResetCoordinator({ store, prepareRepair, executeResume, prepublicationRecovery }) {
  const mechanism = inspectWindowsResetJournal(store);
  if (mechanism.kind !== 'windows-create-new-write-through-flush-readback') fail('windows_journal_required');
  const journal = createJsonJournal({ store });
  const repair=prepareRepair===undefined?null:structuredClone(assertPrepareRepairRecord(prepareRepair));
  const resume=executeResume===undefined?null:structuredClone(assertExecuteResumeRecord(executeResume));
  if(resume&&(!repair||canonicalJson(resume.prepareRepair)!==canonicalJson(repair)))fail('resume_prepare_history_changed');
  const publication=prepublicationRecovery===undefined?null:structuredClone(assertPrepublicationRecoveryRecord(prepublicationRecovery));
  if(publication){assertPrepublicationRecoveryParent(resume);if(publication.packetSha256!==resume.packetSha256||publication.bindingSha256!==resume.bindingSha256)fail('prepublication_parent_changed');}
  const originalPrefix=(operationId,action)=>`financial-reset/${operationId}/manual-stage/${action}`;
  const repairSlot=repair?`${originalPrefix(repair.operationId,'prepare')}/repair-once`:null;
  async function assertRetainedRepair(){
    if(repair&&await journal.read(repairSlot)!==canonicalJson(repair))fail('original_repair_record_required');
    if(publication&&await journal.read(prepublicationRecoveryRecordSlot())!==canonicalJson(publication))fail('original_prepublication_record_required');
    if(resume&&await journal.read(`${originalPrefix(resume.operationId,'execute')}/resume-once`)!==canonicalJson(resume))fail('original_resume_record_required');
  }
  const prefix = (operationId, action) => {
    if (!uuid.test(operationId) || !stages.includes(action)) fail('scope_invalid');
    if(publication){if(operationId!==publication.operationId)fail('prepublication_scope_changed');return localPrepublicationRecoveryStagePrefix(action,publication);}
    if(resume){if(operationId!==resume.operationId)fail('resume_scope_changed');return localExecuteResumeStagePrefix(action,resume);}
    if(repair){if(operationId!==repair.operationId)fail('repair_scope_changed');return localPrepareRepairStagePrefix(action,repair);}
    return `financial-reset/${operationId}/manual-stage/${action}`;
  };
  async function persist(slot, value) {
    await assertRetainedRepair();
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
    if(!uuid.test(nonce))fail('bootstrap_nonce_invalid');
    prefix(operationId,action);
    if(repair&&action==='prepare'&&nonce!==repair.replacement.nonce)fail('repair_nonce_changed');
    if(publication&&nonce!==publication.replacement.nonce)fail('prepublication_nonce_changed');
    if(resume&&!publication&&nonce!==resume.replacement.nonce)fail('resume_nonce_changed');
    // Inert enrollment precedes the repair record. Preserve ordinary nonce
    // history; only prepare's new intent/claim/response use the repair subtree.
    return `${originalPrefix(operationId,action)}/bootstrap/${nonce}`;
  };
  return Object.freeze({
    async recordPrepublicationRecovery(document,evidence){
      if(repair||resume||publication)fail('prepublication_already_scoped');
      const value=structuredClone(assertPrepublicationRecoveryRecord(document));
      if(!exact(evidence,['binding','eligibility','originalRun','remoteWaiting']))fail('prepublication_evidence_required');
      const observed=structuredClone(evidence),base=originalPrefix(value.operationId,'execute'),old=prepublicationRecoveryParentPrefix();
      if(hashBytes(canonicalJson(observed.binding))!==value.bindingSha256||hashBytes(canonicalJson(observed.eligibility))!==value.eligibilitySha256||
        observed.eligibility.freshForeignSha256!==value.freshForeignSha256)fail('prepublication_evidence_changed');
      assertPrepublicationRecoveryObservation(observed.eligibility,{binding:observed.binding});
      assertPrepublicationRecoveryOriginalRun(observed.originalRun,value);
      const oldBoot=`${base}/bootstrap/${value.stopped.nonce}`,newBoot=`${base}/bootstrap/${value.replacement.nonce}`;
      const names=[`${base}/resume-once`,`${old}/intent`,`${old}/dispatch-claim`,`${old}/dispatch-response`,`${oldBoot}/claim`,`${oldBoot}/staged-payload`,`${oldBoot}/publish-claim`,
        ...['claim','response','workflow-post'].map(k=>`${newBoot}/${k}`)];
      const bytes=await Promise.all(names.map(async name=>{const text=await journal.read(name);return text===null?null:Buffer.from(text)}));
      assertPrepublicationRecoveryOriginalJournal({record:value,resumeBytes:bytes[0],intentBytes:bytes[1],claimBytes:bytes[2],responseBytes:bytes[3],
        bootstrapBytes:bytes[4],stagedBytes:bytes[5],publicationBytes:bytes[6]});
      if(canonicalJson(observed.remoteWaiting)!==canonicalJson({format:'nestory-local-custody-waiting-v2',operationId:value.operationId,action:'execute',nonce:value.stopped.nonce,staged:JSON.parse(bytes[5])}))fail('prepublication_remote_changed');
      if(bytes.slice(7).some(b=>b===null))fail('prepublication_bootstrap_missing');
      const bootstrap=JSON.parse(bytes[7]),response=JSON.parse(bytes[8]),post=JSON.parse(bytes[9]);
      if(bootstrap.format!=='nestory-manual-reset-bootstrap-claim-v1'||bootstrap.operationId!==value.operationId||bootstrap.action!=='execute'||bootstrap.nonce!==value.replacement.nonce||
        bootstrap.mainSha!==value.executorMainSha||bootstrap.packetSha256!==value.packetSha256||response.format!=='nestory-manual-reset-bootstrap-response-v1'||
        response.bootstrapClaimSha256!==hashBytes(bytes[7])||response.operationId!==value.operationId||response.action!=='execute'||response.nonce!==value.replacement.nonce||
        String(response.runId)!==value.replacement.runId||response.runAttempt!==1||canonicalJson(post)!==canonicalJson({format:'nestory-local-workflow-post-v1',operationId:value.operationId,action:'execute',nonce:value.replacement.nonce,mainSha:value.executorMainSha}))fail('prepublication_bootstrap_changed');
      // A second observation of absence closes local accidental concurrent publication.
      if(await journal.read(`${oldBoot}/publish-claim`)!==null)fail('prepublication_publication_present');
      return {prepublicationRecoverySha256:await persist(prepublicationRecoveryRecordSlot(),value),executionSupported:false};
    },
    async recordExecuteResume(document,evidence){
      if(repair||resume)fail('resume_already_scoped');
      const value=structuredClone(assertExecuteResumeRecord(document)),base=originalPrefix(value.operationId,'execute');
      if(!exact(evidence,['binding','eligibility','originalRun']))fail('resume_evidence_required');
      const observed=structuredClone(evidence);
      if(hashBytes(canonicalJson(observed.binding))!==value.bindingSha256||hashBytes(canonicalJson(observed.eligibility))!==value.eligibilitySha256||
        observed.eligibility.freshForeignSha256!==value.freshForeignSha256)fail('resume_evidence_changed');
      assertExecuteResumeObservation(observed.eligibility,{binding:observed.binding,originalAuthorizationId:value.originalAttempt.authorizationId});
      assertExecuteResumeOriginalRun(observed.originalRun,value);
      const oldNonce=value.originalAttempt.nonce,newNonce=value.replacement.nonce;
      const names=[`${base}/intent`,`${base}/dispatch-claim`,`${base}/dispatch-response`,`${base}/bootstrap/${oldNonce}/publish-claim`,
        `${base}/bootstrap/${oldNonce}/worker-receipt/${value.originalAttempt.receiptSha256}`,`${base}/reconciliation/${value.originalAttempt.receiptSha256}`,
        `${originalPrefix(value.operationId,'prepare')}/repair-once`,...['claim','response','workflow-post'].map(k=>`${base}/bootstrap/${newNonce}/${k}`)];
      const bytes=await Promise.all(names.map(async name=>{const text=await journal.read(name);return text===null?null:Buffer.from(text)}));
      assertExecuteResumeOriginalJournal({resume:value,intentBytes:bytes[0],claimBytes:bytes[1],responseBytes:bytes[2],publicationBytes:bytes[3],
        receiptBytes:bytes[4],reconciliationBytes:bytes[5],prepareRepairBytes:bytes[6]});
      assertManualResetIntent(JSON.parse(bytes[0]));
      if(bytes.slice(7).some(b=>b===null))fail('resume_bootstrap_missing');
      const bootstrap=JSON.parse(bytes[7]),response=JSON.parse(bytes[8]),post=JSON.parse(bytes[9]);
      if(bootstrap.format!=='nestory-manual-reset-bootstrap-claim-v1'||bootstrap.operationId!==value.operationId||bootstrap.action!=='execute'||
        bootstrap.nonce!==newNonce||bootstrap.mainSha!==value.executorMainSha||bootstrap.packetSha256!==value.packetSha256||
        response.format!=='nestory-manual-reset-bootstrap-response-v1'||response.bootstrapClaimSha256!==hashBytes(bytes[7])||
        response.operationId!==value.operationId||response.action!=='execute'||response.nonce!==newNonce||String(response.runId)!==value.replacement.runId||response.runAttempt!==1||
        canonicalJson(post)!==canonicalJson({format:'nestory-local-workflow-post-v1',operationId:value.operationId,action:'execute',nonce:newNonce,mainSha:value.executorMainSha}))fail('resume_bootstrap_changed');
      return {resumeSha256:await persist(`${base}/resume-once`,value),executionSupported:false};
    },
    async recordPrepareRepair(document,evidence){
      if(repair)fail('repair_already_scoped');
      const value=structuredClone(assertPrepareRepairRecord(document)),base=originalPrefix(value.operationId,'prepare');
      if(!exact(evidence,['binding','eligibility','originalRun']))fail('repair_evidence_required');
      const observed=structuredClone(evidence);
      if(hashBytes(canonicalJson(observed.binding))!==value.bindingSha256||hashBytes(canonicalJson(observed.eligibility))!==value.eligibilitySha256)fail('repair_evidence_changed');
      assertPrepareRepairObservation(observed.eligibility,{binding:observed.binding,originalAuthorizationId:value.originalAttempt.authorizationId});
      assertPrepareRepairOriginalRun(observed.originalRun,value);
      const newPrefix=`bootstrap/${value.replacement.nonce}`;
      const names=['intent','dispatch-claim','dispatch-response',`bootstrap/${value.originalAttempt.nonce}/publish-claim`,
        `${newPrefix}/claim`,`${newPrefix}/response`,`${newPrefix}/workflow-post`];
      const bytes=await Promise.all(names.map(async name=>{const text=await journal.read(`${base}/${name}`);return text===null?null:Buffer.from(text)}));
      assertPrepareRepairOriginalJournal({repair:value,intentBytes:bytes[0],claimBytes:bytes[1],responseBytes:bytes[2],publicationBytes:bytes[3]});
      assertManualResetIntent(JSON.parse(bytes[0]));
      if(bytes.slice(4).some(b=>b===null))fail('repair_bootstrap_missing');
      const bootstrap=JSON.parse(bytes[4]),response=JSON.parse(bytes[5]),post=JSON.parse(bytes[6]);
      if(bootstrap.format!=='nestory-manual-reset-bootstrap-claim-v1'||bootstrap.operationId!==value.operationId||bootstrap.action!=='prepare'||
        bootstrap.nonce!==value.replacement.nonce||bootstrap.mainSha!==value.executorMainSha||bootstrap.packetSha256!==value.packetSha256||
        response.format!=='nestory-manual-reset-bootstrap-response-v1'||response.bootstrapClaimSha256!==hashBytes(bytes[4])||
        response.operationId!==value.operationId||response.action!=='prepare'||response.nonce!==value.replacement.nonce||
        String(response.runId)!==value.replacement.runId||response.runAttempt!==1||
        canonicalJson(post)!==canonicalJson({format:'nestory-local-workflow-post-v1',operationId:value.operationId,action:'prepare',
          nonce:value.replacement.nonce,mainSha:value.executorMainSha}))fail('repair_bootstrap_changed');
      return {repairSha256:await persist(`${base}/repair-once`,value),executionSupported:false};
    },
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
      if(publication&&(document.mainSha!==publication.executorMainSha||t.action!=='execute'||t.packetSha256!==publication.packetSha256||t.bindingSha256!==publication.bindingSha256||
        [publication.stopped.authorizationId,resume.originalAttempt.authorizationId,repair.originalAttempt.authorizationId].includes(t.authorizationId)))fail('prepublication_intent_changed');
      if(resume&&!publication&&(document.mainSha!==resume.executorMainSha||t.action!=='execute'||t.packetSha256!==resume.packetSha256||t.bindingSha256!==resume.bindingSha256||
        t.authorizationId===resume.originalAttempt.authorizationId||t.authorizationId===repair.originalAttempt.authorizationId))fail('resume_intent_changed');
      if(repair&&!resume&&(document.mainSha!==repair.executorMainSha||t.packetSha256!==repair.packetSha256||t.bindingSha256!==repair.bindingSha256||
        t.authorizationId===repair.originalAttempt.authorizationId))fail('repair_intent_changed');
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
      if(repair&&action==='prepare'&&String(runId)!==repair.replacement.runId)fail('repair_run_changed');
      if(publication&&String(runId)!==publication.replacement.runId)fail('prepublication_run_changed');
      if(resume&&!publication&&String(runId)!==resume.replacement.runId)fail('resume_run_changed');
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
