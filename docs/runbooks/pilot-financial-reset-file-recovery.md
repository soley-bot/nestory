# Pilot reset file-recovery safeguards

These modules prepare and test synthetic file coverage. They do not authorize a
Pilot reset or customer download, export or restoration. No public command,
hosted target, credential reader, database writer or object deletion is included.
The existing reset inventory remains the source of reference classifications.

Run the focused local contracts with:

```text
node --test scripts/pilot-finance-reset-files-core.node-test.mjs scripts/pilot-finance-reset-files-local.node-test.mjs
```

## Reference and archive contract

`pilot-finance-reset-files-core.mjs` reuses `json`, `sha256`, `TARGET` and
`registrySha256` from the reset core, and the existing `STORAGE_REFERENCES`
registry. It accepts an intact, accepted synthetic inventory plus its separately
retained expected digest. It derives every non-null Storage reference again from
the captured rows and compares that complete set with the inventory's resolved
Storage references. Each reference retains its table, primary key, original row
digest, path and optional object ID. Shared references to one exact object are
allowed; duplicate references or conflicting object identities are refused.

Every distinct object binds the exact bucket, path, object ID, version and full
Storage metadata-row digest. The metadata observation must use the same
`encode(extensions.digest(to_jsonb(o)::text,'sha256'),'hex')` expression as the
existing inventory. Missing versions, ambiguous identity, missing files,
unexpected coverage, metadata changes or reference drift stop capture.

The caller supplies a current complete reference/metadata observer and protected
binary download callback. Capture rechecks the complete observation before and
after each object and at completion. Two downloads must contain identical bytes.
The bound archive records byte length and SHA-256, with canonical base64 preserving
NUL, invalid UTF-8, every byte value and empty files. The limits are 256 distinct
objects, 4 MiB per object and 32 MiB in total. Exceeding a limit fails; it does not
silently omit an object. Increasing limits requires review and a fresh proof.

Verification requires the separately retained archive SHA-256 and exact plan
digest. It refuses noncanonical JSON, duplicate JSON keys, unknown fields,
duplicate/missing objects, altered bindings, length/hash mismatches and
noncanonical base64. A self-declared hash inside an archive is insufficient.

`pilot-finance-reset-files-archive.mjs` exclusively creates a single synthetic
artifact outside the checkout. It checks canonical parent/file paths, refuses
symlinks, hardlinks and replacement, writes with mode `0600`, syncs and verifies
the open file identity. POSIX output also requires an owner-only parent directory
and file. On Windows, mode bits do not establish a DACL; the result explicitly
sets `filesystemPrivacyVerified: false`. Existing task-sandbox access is not
changed. Customer private-directory authority therefore remains unproved.
Failure leaves any incomplete file available for exact-digest inspection; the
module never deletes or replaces it to make a rerun succeed.

These synthetic archives are **unencrypted**. Their base64 and SHA-256 are not
ciphertext, encryption, key custody, provider access or retention evidence.
`customerArchiveAuthorityEstablished` and `customerRecoveryProven` remain false.

## Staged restoration and unknown outcomes

An immutable restore intent binds the archive, source object/version/metadata,
byte digest and a fresh run-specific destination. The destination has a different
path. The intent never authorizes overwriting a source or existing destination.
The API creates a new object ID/version: the result records that new identity
separately and always reports `originalIdentityRestored: false`.

A request-started artifact is written and synced before POST. Each POST is issued
once with `x-upsert: false`. After an interrupted or lost acknowledgment, inspect
the exact target and its immutable run/intent/archive/source markers, then read
its protected bytes. A matching marker, metadata identity and byte digest can
establish the staged result. A missing or unreadable result is **unknown**, never
an instruction to retry. Conflicting metadata or bytes stop reconciliation.
Every reconciliation returns `mutationAllowed: false` and `retryAllowed: false`.
Retain incomplete/unknown markers for the runtime owner's exact-resource review.
Power-loss durability of the underlying host filesystem is not established by
the process-level tests.

The narrow transport follows the existing binary GET/POST pattern in
`ips-readiness-recovery.mjs`. That historical entrypoint cannot be imported without
launching its unrelated database rehearsal, so it is not invoked. This change
does not add a general restoration engine. The documented Storage API uses an
authenticated GET for a private object, and ordinary uploads reject an existing
path unless upsert is enabled. See [private downloads](https://supabase.com/docs/guides/storage/serving/downloads)
and [upload conflict behavior](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

## Actual local API rehearsal interface

`pilot-finance-reset-files-local.mjs` exports `runSyntheticFilesApiProof` and has no
standalone CLI. The sole authorized runtime owner supplies:

- `runtimeId`: the exact owned Storage container ID; `candidateHead`: the local
  candidate SHA; `outputDirectory`: an existing synthetic evidence folder outside
  the checkout.
- `assertRuntime()`: reverify the exact running container, image and ownership,
  internal owned network, no published ports/egress, private `nestory-documents`
  bucket and the synthetic-only source. The harness calls it before each request
  and metadata observation. A callable function is not independent proof of those
  properties; retain the owner's inspection evidence.
- `request({method,path,headers,body})`: the pinned internal Storage server's
  binary transport. Only GET and POST are used. The runtime owner injects its
  transient synthetic authorization in memory; no credential crosses this module.
  Return `{status,body:Uint8Array}`. Routes are relative to the Storage server root,
  such as `/object/authenticated/nestory-documents/...`, not a public gateway.
- `observeObject({bucket,name})`: return `null` for an absent exact object or
  `{binding:{id,bucket,name,version,metadataSha256},userMetadata}`. `userMetadata`
  comes from `storage.objects.user_metadata`; the binding digest covers the full
  row. The read must be restricted to this run's exact generated paths.

The harness generates a run UUID, a valid 16 by 16 grayscale PNG containing all
256 byte values, an exclusive archive and a distinct restored object. Its fixed
`image/png` upload MIME type is already allowed by the private document bucket;
no MIME policy is changed. Native CRC and inflate tests verify the PNG structure,
and the core tests independently exercise arbitrary binary and invalid UTF-8 bytes.
The opaque run-specific paths retain their `.bin` suffix; the object's recorded
content type is `image/png`. Both destinations must be
absent before their single POST. Upload metadata carries the exact source or
restore intent. The restored POST acknowledgment is deliberately discarded, then
the result is reconciled by metadata and repeated binary readback. The original
source is rechecked unchanged. Baseline objects are never downloaded or deleted.
Rejected HTTP responses retain only the numeric status and a recognized error
code from a fixed allowlist. Unknown codes become `unclassified_storage_error`;
provider messages, response bodies and credentials are never retained. A rejection
diagnostic does not itself authorize a retry: reconcile the exact attempted
object/backend/in-flight state through the runtime owner first.

The miniature reference manifest is generated in memory around that fixture; it
does **not** claim to be a database census. A successful actual API run sets
`actualStorageApiBytesVerified: true` while retaining
`actualResetReferenceCensusProven: false`, `originalObjectIdentityRestored: false`
and `customerRecoveryProven: false`. The mocked transport tests prove only this
interface and state handling. Their reports must not be presented as actual API
evidence. Bind any actual proof to the runtime owner's independent inspection,
source-file hashes, exact source/restored metadata, archive digest and cleanup.

The harness has no cleanup route. The sole runtime owner separately verifies and
removes only the task-created synthetic objects/API/volume under the approved
resource plan, then compares the baseline object census. Unknown outcomes require
exact observation before cleanup; never broaden removal to a bucket or prefix.

## Remaining customer restoration prerequisites

The live reset still requires a current complete customer reference census under
contained writers; approved private encrypted archive storage, retention and key
authority; reviewed provider/checkpoint access; a source-bound complete archive;
and an authorized restoration target. The observer must read actual current row
hashes rather than reuse the planned reference list. Hosted Storage transport,
provider-version restoration, metadata/row reattachment, effective access policy
and application reader compatibility remain separate work. A fresh staged object
is not restoration of the original database-referenced object ID/version.

The intended live recovery strategy first contains every object-cleanup writer
and preserves each original bucket/path/object ID/version throughout the reset.
After the approved database inverse, verify that every restored reference still
resolves to that exact original identity and protected original bytes. The current
harness does not execute that database inverse or prove this join. If original
blobs have been lost, a staged API upload is only a recovery candidate: require an
approved provider restore or exact identity/reference reconciliation that accounts
for new object IDs/versions, metadata, retained tombstones and reader behavior.
Do not represent restored SQL metadata alone as physical file recovery.

Rehearse that complete approved restoration with the chosen database checkpoint
and exact current candidate before any live reset. Keep the target organization
unenrolled until all recovery gates and separate action-time consent are satisfied.
The pending invoice-date choice and live reset confirmation are unaffected by
these synthetic safeguards.
