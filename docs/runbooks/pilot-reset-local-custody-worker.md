# Pilot reset with local recovery custody

This candidate is held by `assertHostedTransportDispatchImplemented()`. The
workflow and worker cannot dispatch a mutation while that unconditional function
throws. Tests below prove components, not a live protected execution path.

The separate synthetic HTTP rehearsal has completed all seven reset and recovery
stages with real local Auth sessions, the private Windows journal, detached
signatures and encrypted handoff bytes. Independent database readback verified
consumed authorizations, restored rows, unchanged foreign scope and a frozen
control. A committed write with a lost reply was reconciled without a retry.
This rehearsal uses disposable principals and a minimal synthetic fixture. It
does not establish live GitHub/TLS access or recovery of the customer archive.

The recovery archive and immutable history remain in the protected C: directory.
The GitHub VM receives only a temporary AES-256-GCM encrypted handoff. Supabase
Storage is a transport location, not the recovery archive or durable journal.

## Fixed transport and database identities

- Workflow: `.github/workflows/pilot-financial-reset-local-custody.yml`.
- Protected environment and serialized writer: `production-database` and
  `production-supabase`. Only current `main`, GitHub-hosted Ubuntu 24.04, Node 24,
  and run attempt 1 are admitted. Live GitHub metadata is checked again before a
  mutation. Failure to read protection/job metadata stops the operation.
- Transfer bucket: `pilot-reset-handoff`, private, exactly
  `application/octet-stream`, maximum 32 MiB. The only object path is
  `<Pilot organization>/october-2026/<operation UUID>/<nonce UUID>/bundle.bin`.
  The worker checks current bucket metadata through a read-only database query.
  Execution does not provision storage. The separate protected `provision-handoff`
  mode creates only this fixed bucket; the existing Storage policies must also
  be reviewed before first handoff.
- Database: the reviewed **session** pooler
  `aws-1-ap-southeast-1.pooler.supabase.com:5432`, database `postgres`, project-bound
  username. Transaction pooling and arbitrary hosts/users are unsupported.
  `psql` uses `sslmode=verify-full` and the tracked, byte-pinned Supabase CA.
  Each transaction asserts `session_user`, `current_user`, and database identity.
  Live TLS connectivity has not been established by the offline tests.

## Two-phase dispatch

1. Prepare the complete reviewed payload `{packet,binding,artifacts,recovery,
   observation}` and SQL with `localCustodyMutationSql`. It wraps the existing
   closed mutation builder with fixed identity/private-bucket checks. Its digest
   is the original intent's `sqlSha256`; arbitrary supplied SQL is never executed.
2. Record a separate immutable inert bootstrap claim in the actual protected
   Windows journal. It binds operation/action/nonce, main, reviewed payload and
   the encrypted local transfer-key archive. No five-minute actor authorization
   is needed yet. `inputBundleSha256` is `digestDatabaseJson(payload)`.
3. Create only the owned encrypted waiting object, then obtain its short-lived
   signed URL. Enroll that URL and the ephemeral AES key in protected environment
   secrets. Dispatch once with nonsecret operation/action/nonce inputs. Lost
   dispatch acknowledgement requires finding the original run, never another POST.
4. Discover and enroll the exact run ID and attempt 1 in the same journal. Once
   the fixed waiting step is active, obtain genuine fresh actor authorization.
   Record the exact SQL intent, mutation dispatch claim and enrolled run response
   before constructing the ticket. `custodySha256` is the canonical digest of
   the original intent's custody reference.
   A ticket lives at most five minutes. `signLocalDispatchBundle` reads the fixed,
   hash-pinned journal reference and genuine branded store; all three records must
   match before any private-key access. Caller assertions or mock stores do not
   substitute for the journal.
5. Replace only that owned waiting object's ciphertext with the final signed
   bundle encrypted using the same ephemeral transfer key and a fresh random IV.
   The worker authenticates the exact run, main, action, payload and artifact
   digests, independently rebuilds SQL, checks live database conditions and the
   pending real authorization, then sends one mutation transaction. The database
   consumes the authorization in that transaction.
6. Read back database receipts. Lost or failed mutation replies lead only to
   read-only reconciliation. An uncertain result never authorizes retry or normal
   write reopening. Persist the authenticated aggregate outcome into the original
   local journal through the coordinator.

The operational coordinator/upload/enrollment steps must be reviewed together
with this worker before the hold is removed. A standalone signature or a green
component suite does not certify that complete path.

## Historical reconciliation

Use workflow mode `reconcile`, the original operation/action/nonce and original
run ID. The worker verifies the original run's metadata and original signature;
elapsed ticket expiry is accepted only by the historical read-only verifier.
Consumed or expired actor authority never enters the mutation branch. The
original encrypted handoff and ephemeral decryption key must still be available.
Current main/source/schema parity is required; drift stops reconciliation rather
than guessing a receipt from a different implementation.

## Enrollment and evidence still required

The local CLI is `node scripts/local-backup-dispatch-local.mjs <command>`. Its
bounded stdin request is `{inputArchiveId,inputArchiveSha256,nonce}`. The private
OpenPGP input archive contains `{format:'nestory-local-dispatch-input-v1',payload,
custody,custodyEvidence,authoritySha256,stageAuthority,reviewArtifacts,action}`. Commands are `bootstrap`, `discover`, `publish`,
`reconcile`, `collect`, and `collect-reconciliation`. `publish` alone accepts
`{request,authorizationId}` so a genuine fresh authorization can be obtained
after the inert job starts. No CLI accepts an arbitrary path, SQL, endpoint or
credential value. Remote mutations are held; discovery/receipt reads preserve
the original immutable operation.

`capability-probe` workflow mode receives only the current job's GitHub token. It
verifies live protected-environment/job reads and reports the fixed PostgreSQL
client's availability and digest. `tls-probe` additionally uses the existing
protected database password and enrolled client digest for a fixed read-only
`SELECT 1` and session-identity assertion. Neither reads customer tables or
artifact inputs. GitHub documents Actions read as sufficient for both
[environment metadata](https://docs.github.com/en/rest/deployments/environments#get-an-environment)
and [deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies#list-deployment-branch-policies);
the workflow does not request broader permissions. Actual job capability still
requires running the probe from merged main.

The workflow reuses protected `SUPABASE_DB_PASSWORD`. Other secret names are
`PILOT_RESET_HANDOFF_SIGNED_URL` and `PILOT_RESET_HANDOFF_KEY`. Public variables are
`PILOT_RESET_SIGNING_PUBLIC_KEY`, its `_SHA256` counterpart,
`PILOT_RESET_PSQL_SHA256`, and `PILOT_RESET_LOCAL_CUSTODY_ENABLED`. The exact binary
path is `/usr/lib/postgresql/16/bin/psql`. No values are printed by the worker.

The private bucket, reviewed public enrollment, exact runner binary pin, live
read-only TLS probe, final worker integration after evidence admission, actual customer
archive restore, Storage-byte proof, and final execution review are separate
requirements. No settings, credentials, buckets, or hosted rows are changed by
the component tests. Recovery key custody is DPAPI CurrentUser on this Windows
host; off-host key recovery is not claimed.

Focused tests: `node --test scripts/local-backup-dispatch-bundle.node-test.mjs
scripts/pilot-finance-reset-local-custody.node-test.mjs`. They cover real detached
signatures, record binding, fixed URLs, authenticated encryption, run identity,
expired-ticket read-only verification, import coverage, and lost-reply single
attempt behavior. The shared hosted-transport suite covers database phase and
receipt semantics separately.

The explicit synthetic integration entrypoint is
`node scripts/pilot-finance-reset-local-custody.integration.mjs <owned-descriptor>`.
It requires a fresh local four-container internal network, no published ports or
reused mounts, genuine Auth/PostgREST, and an independently initialized private
Windows journal. It never opens the operational journal or enrolled private key.
The October 27 run replayed 260 migrations and passed all seven reset/recovery
stages, including an after-commit lost reply, single-attempt reconciliation,
reopened-journal retry refusal, expired-ticket historical verification, and
independent-reviewer rollback. Root independently checked the final database
aggregates. The saved ignored proof is
`.codex-artifacts/local-custody-http-runtime/integration-proof.json`, SHA-256
`c81cec1a831a95db4df9e3e6e95913d7b2768437bd90f05477ace958fb72f37c`.

This integration uses a disposable signing key and a minimal synthetic month-lock
and owner-scope fixture. It exercises production transaction construction and
readback, but deliberately fails whole-worker admission because real hosted
evidence is missing. It does not establish GitHub environment access, production
TLS, actual customer recovery, the operational DPAPI signing path as a whole, or
end-to-end publication timing. Measured local stage processing was 24.7–35.0
seconds; live GitHub, credential retrieval, and archive preparation are additional.
The provisioning helpers and their source hashes are retained in the same ignored
folder as one-run evidence, not a shipped CI bootstrap.

`local-backup-custody-evidence.mjs` reads the existing saved business-restore,
Storage-byte, and key-recovery proof formats. Version 2 additionally requires a
UUID-addressed encrypted live-witness input. It checks saved ciphertexts, exact
producer source pins, and the actual reset/inverse results; the older restore-only
reference remains non-admitting. The producer checks it
before provider work. The signer independently rereads the immutable evidence
record and its saved files before private-key access. The same record digest is
bound through private input, durable intent and signed ticket; the signer also
requires the durable claim that preceded the workflow POST. It does not accept invented
inverse, destination-review, or foreign-baseline success documents. Those actual
producer artifacts must be integrated and reviewed before removing the global
hold; shape-only custody digests in an intent are insufficient. These custody
admission additions postdate the saved synthetic chain proof and are covered by
focused contract tests; that earlier proof has not been relabeled as a run of the
new admission code.

The actual-archive planner now returns exact PostgreSQL canonical text alongside
the summary, archive/action descriptors, catalog, and ledger. Their database
digests are checked against those bytes, never against JavaScript reserialization.
An owned synthetic PostgreSQL read-only check exercised this boundary; it did not
run a full materialization or establish customer recovery.

`local-backup-packet-bridge.mjs` derives a stable plan identity only from a branded
accepted planner result. It retains separate original recovery and observed
execution schema/ledger identities, including their distinct database and packet
hash encodings. The actual RAM producer's `rehearsal` field binds that plan to
economic zero/continuation/report semantics. The dual-context comparison excludes
actor identities and the separately verified manifest/plan identities, while
preserving every economic field. The saved-evidence reader compares the final packet before signer
admission. The inverse proof precedes the final packet, so it cannot contain the
digest of the packet that will reference the proof. Actual actors still require
the independent genuine-session approval path. A `rehearsal` planning binding
alone does not establish that the reset or inverse was executed successfully.

The reviewed empty-books zero plan carries immutable numeric `version: 4` and
an `owner_person_row_sha256` on every scope. The native version-4 roster may
include an archived owner person only for an archived property; active-property
eligibility remains strict. JavaScript admits that shape only with version-4
empty-books continuation. An unversioned plan retains the original exact shape
and native strict roster, including when paired with version-4 continuation.
The discriminator and person-row hashes remain in the canonical review digest;
actor rebinding never removes them or reserializes ownership percentages.

The private evidence reference also includes `destinationProtection`, pointing
to the saved, unchanged administrator BitLocker observation. The reader checks
C: specifically, binds those bytes to the restore's recorded held spill checks,
and reopens the fixed Windows journal to verify its current ACL and original
root identity. An unrelated unencrypted D: is not treated as the recovery
destination. This establishes the provenance of the prior observation; it does
not claim a fresh automated encryption check or off-host key recovery.

The selected-only RAM clone omits credential rows and other organizations. Its
source/foreign census and materialization manifest cannot be relabeled as live
production witnesses. `local-backup-live-witness.mjs` reads aggregate business
table counts/hashes, Storage metadata closure, excluded security counts/hashes,
and a non-vacuous foreign census in the same read-only transaction as the live
materializer summary. Exact business rows, Storage closure, archive/actions and
economic counts must match the saved source. Step-up counts must match the live
security census. Both hosted and rehearsed execution ledgers are checked against
the same reviewed migration bytes; the original recovery ledger stays separate.

The concrete preparation path is `openSavedPilotRehearsal`,
`persistPilotLiveWitnessInputs`, `preparePilotLivePacket`, then
`persistPreparedLocalDispatchInput`. These APIs reopen producer artifacts,
recreate the planner provenance, derive the packet and custody hashes, and save
an encrypted input in private C:. `readLocalDispatchSourceFiles` supplies the
fixed source roster. Missing evidence remains a blocker. They do not create a
workflow, issue actor authorization, or remove the execution hold.

Saved-input decryption and all five operator handoff entrypoints retain the
existing live spill-custody lease until plaintext work ends. Dispose the opened
rehearsal context in a `finally` block. The reader hashes the full native
continuation plan, including its post-zero source hash; a semantic-only plan is
not a substitute. The signed source observation also binds the approved foreign
baseline, which the worker checks inside its sole mutation transaction before
consuming actor authority. No raw foreign rows are exported.

The new admission path has focused synthetic tests. Actual saved reset/inverse
and attachment-byte evidence, a current live witness after real step-up, and the
protected GitHub capability/TLS probe must pass before activation. The previous
synthetic chain proof does not establish those facts for this revised code.

Provisioning uses the existing protected environment and writer group. After
review and merge to exact `main`, enroll the reviewed public signing key and its
SHA plus `PILOT_RESET_LOCAL_CUSTODY_ENABLED=reviewed-operation-only` in
`production-database`. The default `capability-probe` reads actual GitHub
protection and reports the installed psql hash. Review and enroll that hash as
`PILOT_RESET_PSQL_SHA256`, then run `tls-probe` with the existing protected
database password. These steps do not remove the unconditional execution hold.
The activation setting is checked in the first runner step, before checkout or
private inputs. It is intentionally absent from the job-level condition because
[environment-level variables become available after the runner starts](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#configuration-variable-precedence).

The explicit `provision-handoff` mode uses the existing protected
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID`, requires the fixed Pilot
project, and reads its existing service credential into process memory. It
creates only `pilot-reset-handoff`, private, with a 33,554,432-byte object limit
and `application/octet-stream` as its sole MIME type. An existing matching
bucket is accepted; mismatched metadata fails without update. There is one
create POST at most, preceded by a fresh exact-main/protected-job check. A lost
reply causes one readback, never another POST. Failure to establish the result
remains unknown. No bucket deletion, policy/grant change, credential creation,
customer object read or upload occurs in this mode. Supabase documents the
[existing-key read](https://supabase.com/docs/reference/api/v1-get-project-api-keys)
and [bucket creation options](https://supabase.com/docs/reference/javascript/storage-createbucket).

Bucket privacy does not by itself prove absence of an existing broad Storage
policy. Before first handoff, review the current Storage policy census for this
new bucket; this provisioner creates no policy and does not claim that review.
The [Storage access model](https://supabase.com/docs/guides/storage/security/access-control)
distinguishes RLS access from service-key access. Keep the existing signed URL
and transfer key in protected per-operation secrets via the local bootstrap;
do not copy the service credential into a new GitHub secret. The bucket is a
temporary encrypted delivery channel; the independent durable recovery copy
and attempt history remain in private C:.

`inspectDispatchPayloadBudget` measures the UTF-8 JSON payload plus the largest
admitted ticket/signature envelope, including escaped artifact names. Input
preparation and every input load check it before any bootstrap or stage intent.
The transfer uses binary AES-GCM: four magic bytes, twelve IV bytes and sixteen
tag bytes add 32 bytes. The payload is not Base64 encoded; only the bounded
detached signature is Base64. Admission reserves 64 bytes below the 32 MiB
document limit, so the worst-case ciphertext stays at least 32 bytes below the
bucket/download cap. Boundary tests include multibyte text and one-byte overflow.
Measure the final actual prepared payload with this function; synthetic tests
do not establish that a future operational packet fits. Oversize input requires
a separately reviewed change before any intent or authorization is created.

`local-backup-dispatch-review.mjs` supplies the missing typed review records.
Prepare an initial packet with actual recovery evidence and the three review
roles absent. `prepareLocalDispatchReviewArtifacts` takes that packet, its core
artifacts, the fixed `localDispatchActorReadinessSql` aggregate readback, a native
pre-freeze observation, and the retained user instruction's exact text, source
reference and recorded time. It returns the three immutable artifact strings
for the final `preparePilotLivePacket` call. Their binding excludes the final
packet digest and the review-role digests, avoiding a self-reference.

The actor record reports current eligible session counts/hashes for the two
selected identities. It does not establish possession of those sessions or
claim native zero approval. The containment record states that native freeze
and the protected writer remain required. The retained instruction records the
existing human-approved scope; account names are not fresh consent, and live
recovery still requires separate consent. No new approval request is implied
by recording an instruction already given. These records never set the packet's
`customerApprovalVerified` or `executionSupported` flags to true.

For each stage, `prepareLocalDispatchStageAuthority` binds the final packet,
review hashes, stage, actual native observation and explicit validity interval
(at most 24 hours). This is an evidence reference, not a replacement for the
five-minute genuine native authorization. `execute` additionally requires the
existing `approvalObservationQuery(packet)` readback: both named actors' native
approvals and current endorsements, checked by the existing validators. Native
zero plans are prepared during the hosted `seal` stage. Collect both genuine
maker and reviewer zero approvals after successful `seal` and before preparing
`execute` stage evidence; they are not inserted back into the already reserved
packet. No live-recovery stage is admitted by
this reset-only producer.

Pass the resulting `stageAuthority` object to `persistPreparedLocalDispatchInput`;
the authority hash is derived, never accepted as an unsupported caller claim.
The local input also retains the three exact review strings. Persist and load
validate their packet hashes and native phase prerequisites. Before signing,
the signer rereads the immutable `stage-evidence` journal record, validates it
against the same ticket and original observation, and checks current expiry
before unwrapping the signing key. Historical discovery/reconciliation may
inspect expired original evidence; bootstrap, publication and signing may not.
Native approval metadata stays in private C: encrypted input and protected
journal records, never worker stdout. The worker still independently observes
current database state, checks native prerequisites and consumes real session
authority in the sole mutation transaction. No execution hold is removed.

Before requesting the short-lived stage authorization, complete bootstrap and
discovery and require `waitingWorkerReady:true` from discovery. This means the
single exact original run/attempt is in the ticket-polling step; a queued or
merely started job is insufficient. Publication repeats the same live check.

Both publication load and the durable signer still perform full saved-custody
admission. Their attachment checks use one `verify-archives` Windows helper
batch each: at most256 unique UUID `archive.pgp` files, each with the existing
1..8MiB ciphertext limit. The fixed-root ancestor handles stay pinned through
the batch; each file retains its owner/DACL before-and-after checks, reparse
and single-link restrictions, exact length/hash verification and buffer
clearing. Only a bounded receipt bound to the exact input roster returns to
Node. No attachment decryption, cached success assertion or skipped late check
replaces admission. These helper changes alter rehearsal source pins; a final
admitting proof must be produced with the changed sources. Measure full
publication overhead and native phase duration before relying on the unchanged
native authorization lifetime.

`local-backup-dispatch-observation.mjs` supplies the fixed read-only connector
queries without a local database credential. `buildLocalDispatchObservationSql`
takes `request`, `publicKeyArmored`, `publicKeySha256`,
`expectedPayloadSha256` and `chunkIndex`. Load the public key with the existing
`loadRecoveryPublicKey(keyId)`; the helper accepts only RSA3072 OpenPGP v4 public
keys. The allowed requests are:

- `{kind:'ledger', operationId}` returns the server's exact `ledgerText` inside
  the encrypted payload. Never regenerate that text from parsed JSON.
- `{kind:'stage', packet, continuationPlan, action}` wraps the unchanged
  `observationSql` SELECT with no actor authorization locator. Only the five
  reset stages are accepted.
- `{kind:'approvals', packet}` wraps `approvalObservationQuery(packet, null)`
  with its validated operation UUID and literal `NULL` ordinal. It observes
  current endorsements, not a historical approval number.

Ledger and stage capture start with both chunk arguments `null`. Retain that
bounded metadata response as `before`, request each chunk using its
`payloadSha256` and zero-based index, then repeat the metadata query as `after`.
Every query is repeatable-read and read-only; all chunks and both witnesses
must have the same payload digest. The payload limit is4MiB and each encrypted
plaintext chunk is64KiB. These separate transactions do not claim one shared
snapshot; any observed change rejects the package.

Approval availability contains current timestamps. Therefore approval mode
requires `expectedPayloadSha256:null, chunkIndex:0`, encrypts the entire result
in one statement, and fails above64KiB. Use that same returned observation as
`before`, `after` and the sole `chunks` entry; do not splice separate reads.
All connector results contain only status, binding digests, byte counts and
ciphertext. Do not print decrypted observations or session metadata.

Persist with `persistLocalDispatchObservation({context, request, package})`,
where `package` is `{format:'nestory-local-dispatch-observation-package-v1',
keyId,before,after,chunks}`. It requires the actual saved-rehearsal held custody
context, decrypts and checks every chunk, then encrypts and exclusively saves
the package in private C with exact readback. Its returned reference is the
existing `{keyId,archiveId,archiveSha256,plaintextSha256,plaintextBytes}` shape.
`openLocalDispatchObservation({context,request,reference})` independently
reopens and validates it. Consume its private in-memory result as ledger text,
stage observation, or native approval rows in the assembly APIs above; keep
the context held until those values are no longer used. These observations
never replace the worker's fresh reads or genuine native authorization.
