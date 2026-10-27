import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { assertAwsS3RecoveryConfiguration, assertAwsS3CallerIdentity, requiredAwsS3RecoveryPolicy, createSyntheticS3RecoveryStore, inspectExternalStoreMechanism } from './pilot-finance-reset-external-store.mjs';

function fixture(overrides = {}) {
  const configuration = { format: 'nestory-aws-s3-recovery-store-v1', storeId: '11111111-1111-4111-8111-111111111111',
    accountId: '123456789012', bucket: 'synthetic-reset-recovery', region: 'us-east-1', prefix: 'journal',
    runtimeRoleArn: 'arn:aws:iam::123456789012:role/reset-runtime', policySha256: '0'.repeat(64), accessMode: 'append-only',
    retentionUntil: new Date(Date.now() + 86400000).toISOString().replace(/\.\d{3}Z$/, '.000Z'), minimumRetentionDays: 7 };
  const policy = requiredAwsS3RecoveryPolicy(configuration);
  configuration.policySha256 = hashBytes(canonicalJson(policy));
  const calls = [], objects = new Map();
  const request = async (name, input) => {
    calls.push({ name, input });
    if (overrides[name]) return overrides[name](input, objects);
    if (name === 'GetBucketLocation') return {};
    if (name === 'GetBucketLifecycleConfiguration') throw Object.assign(new Error(), { name: 'NoSuchLifecycleConfiguration', $metadata: { httpStatusCode: 404 } });
    if (name === 'GetBucketReplication') throw Object.assign(new Error(), { name: 'ReplicationConfigurationNotFoundError', $metadata: { httpStatusCode: 404 } });
    if (name === 'GetBucketEncryption') return { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] } };
    if (name === 'GetBucketVersioning') return { Status: 'Enabled' };
    if (name === 'GetObjectLockConfiguration') return { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 7 } } } };
    if (name === 'GetPublicAccessBlock') return { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } };
    if (name === 'GetBucketOwnershipControls') return { OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } };
    if (name === 'GetBucketPolicy') return { Policy: JSON.stringify(policy) };
    if (name === 'ListObjectVersions') return { IsTruncated: false, Prefix: input.Prefix, MaxKeys: 2,
      Versions: objects.has(input.Prefix) ? [{ Key: input.Prefix, VersionId: 'version-1', IsLatest: true }] : [] };
    if (name === 'PutObject') { objects.set(input.Key, Buffer.from(input.Body)); return { VersionId: 'version-1' }; }
    if (name === 'GetObject') {
      const bytes = objects.get(input.Key);
      return { VersionId: 'version-1', ContentLength: bytes.length, Body: (async function* () { yield bytes; })(),
        ChecksumSHA256: Buffer.from(hashBytes(bytes), 'hex').toString('base64'), ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 86400000), ServerSideEncryption: 'AES256',
        Metadata: { 'nestory-store-id': configuration.storeId, 'nestory-slot-sha256': input.Key.split('/').at(-1) } };
    }
    throw new Error('unexpected command');
  };
  return { configuration, policy, calls, objects, request, open: () => createSyntheticS3RecoveryStore({ configuration, request }) };
}
test('synthetic protocol writes once with server conditional create and exact retained-version readback; cannot brand', async () => {
  const f = fixture(), store = await f.open();
  assert.equal(await store.read('operation/one'), null);
  assert.equal(await store.putIfAbsent('operation/one', Buffer.from('immutable')), 'created');
  assert.equal((await store.read('operation/one')).toString(), 'immutable');
  const put = f.calls.find(v => v.name === 'PutObject');
  assert.equal(put.input.IfNoneMatch, '*');
  assert.equal(put.input.ExpectedBucketOwner, f.configuration.accountId);
  assert.equal(f.calls.filter(v => v.name === 'PutObject').length, 1);
  assert.ok(f.calls.filter(v => v.name === 'GetObject').every(v => v.input.VersionId === 'version-1'));
  assert.throws(() => inspectExternalStoreMechanism(store), /unverified_provider/);
  await assert.rejects(store.putIfAbsent('operation/one', Buffer.from('retry')), /previous_attempt/);
});
test('configuration refuses arbitrary endpoints, paths and credential fields', () => {
  const { configuration: c } = fixture();
  for (const change of [{ endpoint: 'https://foreign.example' }, { prefix: '../escape' }, { region: 'moon-1' }, { accountId: 'bad' },
    { retentionUntil: '2027-02-30T00:00:00.000Z' }]) {
    assert.throws(() => assertAwsS3RecoveryConfiguration({ ...c, ...change }), /configuration_invalid/);
  }
});

test('ownership deletion uses the documented IAM Put permission, not the API operation name', () => {
  const { policy } = fixture();
  const actions = policy.Statement.flatMap(statement => statement.Action);
  assert.ok(actions.includes('s3:PutBucketOwnershipControls'));
  assert.ok(!actions.includes('s3:DeleteBucketOwnershipControls'));
});
test('caller identity pins the actual AWS account, pathless role and session', () => {
  const { configuration } = fixture();
  const identity = { Account: configuration.accountId, Arn: `arn:aws:sts::${configuration.accountId}:assumed-role/reset-runtime/session1`, UserId: 'AROA12345678901234567:session1' };
  assert.doesNotThrow(() => assertAwsS3CallerIdentity(configuration, identity));
  for (const changed of [{ Account: '999999999999' }, { Arn: identity.Arn.replace('reset-runtime', 'admin') },
    { Arn: configuration.runtimeRoleArn }, { UserId: 'AROA12345678901234567:another' }]) {
    assert.throws(() => assertAwsS3CallerIdentity(configuration, { ...identity, ...changed }), /caller_identity_mismatch/);
  }
  assert.throws(() => assertAwsS3RecoveryConfiguration({ ...configuration, runtimeRoleArn: configuration.runtimeRoleArn.replace('role/', 'role/path/') }), /configuration_invalid/);
});
for (const [name, result] of [
  ['GetBucketVersioning', { Status: 'Suspended' }],
  ['GetBucketLocation', { LocationConstraint: 'eu-west-1' }],
  ['GetObjectLockConfiguration', { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled', Rule: { DefaultRetention: { Mode: 'GOVERNANCE', Days: 7 } } } }],
  ['GetBucketPolicy', { Policy: '{}' }],
  ['GetBucketLifecycleConfiguration', { Rules: [{ Status: 'Enabled' }] }],
  ['GetBucketReplication', { ReplicationConfiguration: { Rules: [] } }],
  ['GetBucketEncryption', { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' } }] } }],
]) test(`live ${name} drift fails before any write`, async () => {
  const changed = fixture({ [name]: async () => result });
  await assert.rejects(changed.open());
  assert.equal(changed.calls.some(v => v.name === 'PutObject'), false);
});
for (const status of [409, 500]) test(`write ${status} remains unknown and never retries`, async () => {
  const f = fixture({ PutObject: async () => { throw Object.assign(new Error('secret provider text'), { name: 'ConditionalRequestConflict', $metadata: { httpStatusCode: status } }); } });
  const store = await f.open();
  await assert.rejects(store.putIfAbsent('slot', Buffer.from('x')), /^Error: reset_external_store_write_unknown$/);
  await assert.rejects(store.putIfAbsent('slot', Buffer.from('x')), /previous_attempt/);
  assert.equal(f.calls.filter(v => v.name === 'PutObject').length, 1);
});
test('412 requires exact existing readback and cannot become created', async () => {
  const f = fixture({ PutObject: async (input, objects) => {
    objects.set(input.Key, Buffer.from('winner'));
    throw Object.assign(new Error(), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
  } });
  const store = await f.open();
  assert.equal(await store.putIfAbsent('slot', Buffer.from('loser')), 'exists');
});
for (const listing of [{ DeleteMarkers: [{ VersionId: 'deleted' }] }, { IsTruncated: true },
  { Versions: [{ Key: 'foreign', VersionId: '1', IsLatest: true }] }]) test('deleted, truncated, or foreign slot history cannot be absent', async () => {
  const f = fixture({ ListObjectVersions: async () => listing }), store = await f.open();
  await assert.rejects(store.read('slot'), /slot_history_invalid/);
  await assert.rejects(store.putIfAbsent('slot', Buffer.from('x')), /slot_history_invalid/);
  assert.equal(f.calls.some(v => v.name === 'PutObject'), false);
});
test('read denial is unknown, never missing', async () => {
  const f = fixture({ ListObjectVersions: async () => { throw Object.assign(new Error('secret'), { name: 'AccessDenied' }); } });
  await assert.rejects((await f.open()).read('slot'), /^Error: reset_external_store_read_unknown$/);
});
test('old per-version retention and corrupt checksum fail closed', async () => {
  for (const change of [{ ObjectLockRetainUntilDate: new Date(0) }, { ObjectLockRetainUntilDate: new Date(NaN) }, { ChecksumSHA256: 'wrong' }]) {
    const f = fixture({ GetObject: async input => ({ VersionId: 'version-1', ContentLength: 1,
      Body: (async function* () { yield Buffer.from('x'); })(), ObjectLockMode: 'COMPLIANCE',
      ServerSideEncryption: 'AES256', Metadata: { 'nestory-store-id': '11111111-1111-4111-8111-111111111111', 'nestory-slot-sha256': input.Key.split('/').at(-1) },
      ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 86400000), ChecksumSHA256: Buffer.from(hashBytes('x'), 'hex').toString('base64'), ...change }) });
    f.objects.set(`${f.configuration.prefix}/${hashBytes('slot')}`, Buffer.from('x'));
    await assert.rejects((await f.open()).read('slot'));
  }
});
test('changed live policy is refused on existing provider before write', async () => {
  const f = fixture(), store = await f.open();
  f.policy.Statement.pop();
  await assert.rejects(store.putIfAbsent('slot', Buffer.from('x')), /policy_binding_mismatch/);
  assert.equal(f.calls.some(v => v.name === 'PutObject'), false);
});
test('read-only artifact policy denies runtime writes and adapter rejects before a request', async () => {
  const f = fixture(); f.configuration.accessMode = 'read-only';
  f.policy.Statement = requiredAwsS3RecoveryPolicy(f.configuration).Statement;
  f.configuration.policySha256 = hashBytes(canonicalJson(f.policy));
  const store = await f.open(), before = f.calls.length;
  await assert.rejects(store.putIfAbsent('slot', Buffer.from('x')), /read_only_store/);
  assert.equal(f.calls.length, before);
  assert.ok(f.policy.Statement.some(s => s.Action === 's3:PutObject' && s.Condition?.ArnEquals?.['aws:PrincipalArn'] === f.configuration.runtimeRoleArn));
});
test('persisted write with lost acknowledgement is reconciled across a fresh instance without retry', async () => {
  const f = fixture({ PutObject: async (input, objects) => {
    objects.set(input.Key, Buffer.from(input.Body)); throw new Error('lost acknowledgement');
  } });
  const original = await f.open();
  await assert.rejects(original.putIfAbsent('slot', Buffer.from('committed')), /write_unknown/);
  await assert.rejects(original.putIfAbsent('slot', Buffer.from('committed')), /previous_attempt/);
  const restarted = await f.open();
  assert.equal((await restarted.read('slot')).toString(), 'committed');
  assert.equal(await restarted.putIfAbsent('slot', Buffer.from('different')), 'exists');
  assert.equal(f.calls.filter(v => v.name === 'PutObject').length, 1);
});
test('independent concurrent stores rely on server conditional create, producing exactly one winner', async () => {
  const f = fixture({ PutObject: async (input, objects) => {
    assert.equal(input.IfNoneMatch, '*');
    if (objects.has(input.Key)) throw Object.assign(new Error(), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
    objects.set(input.Key, Buffer.from(input.Body)); return { VersionId: 'version-1' };
  } });
  const a = await f.open(), b = await f.open();
  const outcomes = await Promise.all([a.putIfAbsent('slot', Buffer.from('one')), b.putIfAbsent('slot', Buffer.from('two'))]);
  assert.deepEqual(outcomes.sort(), ['created', 'exists']);
  assert.ok(['one', 'two'].includes((await a.read('slot')).toString()));
  assert.equal(f.calls.filter(v => v.name === 'PutObject').length, 2);
});
test('incomplete or malformed listing cannot establish unused slot', async () => {
  for (const result of [{}, { IsTruncated: false }, { IsTruncated: false, Versions: 'invalid' }]) {
    const f = fixture({ ListObjectVersions: async () => result });
    await assert.rejects((await f.open()).read('slot'), /slot_history_invalid/);
  }
});
test('truncated body and wrong per-object identity fail without returning bytes', async () => {
  for (const change of [{ ContentLength: 2 }, { Metadata: { 'nestory-store-id': 'foreign' } },
    { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'former-key' }, { SSEKMSKeyId: 'unexpected-key' }, { SSECustomerAlgorithm: 'AES256' }]) {
    const f = fixture({ GetObject: async input => ({ VersionId: 'version-1', ContentLength: 1,
      Body: (async function* () { yield Buffer.from('x'); })(), ObjectLockMode: 'COMPLIANCE', ServerSideEncryption: 'AES256',
      Metadata: { 'nestory-store-id': '11111111-1111-4111-8111-111111111111', 'nestory-slot-sha256': input.Key.split('/').at(-1) },
      ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 86400000), ChecksumSHA256: Buffer.from(hashBytes('x'), 'hex').toString('base64'), ...change }) });
    f.objects.set(`${f.configuration.prefix}/${hashBytes('slot')}`, Buffer.from('x'));
    await assert.rejects((await f.open()).read('slot'));
  }
});
