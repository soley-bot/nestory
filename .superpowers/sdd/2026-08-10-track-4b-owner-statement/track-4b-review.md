# Track 4B independent milestone review

## Review boundary and verdict

- Exact reviewed range:
  `384cd946c8d014b6930d35a7950d9cf5ec9902ca..bb7284d19683fd012c1e0a84c70702452febf0ab`.
- Scope: official Owner Statement publication, retained PDF/XLSX authority,
  supersession, partial-publication recovery, authorization/tenant isolation,
  deterministic rendering, downloads, and retained acceptance evidence only.
- Spec compliance: **Issues**.
- Task quality: **Needs fixes**.
- Findings: **3 Critical, 3 Important, 0 Minor**.
- Track 5 gate: **BLOCKED**.

Track 4B is not approvable at this head. The frozen publication model and most
of the role/tenant boundary are well built, but the retained artifact authority
can permanently accept metadata that does not describe the stored bytes, a
partially created publication has no reliable operator recovery path, and the
official XLSX is not byte-stable across time. A valid skipped-publication
revision chain also loses supersession lineage. Two additional idempotency and
accounting-oracle gaps must be corrected in the same milestone batch.

## Material reviewed

- The Track 4B milestone brief, binding publication/reopen/idempotency/failure
  sections of the owner-balance specification, Track 4/sequential program
  rules, and the tracked publication implementation plan.
- The implementation report, Track 4B verification record, progress record,
  redacted reconciliation, guarded fixture contract, and browser source
  contract. Implementer reports were treated as context, not proof.
- All three Track 4B migrations, all 30 publication pgTAP assertions, all four
  publication concurrency cases, the canonical mapper, PDF/XLSX renderers,
  upload/registration action, loaders, download routes, close UI, fixture
  generator/smoke, and focused application tests.
- Database catalog state for RLS/FORCE RLS, table/function grants, locked
  `search_path`, and Storage policies.

The CodeRabbit CLI was not installed in this worktree. Per the review handoff,
no installation or authentication was attempted; the committed diff was
reviewed directly using the same security and correctness criteria.

## Focused reviewer evidence

The reviewer did not rerun the browser flow or the expensive full matrix.
Focused committed checks passed:

- `supabase test db supabase/tests/owner_statement_publication_test.sql`:
  30/30.
- `npm run owners:test-statement-publication`: 4/4.
- focused owner-close, publication mapper/artifact, renderer, catalog, and
  route Vitest: 9 files, 45/45.
- `git diff --check 384cd946..bb7284d`: pass.
- catalog probes: both authority tables have RLS plus FORCE RLS, authenticated
  SELECT only, no anon/service-role table access, and all six public RPCs have
  authenticated-only execute plus `search_path=""`.

Those green suites do not cover the defects below. Additional focused evidence
established them:

1. Through a real local Super Admin session and the real private Storage API,
   21 bytes were uploaded, then registered as SHA-256
   `0000000000000000000000000000000000000000000000000000000000000000`
   and length `999`. The checked RPC returned `status=registered`; the actual
   hash was
   `7ebdf0a9dc5ba02a9f816d576cee0dfe0c67265f09da7627a45f755f5dc6479a`
   and actual length was `21`. A second mismatched XLSX row made
   `artifacts_complete=true`, and `reopen_owner_month` then returned
   `status=preparing`.
2. The exact `buildOwnerStatementXlsx` renderer was invoked twice from the
   same canonical fixture 2.2 seconds apart. The byte arrays differed in 20
   ZIP timestamp bytes and produced hashes
   `18c0ca5ba24b62e967de7b128de9ab39f4f819f49ac9d561acc167ce7f575b1f`
   and
   `caa145f9a139fe3e1de63b95fae655fa0d2511b951a70a91336d648037a2f0da`.
3. A rolled-back Super Admin transaction created a publication with zero
   artifacts, then retried the same revision with a fresh valid key. The retry
   returned `23505 owner_statement_revision_already_published`.
4. A rolled-back revision-chain probe retained a complete published R1,
   closed but did not publish R2, reopened/reclosed R3, and published R3. The
   R3 row had `supersedes_publication_id=NULL` instead of the retained R1 ID.

All transactional probes were rolled back. The committed-state metadata probe
was followed by the guarded fixture reset; afterward there were zero probe
publications and zero `track-4b-review-*` idempotency rows. The final read-only
fixture smoke passed with 9 lines, 9 sources, four components, and two retained
artifacts.

## Acceptance disposition

1. **Immutable, scoped, idempotent publication:** issues. Table/RLS/lock
   structure is strong, but partial publication recovery and derived artifact
   idempotency are not reliable (C2, I2).
2. **Non-PII immutable statement number:** compliant for reviewed code and
   covered tests.
3. **Frozen-only authority:** compliant for reviewed code. The canonical SQL
   reads the selected publication, immutable close revision, frozen lines,
   frozen source links, and closed revision history only.
4. **Complete canonical model and disclosure:** issue. Frozen fields are
   present, but skipped unpublished revisions can remove the required prior
   publication disclosure (I1).
5. **Byte-identical PDF/XLSX and retained hash/length:** noncompliant (C1, C3).
6. **Unique immutable artifact paths and prior retention:** noncompliant.
   Paths are create-only, but unverified immutable metadata can permanently
   strand the registered object and partial creation lacks an operator resume
   path (C1, C2).
7. **Artifact contents and presentation:** the committed PDF/XLSX structure,
   typed-money serialization, and focused tests are sound for covered data.
   Visual Poppler/workbook inspection is recorded but was not independently
   rerun by instruction. XLSX byte stability is noncompliant (C3).
8. **N+1 supersession and N retention:** noncompliant for a valid skipped-
   publication chain (I1). The adjacent R1-to-R2 case is covered and retains R1.
9. **Guarded fixture and manual zero-difference oracle:** not proven to the
   binding line-by-line standard (I3).
10. **Complete authenticated browser flow:** recorded at this head, but not
    independently rerun by instruction. The retained flow does not inject a
    partial publication or delayed renderer retry.
11. **One complete matrix then independent approval:** the one matrix is
    recorded with honest boundaries. Independent approval fails on the
    Critical/Important findings in this report.

## Strengths

- Authorization is evaluated before target lookup in the publication/read/
  download RPCs. Public functions are tenant-scoped, security-definer with a
  locked search path, and explicitly denied to anon/service-role callers.
- Both new authority tables use RLS plus FORCE RLS, Finance-read policies, no
  authenticated mutation grant, immutable triggers, restricted foreign keys,
  and unique publication/format/path constraints.
- The canonical content hash is recomputed on read from frozen authority and
  rejects drift. Ordered lines, ordered source links, canonical hashes, and
  exact two-decimal strings cross the application boundary without money
  coercion through JavaScript `number`.
- PDF generation is deterministic and contains the official number, revision,
  component roll-forward, frozen lines, source trace, hash, and page numbers.
  The download path re-hashes and re-sizes retained bytes before responding.
- Covered duplicate publish/register and register/reopen races serialize with
  no deadlock, duplicate authority, or pending idempotency residue.
- The old live owner-statement calculator files remain as unreferenced legacy
  test code, but production report filters/catalog/loaders do not route an
  official Owner Statement through them. The authoritative operator path uses
  close publications only.
- Hosted parity, deployment, email, cron, backup, and real IPS evidence were
  not overclaimed in this local milestone.

## Critical findings

### C1. Artifact registration trusts claimed hash and length instead of the retained bytes

**Locations**

- `supabase/migrations/20260810150838_owner_statement_publication.sql:518-648`
- `supabase/migrations/20260810153022_guard_owner_statement_completion_before_reopen.sql:17-34`
- `src/features/reports/data/owner-statement-artifacts.ts:30-61`
- False-green oracle:
  `supabase/tests/owner_statement_publication_test.sql:259-345`

`register_owner_statement_artifact` validates the shape of caller-supplied
`p_sha256` and `p_size_bytes`, then checks only that a `storage.objects` row
exists at the canonical path. It never compares the supplied values with the
object. It then freezes those claims into an immutable artifact row. The reopen
guard counts two artifact formats; it does not establish that either row
describes its retained bytes.

The real-session proof above shows this is exploitable through intended
authenticated entrypoints, not only by direct database owner access. Once two
false rows exist, readiness reports completion and reopen is allowed. The
download helper correctly detects the mismatch, but that is too late: the
artifact row cannot be updated/deleted and the registered Storage object cannot
be removed through the authenticated delete policy. The official evidence is
therefore permanently unavailable without out-of-band database repair.

The pgTAP test normalizes this defect by inserting bare `storage.objects` rows
and registering arbitrary repeated hashes/sizes. It proves row existence and
uniqueness, not byte integrity.

**Required correction**

- Make the checked registrar consume a trusted, server-computed SHA-256 and
  length of the exact retained object; an authenticated caller must not be able
  to assert unchecked evidence metadata. Bind registration to an immutable
  object identity/version and keep direct authenticated Storage mutation from
  racing the verification-to-registration window.
- Count a format as complete, and allow reopen, only after that trusted byte
  verification is durably recorded.
- Add a real Storage test that uploads bytes, attempts false hash, false length,
  wrong MIME/version, and object replacement. Every mismatch must fail
  atomically with no artifact row, no completed idempotency claim, and an
  explicitly recoverable unregistered object. A positive test must download
  and independently reproduce both stored values.

### C2. A partial publication has no reliable operator resume path

**Locations**

- `src/features/owner-close/actions.ts:120-184`
- `src/features/owner-close/components/owner-close-screen.tsx:162-195`
- `supabase/migrations/20260810150838_owner_statement_publication.sql:464-469`
- False-green test: `src/features/owner-close/actions.test.ts:174-203`

The server action first creates the immutable publication, then loads/renders,
uploads, and registers two artifacts. Any transient failure after the publish
RPC can therefore leave zero or one registered artifact. On a fresh page the
hidden publish key is regenerated. The publish RPC rejects that new-key retry
because the revision already has a publication, while the UI renders only a
`Publication blocked` message and no resume control.

The rolled-back proof returned
`23505 owner_statement_revision_already_published` for a fresh-key retry with
zero artifacts. Reopen is simultaneously blocked until two rows exist. The
unit test passes only because it reuses the same in-memory `FormData` and exact
hidden key; it does not model a reload, error boundary, new server render, or a
new operator session. The action also contains no cleanup call for a newly
uploaded object when registration fails.

This can strand a legitimate official publication after an ordinary renderer,
Storage, network, or registration failure and requires direct API/database
intervention to finish the workflow.

**Required correction**

- Add an explicit checked resume operation for an existing incomplete
  publication and surface it in the typed remediation UI. It must use the
  publication ID as business authority, render from the same frozen payload,
  verify any existing create-only object, and create/register only the missing
  format.
- Define safe cleanup for an uploaded-but-unregistered object when retry is not
  possible, without ever deleting/replacing a registered object.
- Add fault-injection tests after publication, after each upload, and after
  each registration. Resume from a fresh page/key/session must return the same
  publication/artifact IDs and bytes with no orphan, duplicate, or pending
  idempotency row. Reopen must remain blocked only until verified completion.

### C3. Official XLSX output changes with wall-clock time

**Locations**

- `src/features/reports/data/excel.ts:46-69`
- False-green test: `src/features/reports/data/excel.test.ts:59-75`
- Binding requirement:
  `docs/superpowers/plans/2026-08-10-owner-statement-publication.md:36-38`

`buildOwnerStatementXlsx` calls `fflate.zipSync(files, { level: 6 })` without a
fixed archive modification time. `fflate` therefore writes `Date.now()` into
each local and central ZIP header. The focused exact-renderer proof generated
different hashes after 2.2 seconds even though the canonical model was
unchanged.

The committed equality test calls the renderer twice immediately, inside the
same two-second DOS timestamp bucket, so it passes without testing the binding
time-independence requirement. A delayed retry against an already uploaded
unregistered XLSX will produce different bytes; create-only verification then
rejects the retry. Even a harmless re-execution of a completed publication can
report a false artifact conflict.

**Required correction**

- Pass a fixed ZIP modification time for every entry/archive in a form that is
  invariant across host time zones, while preserving the publication's real
  generated time only in canonical workbook properties.
- Add fake-clock or delayed tests spanning DOS timestamp buckets and different
  `TZ` settings. Assert exact byte/hash equality and a delayed partial retry
  against retained XLSX bytes.

## Important findings

### I1. A skipped unpublished revision breaks official supersession lineage

**Locations**

- `supabase/migrations/20260810150838_owner_statement_publication.sql:472-475`
- `supabase/migrations/20260810150838_owner_statement_publication.sql:782-818`
- Incomplete adjacent-only oracle:
  `supabase/tests/owner_statement_publication_test.sql:365-419`

Publication selects a predecessor only when the immediate
`supersedes_revision_id` itself has a publication. A valid workflow can publish
R1, close R2 without publishing it, reopen/reclose R3, and publish R3. The
focused rolled-back proof produced `supersedes_publication_id=NULL` for R3.

History derives `superseded_by_publication_id` only through that link, so both
R1 and R3 display as current official statements even though R3 is the later
authority. The retained test covers only adjacent published R1 -> published R2
and cannot detect the gap.

**Required correction**

- Under the existing series lock, link the new publication to the latest prior
  publication in the same close series by revision number, not only to the
  immediate predecessor revision.
- Add R1 published/complete -> R2 unpublished -> R3 published, plus multiple
  skipped revisions. Assert exactly one current publication, explicit R3 -> R1
  lineage, retained immutable R1 rows/bytes, and stable history ordering.

### I2. Artifact idempotency keys collide for distinct accepted publish keys

**Locations**

- `src/features/owner-close/actions.ts:31`
- `src/features/owner-close/actions.ts:168-198`
- `supabase/migrations/20260810150838_owner_statement_publication.sql:550-599`
- Shared uniqueness contract:
  `supabase/migrations/20260808235616_operational_schema_baseline.sql:28051`

The action accepts publish keys up to 160 characters, but derives each artifact
key as `${key.slice(0, 155)}:${format}`. Two distinct valid keys that share the
first 155 characters therefore become the same organization/operation key.
Because the registration payload contains a different publication/path, the
shared idempotency authority reports a payload conflict after the later
publication has already been created, feeding the partial-publication failure
in C2.

The current UI-generated keys are shorter, but the checked server-action input
contract explicitly accepts the colliding range. No retained test covers it.

**Required correction**

- Derive a bounded key from the full input and immutable publication identity,
  preferably a stable publication/format business key or a SHA-256 digest of
  the full key plus publication ID and format. Do not truncate uniqueness-
  bearing input.
- Test boundary lengths 155-160, two keys differing only at the last byte,
  exact retry, and payload/actor conflict. Distinct publications must not share
  a registration claim.

### I3. The retained "line-by-line" manual oracle does not assert statement lines

**Locations**

- `scripts/fixtures/owner-statement-publication.json:1-18`
- `scripts/smoke-fixture-owner-statement-publication.mjs:58-74`
- `scripts/owner-statement-publication-fixture-contract.node-test.mjs:20-37`
- Claimed manual table:
  `docs/verification/owner-statement-redacted-reconciliation.md:8-32`

The manifest contains only four closing amounts and a literal
`unexplainedDifference: "0.00"`. The runtime smoke checks only total line count,
total source count, and those closing values. It does not compare the runtime
opening/movement values or any ordered line kind/component/amount/source
expectation with the static table. The contract test checks only that the
literal difference and four closing keys exist.

Opening or movement semantics could therefore change while line/source counts
and closing values remain the same, and every retained "manual reconciliation"
gate would still pass. This does not satisfy the brief's line-by-line oracle or
independently prove `opening + movement = closing` for each component.

**Required correction**

- Put literal opening/movement/closing triples and the complete ordered redacted
  line oracle (kind, component/null, amount, source count and stable semantic
  source type/reference) in the fixture manifest.
- Make the read-only smoke deep-compare the canonical runtime model to that
  independent literal oracle and compute every component equation and the
  unexplained difference rather than trusting the string `"0.00"`.
- Include negative/reversal and nonzero multi-component values or document why
  a later reconciliation fixture supplies that coverage.

## Task quality and verification boundaries

The implementation is cohesive and the recorded full matrix/browser scope is
honest, but several tests assert the implementation's current behavior instead
of the binding outcome: arbitrary artifact claims are accepted as success,
byte equality is checked only within one ZIP timestamp bucket, partial retry
reuses an in-memory key, supersession covers only adjacent publications, and
the manual oracle does not contain the lines it claims to reconcile.

The browser and expensive matrix were not rerun in this independent review, as
required by the handoff. Their recorded green results therefore remain useful
for the covered happy path but cannot override the focused counterexamples.
No unrelated cosmetic, legacy-layout, hosted, deployment, or Track 5 issue was
added to this milestone.

## Track 5 gate

**BLOCKED.** Correct C1-C3 and I1-I3 together. Then run only the affected
artifact-authority pgTAP/real-Storage probes, publication/resume/idempotency and
supersession races, delayed/cross-time-zone renderer tests, focused action/UI/
route suites, guarded fixture oracle, and one focused independent re-review.
Do not rerun the browser flow or full regression matrix unless a correction
changes their already-covered behavior or the focused correction gates expose
a new integration defect.
