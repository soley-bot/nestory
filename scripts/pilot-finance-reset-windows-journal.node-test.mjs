import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, realpath, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashBytes, canonicalJson } from './pilot-finance-reset-operator-core.mjs';
import {PREPARE_REPAIR_OPERATION,PREPARE_REPAIR_ORIGINAL_MAIN,prepareRepairOriginalRunEvidence} from './local-backup-dispatch-repair.mjs';
import { initializeWindowsResetJournal, openWindowsResetJournal, inspectWindowsResetJournal } from './pilot-finance-reset-windows-journal.mjs';
import { createManualResetCoordinator, dispatchManualReset } from './pilot-finance-reset-manual-coordinator.mjs';

const windows = process.platform === 'win32';
const helperSha256 = hashBytes(await readFile(new URL('./pilot-finance-reset-windows-journal.ps1', import.meta.url)));
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const privateAclScript = `
$ErrorActionPreference='Stop'
$name=[Console]::In.ReadToEnd()
if ($name -notmatch '^C:\\\\' -or -not [IO.Directory]::Exists($name)) { throw 'test_directory_invalid' }
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($owner.Value,'S-1-5-18','S-1-5-32-544')) {
  $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
}
[IO.Directory]::SetAccessControl($name,$acl)
`;
async function fixture(t, makePrivate = true, initialize = true) {
  const parent = await realpath(os.tmpdir());
  assert.match(parent, /^C:\\/i, 'real Windows test must stay on C:');
  const directory = await mkdtemp(path.join(parent, 'nestory-journal-synthetic-'));
  t.after(async () => {
    // Only the exact synthetic directory created above is eligible for cleanup.
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase());
    assert.match(path.basename(resolved), /^nestory-journal-synthetic-/);
    await rm(resolved, { recursive: true, force: false });
  });
  if (makePrivate) {
    const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(privateAclScript, 'utf16le').toString('base64')],
      { input: directory, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, `synthetic private directory setup failed: ${result.stderr}`);
  }
  const options = { directory, storeId: randomUUID(), expectedHelperSha256: helperSha256 };
  return makePrivate && initialize ? initializeWindowsResetJournal(options) : options;
}

test('inert bootstrap claim and exact run enrollment survive real Windows reopen without actor authorization', { skip: !windows }, async t => {
  const options=await fixture(t),store=await openWindowsResetJournal(options),coordinator=createManualResetCoordinator({store});
  const claim={format:'nestory-manual-reset-bootstrap-claim-v1',operationId:randomUUID(),action:'freeze',nonce:randomUUID(),mainSha:'a'.repeat(40),
    packetSha256:'b'.repeat(64),payloadSha256:'c'.repeat(64),transferArchiveId:randomUUID(),transferArchiveSha256:'d'.repeat(64)};
  const {bootstrapClaimSha256}=await coordinator.recordBootstrapClaim(claim);
  await coordinator.recordBootstrapResponse({operationId:claim.operationId,action:claim.action,nonce:claim.nonce,bootstrapClaimSha256,runId:123,runAttempt:1});
  const reopened=createManualResetCoordinator({store:await openWindowsResetJournal(options)});
  await assert.rejects(reopened.recordBootstrapClaim(claim),/existing_or_uncertain/);
  await assert.rejects(reopened.recordBootstrapResponse({operationId:claim.operationId,action:claim.action,nonce:claim.nonce,bootstrapClaimSha256,runId:124,runAttempt:1}),/existing_or_uncertain/);
  await assert.rejects(reopened.recordBootstrapResponse({operationId:claim.operationId,action:claim.action,nonce:randomUUID(),bootstrapClaimSha256,runId:123,runAttempt:1}),/bootstrap_original_required/);
});

test('real Windows write-through journal persists exact immutable bytes across new helper processes and reopen', { skip: !windows }, async t => {
  const options = await fixture(t), store = await openWindowsResetJournal(options);
  const value = Buffer.from('{"syntheticOnly":true,"intent":"before-dispatch"}');
  assert.equal(await store.read('operation/one/intent'), null);
  assert.equal(await store.putIfAbsent('operation/one/intent', value), 'created');
  assert.deepEqual(await store.read('operation/one/intent'), value);
  const reopened = await openWindowsResetJournal(options);
  assert.deepEqual(await reopened.read('operation/one/intent'), value);
  assert.equal(await reopened.putIfAbsent('operation/one/intent', Buffer.from('different')), 'exists');
  assert.deepEqual(await reopened.read('operation/one/intent'), value);
  assert.equal(inspectWindowsResetJournal(reopened).kind, 'windows-create-new-write-through-flush-readback');
  assert.match(inspectWindowsResetJournal(reopened).encryptionAuthority, /independent/);
});
test('real Windows journal refuses repeated same-process attempts and mismatched store identity', { skip: !windows }, async t => {
  const options = await fixture(t), store = await openWindowsResetJournal(options);
  await store.putIfAbsent('operation/one/claim', Buffer.from('one'));
  await assert.rejects(store.putIfAbsent('operation/one/claim', Buffer.from('one')), /previous_attempt_requires_reconciliation/);
  await assert.rejects(openWindowsResetJournal({ ...options, storeId: randomUUID() }), /verification_failed/);
});
test('partial slot left by an interrupted write is unknown after restart and cannot be recreated', { skip: !windows }, async t => {
  const options = await fixture(t); await openWindowsResetJournal(options);
  const key = 'operation/one/claim';
  await writeFile(path.join(options.directory, `${hashBytes(key)}.json`), '{"partial":', { flag: 'wx' });
  const reopened = await openWindowsResetJournal(options);
  await assert.rejects(reopened.read(key), /verification_failed/);
  await assert.rejects(reopened.putIfAbsent(key, Buffer.from('replacement')), /verification_failed/);
  assert.equal(await readFile(path.join(options.directory, `${hashBytes(key)}.json`), 'utf8'), '{"partial":');
});
test('ordinary inherited-access directory fails actual Windows private DACL validation', { skip: !windows }, async t => {
  const options = await fixture(t, false);
  await assert.rejects(initializeWindowsResetJournal(options), /verification_failed/);
});
test('inherit-only untrusted grants are rejected before any initialization record is written', { skip: !windows }, async t => {
  const options = await fixture(t, true, false);
  const script = `$ErrorActionPreference='Stop';$name=[Console]::In.ReadToEnd();$acl=[IO.Directory]::GetAccessControl($name);
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','ContainerInherit,ObjectInherit','InheritOnly','Allow'));
  [IO.Directory]::SetAccessControl($name,$acl)`;
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: options.directory, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(initializeWindowsResetJournal(options), /verification_failed/);
  assert.deepEqual(await readdir(options.directory), []);
});
test('protected null DACL cannot masquerade as a private directory with no untrusted ACEs', { skip: !windows }, async t => {
  const options = await fixture(t, true, false);
  const script = `$ErrorActionPreference='Stop';$name=[Console]::In.ReadToEnd();
  $acl=[IO.Directory]::GetAccessControl($name);$acl.SetSecurityDescriptorSddlForm('D:PNO_ACCESS_CONTROL',[Security.AccessControl.AccessControlSections]::Access);
  [IO.Directory]::SetAccessControl($name,$acl)`;
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { input: options.directory, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(initializeWindowsResetJournal(options), /verification_failed/);
  assert.deepEqual(await readdir(options.directory), []);
});
test('Windows journal refuses helper drift, unrecognized providers and non-C paths', async () => {
  assert.throws(() => inspectWindowsResetJournal({ read() {}, putIfAbsent() {} }), /unrecognized_provider/);
  await assert.rejects(initializeWindowsResetJournal({ directory: 'D:\\synthetic', storeId: randomUUID(), expectedHelperSha256: helperSha256 }), /configuration_invalid/);
  if (windows) await assert.rejects(initializeWindowsResetJournal({ directory: 'C:\\synthetic', storeId: randomUUID(), expectedHelperSha256: 'a'.repeat(64) }), /helper_changed/);
});

test('manual coordinator retains original intent and ambiguous dispatch claim across real Windows restart', { skip: !windows }, async t => {
  const options = await fixture(t), operationId = randomUUID(), action = 'execute';
  const doc = { format: 'nestory-manual-reset-intent-v1', mainSha: 'a'.repeat(40), inputBundleSha256: 'b'.repeat(64),
    transportIntent: { format: 'nestory-hosted-reset-action-intent-v1', operationId, action, authorizationId: randomUUID(),
      packetSha256: 'c'.repeat(64), bindingSha256: 'd'.repeat(64), authoritySha256: 'e'.repeat(64), sourceObservationSha256: 'f'.repeat(64), sqlSha256: '1'.repeat(64) },
    custody: { format: 'nestory-local-reset-custody-reference-v1', operationId, packetSha256: 'c'.repeat(64),
      ...Object.fromEntries(['evidenceRecordSha256','archiveEnvelopeSha256', 'archivePlaintextSha256', 'filesArchiveSha256', 'restoreEvidenceSha256', 'keyRecoveryEvidenceSha256',
        'privateDestinationReviewSha256', 'foreignBaselineSha256'].map(k => [k, '2'.repeat(64)])) } };
  const coordinator = createManualResetCoordinator({ store: await openWindowsResetJournal(options) });
  const prepared = await coordinator.recordIntent(doc), request = { operationId, action, intentSha256: prepared.intentSha256 };
  assert.equal(prepared.executionSupported, false);
  assert.equal((await coordinator.inspect(request)).status, 'intent-recorded');
  await coordinator.claimDispatch(request);
  const reopened = createManualResetCoordinator({ store: await openWindowsResetJournal(options) });
  assert.equal((await reopened.inspect(request)).status, 'dispatch-claimed-outcome-unknown');
  await assert.rejects(reopened.claimDispatch(request), /existing_or_uncertain_record/);
  await reopened.recordDispatchResponse({ ...request, runId: 10, runAttempt: 1 });
  assert.equal((await reopened.inspect(request)).status, 'dispatch-response-recorded');
  await assert.rejects(reopened.recordReconciliation({ ...request, runId: 11, runAttempt: 1, receiptSha256: '3'.repeat(64),
    observationSha256: '4'.repeat(64), outcome: 'committed-and-verified' }), /original_run_changed/);
  await reopened.recordReconciliation({ ...request, runId: 10, runAttempt: 1, receiptSha256: '3'.repeat(64),
    observationSha256: '4'.repeat(64), outcome: 'not-proven-do-not-retry' });
  assert.equal((await reopened.inspect(request)).automaticRetryAllowed, false);
  assert.throws(() => dispatchManualReset(), /hosted_transport_integration_incomplete/);
});

test('manual coordinator rejects mock stores and a recreated directory identity', { skip: !windows }, async t => {
  assert.throws(() => createManualResetCoordinator({ store: { read() {}, putIfAbsent() {} } }), /unrecognized_provider/);
  const first = await fixture(t), second = await fixture(t);
  await assert.rejects(openWindowsResetJournal({ ...first, directory: second.directory }), /verification_failed/);
});

test('one prepare repair preserves original Windows history and cannot be claimed twice after reopen', {skip:!windows},async t=>{
 const options=await fixture(t),store=await openWindowsResetJournal(options),original=createManualResetCoordinator({store});
 const operationId=PREPARE_REPAIR_OPERATION,action='prepare',oldNonce=randomUUID(),newNonce=randomUUID(),oldAuthorization=randomUUID(),h='a'.repeat(64);
 const binding={version:1,operation_id:operationId,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',project_ref:'pfvmztxktkwyewvxfgot',
  main_sha:PREPARE_REPAIR_ORIGINAL_MAIN,source_generation:0,target_generation:1,cutoff:'2026-10-01',issue_date:'2026-10-01',
  invoice_date_policy:'empty-books-no-invoices',continuation_semantic:{version:4},source_snapshot_sha256:h};
 const bindingSha256=hashBytes(canonicalJson(binding));
 const doc={format:'nestory-manual-reset-intent-v1',mainSha:PREPARE_REPAIR_ORIGINAL_MAIN,inputBundleSha256:h,
  transportIntent:{format:'nestory-hosted-reset-action-intent-v1',operationId,action,authorizationId:oldAuthorization,
   packetSha256:h,bindingSha256,authoritySha256:h,sourceObservationSha256:h,sqlSha256:h},
  custody:{format:'nestory-local-reset-custody-reference-v1',operationId,packetSha256:h,
   ...Object.fromEntries(['evidenceRecordSha256','archiveEnvelopeSha256','archivePlaintextSha256','filesArchiveSha256','restoreEvidenceSha256',
    'keyRecoveryEvidenceSha256','privateDestinationReviewSha256','foreignBaselineSha256'].map(k=>[k,h]))}};
 const {intentSha256}=await original.recordIntent(doc),{claimSha256}=await original.claimDispatch({operationId,action,intentSha256});
 await original.recordDispatchResponse({operationId,action,intentSha256,runId:100,runAttempt:1});
 const base=`financial-reset/${operationId}/manual-stage/prepare`,saved=await store.read(`${base}/intent`);
 await store.putIfAbsent(`${base}/bootstrap/${oldNonce}/publish-claim`,Buffer.from(canonicalJson({format:'nestory-local-ticket-publication-v1',
  runId:100,intentSha256,ciphertextSha256:h,publicationArchiveId:randomUUID(),publicationArchiveSha256:h})));
 const repair={format:'nestory-local-prepare-repair-v1',operationId,packetSha256:h,bindingSha256,originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,
  executorMainSha:'b'.repeat(40),manifestSha256:h,executorSourceSha256:h,
  originalAttempt:{authorizationId:oldAuthorization,nonce:oldNonce,runId:'100',runAttempt:1,intentSha256,claimSha256,publicationSha256:h},
  replacement:{nonce:newNonce,runId:'101',runAttempt:1},eligibilitySha256:h,originalRunSha256:h,createdAt:'2026-10-28T01:30:00.000Z'};
 const eligibility={format:'nestory-local-prepare-repair-observation-v1',operationId,originalAuthorizationId:oldAuthorization,
  observedAt:new Date(Date.now()-1000).toISOString(),authorizationExpiresAt:new Date(Date.now()-10000).toISOString(),authorizationExpiredUnused:true,
  nativePrepareAbsent:true,reservationMatches:true,checkpointMatches:true,controlMatches:true,sourceMatches:true,foreignMatches:true};
 const originalRun={id:100,run_attempt:1,status:'completed',conclusion:'failure',head_sha:PREPARE_REPAIR_ORIGINAL_MAIN,head_branch:'main',event:'workflow_dispatch',
  path:'.github/workflows/pilot-financial-reset-local-custody.yml',repository:{full_name:'soley-bot/nestory'},display_title:`Pilot reset ${operationId} prepare ${oldNonce} execute`};
 repair.eligibilitySha256=hashBytes(canonicalJson(eligibility));
 repair.originalRunSha256=prepareRepairOriginalRunEvidence(originalRun,{operationId,nonce:oldNonce}).sha256;
 const evidence={binding,eligibility,originalRun};
 const nextDoc=structuredClone(doc);nextDoc.mainSha=repair.executorMainSha;nextDoc.transportIntent.authorizationId=randomUUID();
 await assert.rejects(createManualResetCoordinator({store,prepareRepair:repair}).recordIntent(nextDoc),/original_repair_record_required/);
 await assert.rejects(original.recordPrepareRepair(repair),/repair_evidence_required/);
 await assert.rejects(original.recordPrepareRepair(repair,{...evidence,eligibility:{...eligibility,nativePrepareAbsent:false}}),/repair_evidence_changed/);
 await assert.rejects(original.recordPrepareRepair(repair,evidence),/repair_bootstrap_missing/);
 const {bootstrapClaimSha256}=await original.recordBootstrapClaim({format:'nestory-manual-reset-bootstrap-claim-v1',operationId,action,nonce:newNonce,
  mainSha:repair.executorMainSha,packetSha256:h,payloadSha256:h,transferArchiveId:randomUUID(),transferArchiveSha256:h});
 await original.recordBootstrapResponse({operationId,action,nonce:newNonce,bootstrapClaimSha256,runId:101,runAttempt:1});
 await store.putIfAbsent(`${base}/bootstrap/${newNonce}/workflow-post`,Buffer.from(canonicalJson({format:'nestory-local-workflow-post-v1',
  operationId,action,nonce:newNonce,mainSha:repair.executorMainSha})));
 await original.recordPrepareRepair(repair,evidence);
 // Same-process store refuses a second attempt before invoking the helper.
 await assert.rejects(original.recordPrepareRepair(repair,evidence),/journal_write_unknown/);
 const scoped=createManualResetCoordinator({store,prepareRepair:repair});
 const wrong=structuredClone(nextDoc);wrong.transportIntent.authorizationId=oldAuthorization;
 await assert.rejects(scoped.recordIntent(wrong),/repair_intent_changed/);
 const next=await scoped.recordIntent(nextDoc);await scoped.claimDispatch({operationId,action,intentSha256:next.intentSha256});
 await assert.rejects(scoped.recordDispatchResponse({operationId,action,intentSha256:next.intentSha256,runId:102,runAttempt:1}),/repair_run_changed/);
 await scoped.recordDispatchResponse({operationId,action,intentSha256:next.intentSha256,runId:101,runAttempt:1});
 const reopened=await openWindowsResetJournal(options),again=createManualResetCoordinator({store:reopened,prepareRepair:repair});
 await assert.rejects(again.claimDispatch({operationId,action,intentSha256:next.intentSha256}),/existing_or_uncertain_record/);
 assert.deepEqual(await reopened.read(`${base}/intent`),saved);
 assert.ok(await reopened.read(`${base}/repair-once/attempt/intent`));
 assert.ok(await reopened.read(`${base}/bootstrap/${newNonce}/response`));
});
