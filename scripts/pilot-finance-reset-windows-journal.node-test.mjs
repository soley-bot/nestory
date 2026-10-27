import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, realpath, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashBytes } from './pilot-finance-reset-operator-core.mjs';
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
