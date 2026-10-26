import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { createExclusiveDirectoryStore, createSyntheticDirectoryStore, createJsonJournal,
  inspectLocalStoreMechanism, openSyntheticDirectoryStoreReadOnly } from './pilot-finance-reset-durable-store.mjs';

async function fixture(t, strict = false) {
  const parent = await realpath(strict ? path.resolve(import.meta.dirname, '../..') : os.tmpdir());
  const directory = await mkdtemp(path.join(parent, 'pilot-reset-store-test-'));
  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.match(path.basename(resolved), /^pilot-reset-store-test-/);
    await rm(resolved, { recursive: true });
  });
  const storeId = randomUUID();
  return { directory, storeId, store: await (strict ? createExclusiveDirectoryStore : createSyntheticDirectoryStore)({ directory, storeId }) };
}
const binary = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

test('historical store opening never initializes, writes or repairs evidence', async t => {
  const f = await fixture(t), key = 'original/intent';
  await f.store.putIfAbsent(key, binary);
  const before = await readdir(f.directory);
  const reader = await openSyntheticDirectoryStoreReadOnly({ directory: f.directory, storeId: f.storeId });
  assert.deepEqual(await reader.read(key), binary);
  assert.equal(await reader.read('never-created'), null);
  await assert.rejects(() => reader.putIfAbsent('never-created', Buffer.from('forbidden')), /read_only_store/);
  assert.deepEqual(await readdir(f.directory), before);
  const empty = path.join(f.directory, 'empty');
  await mkdir(empty, { mode: 0o700 });
  await assert.rejects(() => openSyntheticDirectoryStoreReadOnly({ directory: empty, storeId: randomUUID() }), /existing_store_required/);
  assert.deepEqual(await readdir(empty), []);
  const slot = path.join(f.directory, hashBytes(key));
  await writeFile(path.join(slot, 'payload.bin'), Buffer.from('truncated'));
  await assert.rejects(() => reader.read(key), /slot_binding_mismatch/);
  assert.equal((await readFile(path.join(slot, 'payload.bin'))).toString(), 'truncated');
});

test('exclusive byte fidelity survives a separate process; conflicting puts never replace bytes', async t => {
  const f = await fixture(t), key = 'financial-reset/test/artifact/archive';
  assert.equal(await f.store.read(key), null);
  assert.equal(await f.store.putIfAbsent(key, binary), 'created');
  assert.equal(await f.store.putIfAbsent(key, Buffer.from('different')), 'exists');
  assert.deepEqual(await f.store.read(key), binary);
  const script = `import {createSyntheticDirectoryStore} from ${JSON.stringify(new URL('./pilot-finance-reset-durable-store.mjs', import.meta.url).href)};
    import {createHash} from 'node:crypto';
    const store=await createSyntheticDirectoryStore({directory:process.argv[1],storeId:process.argv[2]});
    const bytes=await store.read(process.argv[3]);
    process.stdout.write(createHash('sha256').update(bytes).digest('hex'));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, f.directory, f.storeId, key], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, hashBytes(binary));
});

test('simultaneous independent providers can never both create a slot', async t => {
  const f = await fixture(t);
  const second = await createSyntheticDirectoryStore(f);
  const results = await Promise.allSettled([f.store.putIfAbsent('same/slot', binary), second.putIfAbsent('same/slot', binary)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === 'created').length, 1);
  assert.deepEqual(await second.read('same/slot'), binary);
});

for (const stage of ['directory', 'claim', 'payload', 'commit-truncated']) {
  test(`interruption at ${stage} remains UNKNOWN after restart and cannot be completed`, async t => {
    const f = await fixture(t), key = 'operation/stage';
    const slot = path.join(f.directory, hashBytes(key));
    await mkdir(slot, { mode: 0o700 });
    const claim = Buffer.from(canonicalJson({ format: 'nestory-exclusive-slot-v1', storeId: f.storeId,
      keySha256: hashBytes(key), sha256: hashBytes(binary), byteLength: binary.length }));
    if (stage !== 'directory') await writeFile(path.join(slot, 'claim.json'), claim, { mode: 0o600, flag: 'wx' });
    if (['payload', 'commit-truncated'].includes(stage)) await writeFile(path.join(slot, 'payload.bin'), binary, { mode: 0o600, flag: 'wx' });
    if (stage === 'commit-truncated') await writeFile(path.join(slot, 'commit.json'), '{', { mode: 0o600, flag: 'wx' });
    const before = await readdir(slot);
    const restarted = await createSyntheticDirectoryStore(f);
    await assert.rejects(restarted.read(key), /reset_store_(?:slot_incomplete_or_foreign|slot_binding_mismatch)/);
    await assert.rejects(restarted.putIfAbsent(key, binary), /reset_store_(?:slot_incomplete_or_foreign|slot_binding_mismatch)/);
    assert.deepEqual(await readdir(slot), before);
  });
}

test('changed payload, claim, commit and store identity are rejected', async t => {
  for (const target of ['payload.bin', 'claim.json', 'commit.json']) {
    const f = await fixture(t), key = 'operation/stage';
    await f.store.putIfAbsent(key, binary);
    const destination = path.join(f.directory, hashBytes(key), target);
    const bytes = await readFile(destination); bytes[0] ^= 1;
    await writeFile(destination, bytes);
    await assert.rejects(f.store.read(key), /reset_store_slot_binding_mismatch/);
    await assert.rejects(f.store.putIfAbsent(key, binary), /reset_store_slot_binding_mismatch/);
  }
  const f = await fixture(t);
  await assert.rejects(createSyntheticDirectoryStore({ directory: f.directory, storeId: randomUUID() }), /store_identity_changed/);
});

test('path-like keys are confined to hashed slots and malformed keys dispatch nothing', async t => {
  const f = await fixture(t);
  for (const key of ['../outside', 'a//b', 'a\\b', 'x\0y', '', 'C:/Windows']) {
    await assert.rejects(f.store.putIfAbsent(key, binary), /key_invalid/);
  }
  assert.deepEqual(await readdir(f.directory), ['store.json']);
  await f.store.putIfAbsent('a/b/c', binary);
  assert.deepEqual((await readdir(f.directory)).sort(), [hashBytes('a/b/c'), 'store.json'].sort());
});

test('strict directory sync is distinct from synthetic process-restart evidence', async t => {
  const f = await fixture(t);
  const mechanism = inspectLocalStoreMechanism(f.store);
  assert.equal(mechanism.kind, 'synthetic-file-sync-only');
  assert.equal(mechanism.retentionAuthority, 'external-verification-required');
  assert.throws(() => inspectLocalStoreMechanism({ durable: true }), /unrecognized_local_provider/);
  if (process.platform === 'win32') {
    await assert.rejects(createExclusiveDirectoryStore(f), /directory_sync_unavailable/);
  } else {
    await assert.rejects(createExclusiveDirectoryStore(f), /(?:store_identity_changed|directory_ancestor_untrusted)/);
    let strict;
    try { ({ store: strict } = await fixture(t, true)); }
    catch (error) { if (/directory_ancestor_untrusted/.test(error.message)) { t.skip('No trusted ancestor chain in this test workspace.'); return; } throw error; }
    await strict.putIfAbsent('strict/intent', binary);
    assert.equal(inspectLocalStoreMechanism(strict).kind, 'exclusive-file-and-directory-fsync');
  }
});

test('canonical JSON journal matches string port and prevents obvious token persistence', async t => {
  const f = await fixture(t), journal = createJsonJournal({ store: f.store });
  const record = canonicalJson({ format: 'synthetic-intent', operationId: randomUUID(), requestSha256: hashBytes(binary) });
  assert.equal(await journal.read('record/intent'), null);
  assert.equal(await journal.putIfAbsent('record/intent', record), 'created');
  assert.equal(await journal.read('record/intent'), record);
  for (const value of [{ accessToken: 'never-persist' }, { nested: { Authorization: 'x' } },
    { tokenText: 'Bearer never-persist' }, { tokenText: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature' }]) {
    await assert.rejects(journal.putIfAbsent('bad/intent', canonicalJson(value)), /credential_forbidden/);
  }
  await assert.rejects(journal.putIfAbsent('bad/intent', '{ "a":1}'), /noncanonical/);
  assert.equal(await f.store.read('bad/intent'), null);
});

test('journal provider failures never echo secret-bearing exception messages', async () => {
  const journal = createJsonJournal({ store: { read() { throw new Error('Bearer confidential'); }, putIfAbsent() { throw new Error('password=confidential'); } } });
  await assert.rejects(journal.read('x'), error => error.message === 'reset_store_journal_read_unknown');
  await assert.rejects(journal.putIfAbsent('x', '{}'), error => error.message === 'reset_store_journal_write_unknown');
});
