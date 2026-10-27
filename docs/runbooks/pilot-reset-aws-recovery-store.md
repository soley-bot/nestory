# AWS recovery storage for the GitHub-hosted reset route

This is a prepared adapter and provisioning specification. No AWS account, role,
bucket, trust policy, retention setting, key escrow, or customer copy has been
created or approved by this change. A successful synthetic test is not hosted
storage proof. The reset remains subject to its reviewed recovery plan and
protected execution controls.

## Provider decision

Use an independent AWS S3 general purpose bucket for each recovery store, outside
the target Supabase project's database, Storage, credentials, and restore scope.
The existing connected services do not establish equivalent recovery guarantees:

- Supabase's S3 compatibility documentation explicitly excludes versioning and
  Object Lock; deleted objects cannot be recovered through object versions.
  [Supabase compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- Vercel private Blob supports fresh reads with `useCache:false` and defaults to
  refusing overwrite. Those capabilities are useful, but its documented API does
  not establish retained immutable versions and policy-enforced denial of runtime
  replacement/deletion. This is an unproven retention boundary, not a claim that
  Vercel reads are eventually consistent.
  [Vercel SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)
- AWS documents atomic conditional creation and bucket policy enforcement.
  Object Lock protects a version; it does **not** stop a new version or delete
  marker from hiding that version. The adapter therefore requires both retention
  and explicit policy restrictions.
  [Conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
  [policy enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html),
  [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)

## Exact reviewed configuration

`scripts/pilot-finance-reset-external-store.mjs` exports
`createAwsS3RecoveryStore({ configuration, credentials })` and a provider-owned
`inspectExternalStoreMechanism(store)` brand. No caller-supplied callback or
metadata can create that brand. The synthetic constructor cannot pass inspection.

Each configuration has exactly these fields:

| Field | Required value |
| --- | --- |
| `format` | `nestory-aws-s3-recovery-store-v1` |
| `storeId` | Reviewed stable lowercase UUID |
| `accountId` | Exact 12-digit AWS account owner |
| `bucket` | Dedicated DNS-compatible bucket name, no dots or endpoint syntax |
| `region` | Exact supported commercial AWS region |
| `prefix` | Reviewed safe lowercase path, no empty components or trailing slash |
| `runtimeRoleArn` | Exact same-account **pathless** IAM role ARN |
| `accessMode` | `append-only` for journal; `read-only` for artifacts |
| `policySha256` | SHA-256 of canonical JSON of the **entire** installed bucket policy |
| `retentionUntil` | Explicit reviewed UTC deadline, format `YYYY-MM-DDTHH:mm:ss.000Z` |
| `minimumRetentionDays` | Explicit reviewed integer from 1 through 3650 |

There is deliberately no retention default. Compliance retention is a material,
potentially irreversible storage decision; the operator must obtain the actual
duration and deadline before provisioning. Bucket default retention must cover
the absolute deadline for newly written objects; existing versions must each
already cover it. Extending configuration alone does not extend stored versions.

The fixed factory accepts explicit short-lived `accessKeyId`, `secretAccessKey`,
and `sessionToken` in memory. STS verifies the actual account, assumed role, and
session before any S3 request. Static long-lived credentials, role paths, alternate
endpoints, arbitrary clients, and credential-discovery callbacks are unsupported.
The pinned AWS SDK uses one attempt per request, ignores configured endpoint
overrides, disables region redirects, and sets 15-second STS / 30-second S3
request deadlines. No credential values belong in configuration or evidence.

## Policy template and required permissions

`requiredAwsS3RecoveryPolicy(configuration)` is the reviewed deny-statement
generator. It does not install a policy. Generate it locally from a non-secret
configuration, initially using a 64-zero `policySha256`, then combine the statements
with the reviewed role grants, canonicalize the complete policy with
`canonicalJson`, compute `hashBytes`, and pin that result in configuration.
The factory requires every generated deny statement exactly and independently
compares the complete live policy hash. Do not weaken a deny to make setup pass.

The generator requires unconditional global denies at the protected object
prefix for PUT without `If-None-Match`, deletion/version deletion, retention or
legal-hold changes, ACL changes, and inbound replication. It denies runtime
changes to policy, versioning, lifecycle, Object Lock, ownership, public access,
replication, encryption, and bucket deletion. The artifact prefix additionally
denies **all** runtime PUTs. This runtime never publishes recovery artifacts.

The separate provisioning review supplies least-privilege grants for these reads:

- Bucket: `s3:GetBucketLocation`, `s3:GetBucketVersioning`,
  `s3:GetBucketObjectLockConfiguration`, `s3:GetBucketPublicAccessBlock`,
  `s3:GetBucketOwnershipControls`, `s3:GetBucketPolicy`,
  `s3:GetLifecycleConfiguration`, `s3:GetReplicationConfiguration`,
  `s3:GetEncryptionConfiguration`, and `s3:ListBucketVersions` restricted to
  the configured prefix.
- Objects: `s3:GetObjectVersion` and `s3:GetObjectRetention` for the exact prefix.
  Journal only: conditional `s3:PutObject`. No runtime artifact write grant.

S3 API and IAM permission names differ for version listing, replication, and
encryption; use the permission names above.
[Version listing](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html),
[replication](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketReplication.html),
[encryption](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketEncryption.html),
[version reads](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)

Before each read/write, and through `store.assertCurrent()` before dispatch, the
adapter verifies the expected owner and region, enabled versioning, compliance
default retention, all public-access blocks, owner-enforced ACLs, exact policy,
SSE-S3 (`AES256`), and absent lifecycle and outbound replication configurations.
Do not attach lifecycle/replication and then immediately remove them to pass:
control-plane configuration can propagate asynchronously. Provision an isolated
bucket, establish settled configuration under change control, and record this
in the external provisioning proof. Admin control of AWS remains an external
trust boundary; a provider brand does not prove its change control or key escrow.

## Immutable attempts and readback

Each logical key maps to `prefix/SHA256(logicalKey)`. Reads list at most two
versions of that exact hashed slot, reject delete markers, multiple versions,
foreign keys, or truncation, then GET the sole explicit VersionId. A versionless
404 is never treated as evidence that an attempt did not happen. The response
must have the expected store/slot metadata, retained compliance mode, deadline,
AES256 encryption, byte length, and SHA-256 checksum. Streams are bounded to
64 MiB. Artifact plaintext remains separately protected by the existing AES-GCM
envelope and exact operation/source binding.

Writes use one `PutObject` with `IfNoneMatch:'*'`, explicit AES256 and checksum,
then verify the returned immutable VersionId and exact bytes. A server 412 is
`exists` only after a valid existing readback; a 409, timeout, denied request,
missing version, or interrupted readback is UNKNOWN and never retried by this
adapter. Existing action intents remain reconciliation-only in the reset
transport. No overwrite, deletion, multipart upload, list-all, or cleanup API is
exposed.

## Remaining external preparation

The operator still needs a reviewed independent AWS account/resource selection,
explicit retention approval, a GitHub OIDC role restricted to the protected
workflow/environment, the generated bucket policies and least-privilege grants,
and settled live configuration evidence. No account is assumed to exist merely
because the adapter is implemented.

Publishing recovery artifacts requires a separate reviewed preparation identity
and process: generate the established encrypted envelopes, bind store/slot
metadata and checksum, use conditional creation, and retain versions through the
approved deadline. It is not implemented by the read-only execution role.
Recovery keys and credentials must remain recoverable after the GitHub runner is
destroyed and while the target database/project is unavailable or rotated.
Record an independent decrypt/readback/recovery rehearsal and accountable key
custodian; neither SSE-S3 nor Object Lock establishes that proof. Customer copies
require the already documented explicit authorization and recovery-plan review.

Run offline validation with:

```text
node --test scripts/pilot-finance-reset-external-store.node-test.mjs
```

The tests use synthetic byte streams and a simulated request transport. They do
not create AWS resources, contact S3/STS, or establish live provider readiness.
