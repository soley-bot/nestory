// AWS-only conditional storage. No provisioning, credential discovery, retries,
// overwrite, delete, arbitrary endpoints, or authorization inferred from a brand.
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';

const branded = new WeakMap();
const LIMIT = 64 * 1024 * 1024;
const copy = value => JSON.parse(canonicalJson(value));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const fail = code => { const error = new Error(`reset_external_store_${code}`); error.requiresReconciliation = true; throw error; };
const fields = ['format', 'storeId', 'accountId', 'bucket', 'region', 'prefix', 'runtimeRoleArn', 'policySha256', 'retentionUntil', 'minimumRetentionDays', 'accessMode'];
export function assertAwsS3RecoveryConfiguration(input) {
  const c = copy(input);
  if (!same(Object.keys(c).sort(), [...fields].sort()) || c.format !== 'nestory-aws-s3-recovery-store-v1' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(c.storeId) ||
      !/^\d{12}$/.test(c.accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(c.bucket) ||
      !/^(us|eu|ap|sa|ca|me|af|il|mx)-(central|north|south|east|west|northeast|southeast)-[1-9]$/.test(c.region) ||
      !/^[a-z0-9][a-z0-9/_-]{0,126}$/.test(c.prefix) || c.prefix.split('/').some(v => !v) ||
      !new RegExp(`^arn:aws:iam::${c.accountId}:role/[A-Za-z0-9+=,.@_-]{1,64}$`).test(c.runtimeRoleArn) ||
      !['read-only', 'append-only'].includes(c.accessMode) || !/^[a-f0-9]{64}$/.test(c.policySha256) || !Number.isInteger(c.minimumRetentionDays) ||
      c.minimumRetentionDays < 1 || c.minimumRetentionDays > 3650 ||
      typeof c.retentionUntil !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(c.retentionUntil) ||
      !Number.isFinite(Date.parse(c.retentionUntil)) || new Date(c.retentionUntil).toISOString() !== c.retentionUntil) fail('configuration_invalid');
  return Object.freeze(c);
}

export function assertAwsS3CallerIdentity(configuration, identity) {
  const c = assertAwsS3RecoveryConfiguration(configuration);
  const roleName = c.runtimeRoleArn.split('/')[1];
  const expectedPrefix = `arn:aws:sts::${c.accountId}:assumed-role/${roleName}/`;
  if (identity?.Account !== c.accountId || typeof identity.Arn !== 'string' || !identity.Arn.startsWith(expectedPrefix) ||
      !/^[A-Za-z0-9+=,.@_-]{2,64}$/.test(identity.Arn.slice(expectedPrefix.length)) ||
      typeof identity.UserId !== 'string' || !/^AROA[A-Z0-9]+:[A-Za-z0-9+=,.@_-]{2,64}$/.test(identity.UserId) ||
      identity.UserId.split(':')[1] !== identity.Arn.slice(expectedPrefix.length)) fail('caller_identity_mismatch');
}

// Required denies are global for object paths, so a broader IAM Allow cannot
// accidentally permit a shadow version or deletion. Additional policy statements
// may grant the reviewed role read/create permissions; their full hash is pinned.
export function requiredAwsS3RecoveryPolicy(input) {
  const c = assertAwsS3RecoveryConfiguration(input);
  const bucket = `arn:aws:s3:::${c.bucket}`, objects = `${bucket}/${c.prefix}/*`;
  const suffix = c.storeId.replaceAll('-', '');
  return { Version: '2012-10-17', Statement: [
    { Sid: `ResetRequireConditionalCreate${suffix}`, Effect: 'Deny', Principal: '*', Action: 's3:PutObject', Resource: objects,
      Condition: { Null: { 's3:if-none-match': 'true' } } },
    { Sid: `ResetDenyObjectReplacement${suffix}`, Effect: 'Deny', Principal: '*', Resource: objects,
      Action: ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutObjectRetention', 's3:BypassGovernanceRetention', 's3:PutObjectLegalHold', 's3:PutObjectAcl',
        's3:ReplicateObject', 's3:ReplicateDelete', 's3:ReplicateTags', 's3:ObjectOwnerOverrideToBucketOwner'] },
    { Sid: `ResetDenyRuntimeControlPlane${suffix}`, Effect: 'Deny', Principal: '*', Resource: bucket,
      Action: ['s3:PutBucketPolicy', 's3:DeleteBucketPolicy', 's3:PutBucketVersioning', 's3:PutLifecycleConfiguration',
        's3:PutBucketObjectLockConfiguration', 's3:PutBucketPublicAccessBlock', 's3:PutBucketOwnershipControls', 's3:DeleteBucket',
        's3:PutReplicationConfiguration', 's3:PutEncryptionConfiguration'],
      Condition: { ArnEquals: { 'aws:PrincipalArn': c.runtimeRoleArn } } },
    ...(c.accessMode === 'read-only' ? [{ Sid: `ResetDenyRuntimeArtifactWrites${suffix}`, Effect: 'Deny', Principal: '*', Resource: objects,
      Action: 's3:PutObject', Condition: { ArnEquals: { 'aws:PrincipalArn': c.runtimeRoleArn } } }] : []),
  ] };
}

function slot(c, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]{0,511}$/.test(key) || key.split('/').some(v => !v)) fail('key_invalid');
  return `${c.prefix}/${hashBytes(key)}`;
}

async function protocol(configuration, request) {
  const c = assertAwsS3RecoveryConfiguration(configuration);
  const base = { Bucket: c.bucket, ExpectedBucketOwner: c.accountId };
  const attempted = new Set();
  async function call(name, input) {
    try { return await request(name, input); } catch (error) {
      // Only a server precondition failure has an unambiguous existing outcome.
      if (name === 'PutObject' && error?.name === 'PreconditionFailed' && error?.$metadata?.httpStatusCode === 412) return { existing: true };
      if (name === 'GetBucketLifecycleConfiguration' && error?.name === 'NoSuchLifecycleConfiguration' && error?.$metadata?.httpStatusCode === 404) return { absent: true };
      if (name === 'GetBucketReplication' && error?.name === 'ReplicationConfigurationNotFoundError' && error?.$metadata?.httpStatusCode === 404) return { absent: true };
      fail(name === 'PutObject' ? 'write_unknown' : 'read_unknown');
    }
  }
  async function assertCurrent() {
    if (Date.parse(c.retentionUntil) <= Date.now()) fail('retention_expired');
    const locationValue = (await call('GetBucketLocation', base)).LocationConstraint;
    const location = locationValue === 'EU' ? 'eu-west-1' : locationValue || 'us-east-1';
    if (location !== c.region) fail('region_binding_mismatch');
    if ((await call('GetBucketLifecycleConfiguration', base)).absent !== true) fail('lifecycle_forbidden');
    if ((await call('GetBucketReplication', base)).absent !== true) fail('replication_forbidden');
    const encryption = (await call('GetBucketEncryption', base)).ServerSideEncryptionConfiguration?.Rules;
    if (!Array.isArray(encryption) || encryption.length !== 1 || encryption[0].ApplyServerSideEncryptionByDefault?.SSEAlgorithm !== 'AES256' ||
        encryption[0].ApplyServerSideEncryptionByDefault?.KMSMasterKeyID || encryption[0].BucketKeyEnabled === true) fail('server_encryption_required');
    const versioning = await call('GetBucketVersioning', base);
    if (versioning.Status !== 'Enabled') fail('versioning_required');
    const lock = (await call('GetObjectLockConfiguration', base)).ObjectLockConfiguration;
    if (lock?.ObjectLockEnabled !== 'Enabled' || lock.Rule?.DefaultRetention?.Mode !== 'COMPLIANCE' ||
        !Number.isInteger(lock.Rule.DefaultRetention.Days) || lock.Rule.DefaultRetention.Days < c.minimumRetentionDays ||
        Date.now() + lock.Rule.DefaultRetention.Days * 86400000 < Date.parse(c.retentionUntil)) fail('compliance_retention_required');
    const publicBlock = (await call('GetPublicAccessBlock', base)).PublicAccessBlockConfiguration;
    if (!['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => publicBlock?.[key] === true)) fail('private_bucket_required');
    const owners = (await call('GetBucketOwnershipControls', base)).OwnershipControls?.Rules;
    if (!same(owners, [{ ObjectOwnership: 'BucketOwnerEnforced' }])) fail('owner_enforcement_required');
    const rawPolicy = (await call('GetBucketPolicy', base)).Policy;
    if (typeof rawPolicy !== 'string' || Buffer.byteLength(rawPolicy) > 32768) fail('policy_invalid');
    let policy; try { policy = JSON.parse(rawPolicy); } catch { fail('policy_invalid'); }
    if (hashBytes(canonicalJson(policy)) !== c.policySha256 || !Array.isArray(policy.Statement)) fail('policy_binding_mismatch');
    for (const deny of requiredAwsS3RecoveryPolicy(c).Statement) {
      if (!policy.Statement.some(statement => same(statement, deny))) fail('required_policy_deny_missing');
    }
    return Object.freeze({ configurationSha256: hashBytes(canonicalJson(c)), policySha256: c.policySha256, retentionUntil: c.retentionUntil });
  }
  async function readInternal(key, expectedVersion) {
    const Key = slot(c, key);
    // A current-key 404 could hide a delete marker. Inspect only this exact
    // hashed slot, bounded to two versions, then GET its immutable version.
    const listing = await call('ListObjectVersions', { ...base, Prefix: Key, MaxKeys: 2 });
    const versions = listing.Versions ?? [], markers = listing.DeleteMarkers ?? [];
    if (listing.IsTruncated !== false || listing.Prefix !== Key || listing.MaxKeys !== 2 ||
        !Array.isArray(versions) || !Array.isArray(markers) || markers.length || versions.length > 1 || versions.some(v => v?.Key !== Key)) fail('slot_history_invalid');
    if (!versions.length) { if (expectedVersion) fail('written_version_missing'); return null; }
    const version = versions[0];
    if (version.IsLatest !== true || typeof version.VersionId !== 'string' || !version.VersionId || version.VersionId === 'null' ||
        expectedVersion && version.VersionId !== expectedVersion) fail('version_binding_mismatch');
    const value = await call('GetObject', { ...base, Key, VersionId: version.VersionId, ChecksumMode: 'ENABLED' });
    if (value.VersionId !== version.VersionId || value.DeleteMarker || value.ObjectLockMode !== 'COMPLIANCE' ||
        !(value.ObjectLockRetainUntilDate instanceof Date) || !Number.isFinite(value.ObjectLockRetainUntilDate.getTime()) ||
        value.ObjectLockRetainUntilDate.getTime() < Date.parse(c.retentionUntil) ||
        !Number.isSafeInteger(value.ContentLength) || value.ContentLength < 0 || value.ContentLength > LIMIT ||
        value.ServerSideEncryption !== 'AES256' || value.SSEKMSKeyId || value.SSECustomerAlgorithm || value.Metadata?.['nestory-store-id'] !== c.storeId ||
        value.Metadata?.['nestory-slot-sha256'] !== hashBytes(key) ||
        typeof value.ChecksumSHA256 !== 'string') { value.Body?.destroy?.(); fail('object_evidence_invalid'); }
    const chunks = []; let length = 0;
    try {
      for await (const chunk of value.Body) {
        if (!(chunk instanceof Uint8Array)) fail('body_invalid');
        length += chunk.length;
        if (length > LIMIT || length > value.ContentLength) fail('body_limit');
        chunks.push(Buffer.from(chunk));
      }
    } catch { value.Body?.destroy?.(); fail('body_unknown'); }
    const bytes = Buffer.concat(chunks);
    if (length !== value.ContentLength || Buffer.from(hashBytes(bytes), 'hex').toString('base64') !== value.ChecksumSHA256) fail('checksum_mismatch');
    return bytes;
  }
  await assertCurrent();
  return Object.freeze({
    assertCurrent,
    async read(key) { slot(c, key); await assertCurrent(); return readInternal(key); },
    async putIfAbsent(key, input) {
      if (c.accessMode !== 'append-only') fail('read_only_store');
      const Key = slot(c, key);
      if (!(input instanceof Uint8Array) || input.length > LIMIT) fail('bytes_invalid');
      const bytes = Buffer.from(input);
      if (attempted.has(Key)) fail('previous_attempt_requires_reconciliation');
      await assertCurrent();
      // Existing history, including a delete marker, may never be recreated.
      if (await readInternal(key) !== null) return 'exists';
      attempted.add(Key);
      const result = await call('PutObject', { ...base, Key, Body: bytes, IfNoneMatch: '*',
        ContentLength: bytes.length, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256',
        Metadata: { 'nestory-store-id': c.storeId, 'nestory-slot-sha256': hashBytes(key) },
        ChecksumSHA256: Buffer.from(hashBytes(bytes), 'hex').toString('base64') });
      if (result.existing) { if (await readInternal(key) === null) fail('existing_readback_missing'); return 'exists'; }
      if (typeof result.VersionId !== 'string' || !result.VersionId || result.VersionId === 'null') fail('write_version_missing');
      const observed = await readInternal(key, result.VersionId);
      if (!observed?.equals(bytes)) fail('write_readback_mismatch');
      return 'created';
    },
  });
}

export async function createAwsS3RecoveryStore({ configuration, credentials }) {
  const c = assertAwsS3RecoveryConfiguration(configuration);
  if (!credentials || !same(Object.keys(credentials).sort(), ['accessKeyId', 'secretAccessKey', 'sessionToken']) ||
      !Object.values(credentials).every(value => typeof value === 'string' && value.length > 0)) fail('temporary_credentials_required');
  const sdk = await import('@aws-sdk/client-s3');
  const sts = await import('@aws-sdk/client-sts');
  const options = { region: c.region, credentials: { ...credentials }, maxAttempts: 1,
    followRegionRedirects: false, useFipsEndpoint: false, useDualstackEndpoint: false,
    ignoreConfiguredEndpointUrls: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' };
  const identityClient = new sts.STSClient(options);
  let identity;
  try { identity = await identityClient.send(new sts.GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(15000) }); }
  catch { fail('caller_identity_unavailable'); }
  finally { identityClient.destroy(); }
  assertAwsS3CallerIdentity(c, identity);
  const client = new sdk.S3Client(options);
  const store = await protocol(c, (name, input) => client.send(new sdk[`${name}Command`](input), { abortSignal: AbortSignal.timeout(30000) }));
  branded.set(store, Object.freeze({ kind: 'aws-s3-conditional-versioned-object-lock', storeId: c.storeId,
    configurationSha256: hashBytes(canonicalJson(c)), resource: Object.freeze({ accountId: c.accountId, bucket: c.bucket, region: c.region, prefix: c.prefix }),
    policySha256: c.policySha256, retentionUntil: c.retentionUntil, accessMode: c.accessMode }));
  return store;
}
export function inspectExternalStoreMechanism(store) {
  const value = branded.get(store);
  if (!value) fail('unverified_provider');
  return copy(value);
}
// Offline transport simulations can exercise the protocol, but never receive a
// production brand or satisfy the encrypted recovery reader/runtime inspector.
export const createSyntheticS3RecoveryStore = ({ configuration, request }) => protocol(configuration, request);
