# Track 4B focused correction re-review

## Review boundary and verdict

- Exact correction range:
  `bb7284d19683fd012c1e0a84c70702452febf0ab..5d3aba77f7f006fc8fe2dc4fb6529707b6d62d36`.
- Exact reviewed head: `5d3aba77f7f006fc8fe2dc4fb6529707b6d62d36`.
- Worktree status before writing this report: clean.
- Scope: disposition original C1-C3 and I1-I3, plus only correction-caused
  Critical/Important/Minor defects in official Owner Statement publication.
- Original findings: **C1 ADDRESSED, C2 ADDRESSED, C3 ADDRESSED, I1
  ADDRESSED, I2 ADDRESSED, I3 ADDRESSED**.
- New findings: **1 Critical, 0 Important, 0 Minor**.
- Spec compliance: **Issues**.
- Task quality: **Needs one focused correction**.
- Track 5 gate: **BLOCKED**.

The correction resolves all six findings from the first independent review.
Track 4B nevertheless cannot be approved at this head because an authenticated
Storage deletion that starts while verified registration is in flight can
delete the object after registration commits. The result is an immutable
artifact row whose official retained bytes no longer exist.

## Material reviewed

- The original independent review, correction implementation report, binding
  publication requirements, tracked plan, milestone brief, and verification
  record.
- The exact correction diff, including the recovery migration, server action,
  UI recovery path, XLSX renderer, generated database types, fixture/oracle,
  38-assertion pgTAP file, four publication races, and real Storage test.
- Existing Storage policies and the interaction between authenticated cleanup,
  service-only registration, immutable artifact metadata, and close/reopen
  locks.

The CodeRabbit CLI was unavailable. No installation or authentication was
attempted; the correction was reviewed directly. The Supabase security review
treated service-role bypass and explicit function grants as distinct controls.

## Focused reviewer evidence

No browser flow or full regression matrix was rerun. Fresh focused checks at
the reviewed head passed:

- `supabase test db supabase/tests/owner_statement_publication_test.sql`:
  **38/38**.
- `npm run owners:test-statement-storage`: **1/1**. The real private object is
  downloaded and hashed, wrong version/size/MIME is rejected, caller-asserted
  metadata is denied, and a registered path cannot be overwritten.
- `npm run owners:test-statement-publication`: **4/4**. Exact concurrent
  publish/registration replay and both register/reopen start orders passed.
- `git diff --check bb7284d..5d3aba7`: pass.

Those committed suites do not exercise registration against authenticated
Storage cleanup. A focused two-session local probe used the same service-role
verified registrar and the same authenticated DELETE policy:

1. Verified registration selected the exact `storage.objects` identity and
   version `FOR KEY SHARE`, then paused immediately before artifact insertion.
2. An authenticated Super Admin DELETE for that unregistered canonical path
   began and waited on the storage row.
3. Registration committed successfully.
4. The waiting DELETE then committed successfully without rejecting the now
   registered path.
5. Final counts for the exact object identity were
   `storage.objects = 0`, `owner_statement_artifacts = 1`.

The probe fixture and trigger were removed through the guarded fixture restore;
the worktree was clean afterward. No further access-control or adversarial
experiment was performed.

## Original finding dispositions

### C1 — ADDRESSED: retained artifact authority now verifies actual bytes

Evidence:

- `src/features/owner-close/actions.ts:220-259` obtains the exact object
  identity through the server-only client, downloads the retained object,
  computes SHA-256 and length from those bytes, compares MIME/metadata/renderer
  output, and submits the verified values.
- `supabase/migrations/20260810164308_harden_owner_statement_publication_recovery.sql:4-23`
  stores object identity/version/MIME under checked constraints.
- The same migration at `313-383` and `394-579` validates actor, tenant,
  canonical path, object identity/version, MIME, size, idempotency, and close
  locks. Lines `594-615` revoke the caller-asserted registrar and expose the
  object/verified registrar functions only to `service_role`.
- The fresh real Storage gate passed 1/1, including wrong version, size, MIME,
  authenticated metadata registration, retained download, and overwrite
  rejection.

The service function necessarily trusts its server caller for the supplied
SHA, but the only production caller downloads and hashes the retained bytes
immediately before invoking it, and application roles cannot execute it.

### C2 — ADDRESSED: partial publication has a fresh-key recovery path

Evidence:

- `resume_owner_statement_publication` at migration lines `204-310` authorizes
  before lookup, uses shared actor/payload idempotency, locks the close scope and
  sources, requires the exact current closed revision, and returns the same
  publication/number as resumable or complete.
- `src/features/owner-close/actions.ts:148-169` accepts a fresh recovery command
  and runs the common completion pipeline.
- `src/features/owner-close/components/owner-close-screen.tsx:188-213` exposes
  a fresh-page **Resume Owner Statement** operation when the typed incomplete
  blocker identifies the existing publication.
- The action test at `src/features/owner-close/actions.test.ts:213-240` and
  pgTAP assertions around `supabase/tests/owner_statement_publication_test.sql:303-314`
  cover fresh-key recovery of the same publication.

### C3 — ADDRESSED: official XLSX ZIP time is deterministic

Evidence:

- `src/features/reports/data/excel.ts:68-71` fixes the owner-statement ZIP DOS
  time to the same local calendar value instead of using wall clock time.
- `src/features/reports/data/excel.test.ts:90-106` compares exact bytes across
  clock buckets and extreme host time zones.

### I1 — ADDRESSED: supersession selects the nearest retained predecessor

Evidence:

- Migration lines `149-158` select the latest earlier publication in the same
  close series by revision number, not merely revision N-1.
- pgTAP lines `544-663` retain a publication, skip an intervening revision,
  publish the later revision, and assert nearest-prior supersession and single
  active authority.

### I2 — ADDRESSED: artifact claims use the complete command identity

Evidence:

- `src/features/owner-close/actions.ts:283-292` SHA-256 digests the complete
  command key, publication ID, and format into a bounded namespaced key; no
  uniqueness-bearing suffix is truncated.
- `src/features/owner-close/actions.test.ts:242-274` uses two 160-character
  inputs differing at the final byte and asserts four distinct bounded format
  claims.
- The verified registrar includes the complete object and publication identity
  in its shared idempotency payload at migration lines `444-459`.

### I3 — ADDRESSED: the retained reconciliation asserts literal lines

Evidence:

- `scripts/fixtures/owner-statement-publication.json:8-27` contains literal
  component equations and all nine ordered lines with kind, component, amount,
  source count/type, and stable semantic source reference.
- `scripts/smoke-fixture-owner-statement-publication.mjs:63-90` deep-compares
  runtime components and lines to that manifest and independently computes
  opening plus movement minus closing as zero.
- The fixture contract also fixes ordered line numbers and amounts instead of
  accepting only totals/counts.

## New finding

### C4. Registration and authenticated cleanup can commit a registered artifact with no retained object

**Severity: Critical — evidence integrity / irreversible official record**

**Locations**

- `supabase/migrations/20260810164308_harden_owner_statement_publication_recovery.sql:506-564`
- `supabase/migrations/20260810150838_owner_statement_publication.sql:927-935`
- `src/features/owner-close/actions.ts:265-267`
- Missing race oracle:
  `scripts/owner-statement-publication-concurrency.node-test.mjs:267-344`

The verified registrar locks the exact `storage.objects` row `FOR KEY SHARE`
and then inserts immutable artifact authority. The authenticated DELETE policy
authorizes deletion when no artifact row exists. A DELETE that evaluates that
policy before the artifact insert can wait behind the Storage row lock and
then proceed after registration commits without re-evaluating the cross-table
predicate. The action's best-effort failure cleanup uses that DELETE path.

The focused probe reproduced the forbidden terminal state: both commands
reported success, the object was gone, and the immutable artifact row remained.
The current real Storage test checks deletion only after registration has
already completed. The concurrency suite checks registration against replay and
reopen, not registration against Storage removal.

This violates the binding requirement that official retained bytes remain
downloadable and verifiable, and it can also falsely satisfy the two-artifact
reopen guard through metadata whose bytes have been deleted.

**Required correction**

- Eliminate application-authorized deletion of canonical publication objects
  across the upload/verification/registration interval. The smallest robust
  correction is to remove authenticated failure cleanup and its DELETE policy
  for these official paths, retaining an orphan for safe idempotent resume
  rather than risking deletion of registered evidence. If cleanup remains, it
  must use a coordinated design whose authorization cannot be based on a stale
  cross-table snapshot and whose safe result is proven for the exact object
  ID/version.
- Add both start-order real-Storage races for cleanup versus verified
  registration. Require no deadlock/pending idempotency residue, at most one
  safe cleanup result, and always assert that every committed artifact row's
  exact object ID/version still exists and its downloaded hash/length matches.
- Cover the action's error-after-upload and ambiguous-response path. Recovery
  may leave a verified reusable orphan, but must never leave registered
  metadata pointing to absent bytes.
- Rerun only the affected Storage, publication pgTAP, action, and new
  registration/cleanup races, followed by one focused independent re-review.

## Task quality and verification boundary

The correction is cohesive and the six requested fixes are implemented with
strong focused oracles. Role/tenant checks, service-only grants, canonical
paths, exact object identity/version, shared idempotency, immutable publication
rows, deterministic renderers, and nearest-prior lineage are materially
improved. The remaining defect is narrow but load-bearing: cleanup was not
included in the otherwise strong concurrency model.

Browser and full-matrix evidence remains the previously recorded evidence; it
was intentionally not rerun. Hosted Storage behavior was not independently
verified in this focused local review. No cosmetic, legacy, deployment, or
Track 5 scope was added.

## Track 5 gate

**BLOCKED.** All six original findings are addressed, but C4 must be corrected
and focused-re-reviewed before Track 4B is approved or Track 5 begins.
