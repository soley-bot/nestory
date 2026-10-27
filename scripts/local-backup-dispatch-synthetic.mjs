// Explicit synthetic integration support. No production signing key, credentials,
// provider enrollment or held worker entrypoint is reachable from this module.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import * as pgp from 'openpgp';
import {canonicalJson,hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {initializeWindowsResetJournal,openWindowsResetJournal} from './pilot-finance-reset-windows-journal.mjs';
import {createManualResetCoordinator} from './pilot-finance-reset-manual-coordinator.mjs';
import {buildDispatchTicket,dispatchSigningBytes,assertDispatchJournalRecords,verifySignedDispatchBundle,verifyHistoricalDispatchBundle,
 LOCAL_DISPATCH_REPOSITORY,LOCAL_DISPATCH_WORKFLOW} from './local-backup-dispatch-bundle.mjs';
import {encryptLocalCustodyTransfer,decryptLocalCustodyTransfer,localCustodyMutationSql,verifyLocalCustodyPayload,
 createLocalCustodySingleAttempt,reconcileLocalCustodyObservation} from './pilot-finance-reset-local-custody-runner.mjs';

export async function createSyntheticDispatchChain(runId){
 assert.equal(process.platform,'win32');assert.match(runId,/^[a-f0-9-]{36}$/);
 const directory=path.join('C:\\Users\\USer\\Nestory-Recovery\\pilot-october-2026',`synthetic-dispatch-${runId}`);
 await mkdir(directory,{recursive:false});
 const acl=`$ErrorActionPreference='Stop';$name=[Console]::In.ReadToEnd();$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false);foreach($sid in @($owner.Value,'S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};[IO.Directory]::SetAccessControl($name,$acl)`;
 const result=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(acl,'utf16le').toString('base64')],
  {input:directory,encoding:'utf8',windowsHide:true,timeout:30000,env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'}});
 assert.equal(result.status,0,'synthetic_private_directory_failed');
 const options=await initializeWindowsResetJournal({directory,storeId:randomUUID(),expectedHelperSha256:hashBytes(await readFile(new URL('./pilot-finance-reset-windows-journal.ps1',import.meta.url)))});
 const store=await openWindowsResetJournal(options),coordinator=createManualResetCoordinator({store});
 const keys=await pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:`Disposable synthetic dispatch ${runId}`}],format:'object',config:{v6Keys:false}});
 const publicKeyArmored=keys.publicKey.armor(),expectedPublicKeySha256=hashBytes(publicKeyArmored),receipts=[];
 return {
  options,
  async perform({payload,action,authorizationId,authoritySha256,write,readback}){
   const started=Date.now(),{packet,binding,artifacts,recovery,observation}=payload;
   const locator={operationId:packet.operation.operationId,action,nonce:randomUUID()},runId=String(100001+receipts.length);
   const sql=localCustodyMutationSql({binding,action,authorizationId,authoritySha256,observation,artifacts,recovery});
   // These references explicitly identify synthetic evidence only. Missing
   // hosted/custody artifacts are retained and whole-worker admission must fail.
   const syntheticEvidence=hashBytes('synthetic-integration-not-customer-custody');
   const evidenceRecordBytes=Buffer.from(canonicalJson({format:'nestory-local-dispatch-evidence-record-v1',operationId:locator.operationId,packetSha256:packet.packetSha256,evidence:{syntheticOnly:true}}));
   const evidenceRecordSha256=hashBytes(evidenceRecordBytes);
   const custody={format:'nestory-local-reset-custody-reference-v1',operationId:locator.operationId,packetSha256:packet.packetSha256,
    evidenceRecordSha256,
    ...Object.fromEntries(['archiveEnvelopeSha256','archivePlaintextSha256','filesArchiveSha256','restoreEvidenceSha256','keyRecoveryEvidenceSha256','privateDestinationReviewSha256','foreignBaselineSha256'].map(k=>[k,syntheticEvidence]))};
   const bootstrap={format:'nestory-manual-reset-bootstrap-claim-v1',...locator,mainSha:packet.operation.mainSha,packetSha256:packet.packetSha256,
    payloadSha256:digestDatabaseJson(payload),transferArchiveId:randomUUID(),transferArchiveSha256:syntheticEvidence};
   const {bootstrapClaimSha256}=await coordinator.recordBootstrapClaim(bootstrap);
   assert.equal(await store.putIfAbsent(`financial-reset/${locator.operationId}/manual-stage/${action}/bootstrap/${locator.nonce}/workflow-post`,
    Buffer.from(canonicalJson({format:'nestory-local-workflow-post-v1',...locator,mainSha:packet.operation.mainSha}))),'created');
   await coordinator.recordBootstrapResponse({...locator,bootstrapClaimSha256,runId:Number(runId),runAttempt:1});
   const transportIntent={format:'nestory-hosted-reset-action-intent-v1',operationId:locator.operationId,packetSha256:packet.packetSha256,action,
    bindingSha256:digestJson(binding),authorizationId,authoritySha256,sourceObservationSha256:digestDatabaseJson(observation),sqlSha256:digestJson(sql)};
   assert.equal(await store.putIfAbsent(`financial-reset/${locator.operationId}/manual-stage/${action}/custody-evidence`,evidenceRecordBytes),'created');
   const {intentSha256}=await coordinator.recordIntent({format:'nestory-manual-reset-intent-v1',mainSha:packet.operation.mainSha,inputBundleSha256:digestDatabaseJson(payload),custody,transportIntent});
   const {claimSha256}=await coordinator.claimDispatch({operationId:locator.operationId,action,intentSha256});
   await coordinator.recordDispatchResponse({operationId:locator.operationId,action,intentSha256,runId:Number(runId),runAttempt:1});
   const {format:_format,...intent}=transportIntent;void _format;
   const ticket=buildDispatchTicket({...intent,nonce:locator.nonce,mainSha:packet.operation.mainSha,runId,intentSha256,claimSha256,custodySha256:digestJson(custody),custodyEvidenceSha256:evidenceRecordSha256,
    issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()},payload);
   const reopened=await openWindowsResetJournal(options),prefix=`financial-reset/${locator.operationId}/manual-stage/${action}`;
   const [intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes]=await Promise.all(['intent','dispatch-claim','dispatch-response',`bootstrap/${locator.nonce}/claim`,`bootstrap/${locator.nonce}/response`,`bootstrap/${locator.nonce}/workflow-post`].map(k=>reopened.read(`${prefix}/${k}`)));
   assert.deepEqual(await reopened.read(`${prefix}/custody-evidence`),evidenceRecordBytes);
   assertDispatchJournalRecords({ticket,payload,intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes});
   assert.throws(()=>assertDispatchJournalRecords({ticket,payload,intentBytes,claimBytes,responseBytes:null,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes}));
   const signature=await pgp.sign({message:await pgp.createMessage({binary:dispatchSigningBytes(ticket,payload)}),signingKeys:keys.privateKey,detached:true,format:'binary'});
   const bundle={format:'nestory-local-custody-dispatch-bundle-v1',ticket,payload,signingPublicKeySha256:expectedPublicKeySha256,signatureBase64:Buffer.from(signature).toString('base64')};
   const key=randomBytes(32),cipher=encryptLocalCustodyTransfer(bundle,key,locator),tampered=Buffer.from(cipher);tampered[tampered.length-1]^=1;
   assert.throws(()=>decryptLocalCustodyTransfer(tampered,key,locator));
   const invocation={repository:LOCAL_DISPATCH_REPOSITORY,workflow:LOCAL_DISPATCH_WORKFLOW,mainSha:packet.operation.mainSha,runId,runAttempt:1,...locator};
   const verification={bundle:decryptLocalCustodyTransfer(cipher,key,locator),publicKeyArmored,expectedPublicKeySha256,invocation};key.fill(0);
   await assert.rejects(verifySignedDispatchBundle({...verification,invocation:{...invocation,runId:String(Number(runId)+1)}}));
   const verified=await verifySignedDispatchBundle(verification);
   assert.ok(packet.evidenceBlockers.length>0);
   assert.throws(()=>verifyLocalCustodyPayload(verified),/payload_invalid/,'Synthetic evidence cannot admit the production worker.');
   const rebuilt=localCustodyMutationSql({binding:verified.payload.binding,action:verified.ticket.action,authorizationId:verified.ticket.authorizationId,
    authoritySha256:verified.ticket.authoritySha256,observation:verified.payload.observation,artifacts:verified.payload.artifacts,recovery:verified.payload.recovery});
   assert.equal(rebuilt,sql);assert.equal(digestJson(rebuilt),ticket.sqlSha256);
   let writes=0;
   const attempt=createLocalCustodySingleAttempt({write:()=>{writes++;write(rebuilt);if(action==='freeze')throw Error('synthetic_committed_reply_lost');},
    readback,reconcile:observation=>reconcileLocalCustodyObservation({...verified,observation})});
   const receipt=await attempt();assert.equal(receipt.outcome,'committed-and-verified');assert.equal(writes,1);
   await assert.rejects(attempt(),/existing_attempt/);assert.equal(writes,1);
   await verifyHistoricalDispatchBundle({...verification,now:Date.parse(ticket.expiresAt)+1});
   await assert.rejects(verifySignedDispatchBundle({...verification,now:Date.parse(ticket.expiresAt)+1}));
   const restarted=createManualResetCoordinator({store:await openWindowsResetJournal(options)});
   await assert.rejects(restarted.claimDispatch({operationId:locator.operationId,action,intentSha256}),/existing_or_uncertain/);
   await restarted.recordReconciliation({operationId:locator.operationId,action,intentSha256,runId:Number(runId),runAttempt:1,
    receiptSha256:hashBytes(canonicalJson(receipt)),observationSha256:receipt.observationSha256,outcome:receipt.outcome});
   receipts.push({action,intentSha256,sqlSha256:ticket.sqlSha256,ciphertextSha256:hashBytes(cipher),oneWrite:true,
    committedLostReplyReconciled:action==='freeze',historicalSignatureVerified:true,elapsedMs:Date.now()-started});
   return receipt;
  },
  proof(){return {format:'nestory-synthetic-local-custody-chain-v1',syntheticOnly:true,productionAdmission:false,
   actualWindowsJournal:true,journalRootIdentity:options.expectedRootIdentity,signingKeyKind:'disposable-in-memory-never-enrolled',
   signingPublicKeySha256:expectedPublicKeySha256,realGitHubProviderProven:false,productionTlsProven:false,customerCustodyProven:false,receipts};},
 };
}
