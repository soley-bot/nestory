# Track 4B C4 final approval review

## Review boundary and verdict

- Exact correction range:
  `5d3aba77f7f006fc8fe2dc4fb6529707b6d62d36..0f678b1b7469e6de9ec351dbd4faa4555327e3d6`.
- Exact reviewed head: `0f678b1b7469e6de9ec351dbd4faa4555327e3d6`.
- Worktree status before and after focused verification: clean.
- Scope: original C4 only, plus correction-caused Critical, Important, or
  Minor defects.
- C4 disposition: **ADDRESSED**.
- New findings: **0 Critical, 0 Important, 0 Minor**.
- Spec compliance: **Compliant within the focused C4 boundary**.
- Task quality: **Approved**.
- Track 5 gate: **OPEN**.

Track 4B is approved at this head. The correction removes authenticated
deletion of official Owner Statement paths instead of trying to coordinate a
cross-system cleanup race. Failed or ambiguous registration now retains
create-only bytes for checked idempotent resume. No correction-caused defect
was found.

The accepted C1-C3 and I1-I3 dispositions from the prior focused review remain
closed; they were not reopened by this additive correction.

## Material reviewed

- Additive migration
  `supabase/migrations/20260811015837_forbid_owner_statement_authenticated_deletion.sql`.
- The no-delete production action and its ambiguous-registration unit oracle.
- The 39-assertion publication pgTAP suite.
- The real private Storage test covering cleanup-first and
  registration-first ordering.
- The unchanged four-case publication concurrency suite.
- Final local catalog state for objects, artifact rows, missing/orphan
  identities, DELETE policies, and the retired helper grants.

No browser flow, full regression matrix, or new adversarial experiment was
run.

## C4 disposition — ADDRESSED

### Production authority

The additive migration:

- drops `Super Admin can remove unregistered owner statement artifacts` from
  `storage.objects`;
- revokes the now-retired
  `app_private.is_owner_statement_artifact_registered(text)` helper from every
  application role, including `authenticated` and `service_role`.

The remaining authenticated Storage DELETE policies are restricted by their
own predicates to `nestory-documents` and `nestory-photos`. No DELETE policy
matches the `owner-statements` bucket. Existing authenticated table privilege
therefore cannot authorize deletion of an official statement object through
RLS.

### Application behavior

`src/features/owner-close/actions.ts` no longer records a `newlyUploaded`
cleanup state, accepts no `remove` method in the bucket boundary, and has no
catch-path deletion. After upload it either:

1. verifies an existing/create-only object;
2. resolves exact object ID/version and MIME through the service-only RPC;
3. downloads and hashes retained bytes through the server-only client; and
4. registers the exact verified identity.

An ambiguous registration response now leaves the object in place. A later
fresh-key resume reuses it only after exact byte comparison, which is the safe
recoverable outcome required by C4.

`src/features/owner-close/actions.test.ts` explicitly forces an ambiguous
registration response after upload and asserts that Storage removal is never
called.

### Both-order Storage proof

`scripts/owner-statement-artifact-storage.node-test.mjs` exercises the real
local private bucket and checked RPC boundary:

- **cleanup first:** an authenticated removal begins before verified
  registration and removes no object; registration succeeds;
- **registration first:** verified XLSX registration is paused at artifact
  insertion, an authenticated removal is attempted, registration succeeds,
  and removal removes no object;
- the retained XLSX is downloaded afterward and its SHA-256 is rechecked;
- a registered PDF cannot be overwritten;
- service-only fixture teardown removes only the test paths and restores the
  guarded fixture.

Because authenticated deletion is categorically denied for this bucket, the
stale cross-table policy predicate that caused C4 no longer exists.

## Fresh focused verification

- `supabase test db supabase/tests/owner_statement_publication_test.sql`:
  **39/39 passed**.
- `npm run owners:test-statement-storage`: **1/1 passed**.
- `npm run owners:test-statement-publication`: **4/4 passed**.
- `git diff --check 5d3aba7..0f678b1`: passed.
- Final catalog probe:
  - owner-statement Storage objects: **2**;
  - owner-statement artifact rows: **2**;
  - Storage objects without exact artifact identity: **0**;
  - artifact rows without exact Storage object identity: **0**;
  - Owner Statement authenticated DELETE policies: **0**;
  - authenticated/service-role execute on the retired helper: **false/false**.

The two remaining authenticated DELETE policies shown by the catalog are
explicitly bucket-scoped to documents and photos and do not apply to Owner
Statements.

## Correction-caused findings

None.

The correction does not change publication numbering, frozen canonical
payloads, renderer bytes, supersession, download authorization, tenant
selection, verified registration grants, shared idempotency, close/reopen
locks, or immutable artifact constraints. Retaining a create-only object after
an ambiguous failure is intentional recoverable state, not orphan evidence:
the canonical resume path verifies and registers that exact object. The final
fixture/catalog proof shows no residual unregistered or missing object.

## Verification boundary

This approval is limited to the C4 correction and correction-caused defects.
The previously recorded browser and full-matrix evidence was not rerun. Hosted
Storage behavior was not independently exercised in this final local re-review.
No unrelated cosmetic, legacy, deployment, or Track 5 issue was added.

## Track 5 gate

**OPEN. Track 4B is APPROVED** at
`0f678b1b7469e6de9ec351dbd4faa4555327e3d6`.
