# Track 6 Paid Cost Focused Re-review

## Verdict

**BLOCKED at `268b7b1d3832f2346e22c08fee633b6d2d0b594f`.** The correction blocks the original Finance Member generic-document reproduction, but it does not establish an exclusive service-registrar authority. An authenticated Super Admin can still manufacture the exact document and activity shape accepted by the new eligibility assertion, submit it, and have a different Finance Manager approve it without retained-byte verification. The prior C1 evidence-integrity defect is therefore only partially corrected.

Review range: blocked head `2309db0fb1f70c5fe0cb73790fc0997bffd64f9e` through exact clean correction head `268b7b1d3832f2346e22c08fee633b6d2d0b594f`.

Browser acceptance and the full matrix were deliberately not rerun.

## Correction assessment

The additive migration has several sound properties:

- General paid-cost submit and approve both call one private, search-path-locked evidence assertion.
- Exact organization, property, category, uploader, namespace, MIME, bounded size, SHA-256 shape, retained-object presence, and Storage metadata equality are checked.
- One document-scoped transaction advisory lock serializes evidence reuse; exact same-actor/same-key replay remains possible while unrelated reuse is rejected.
- Authentication and operation-specific authorization occur before caller-controlled evidence lookup.
- Maintenance-task evidence remains on its separate authority path.
- The public wrappers retain narrow authenticated grants; renamed baseline functions and the private assertion are not executable by application roles.

Those changes close the original Finance Member ordinary-document probe. They do not prove that `paid_cost_evidence_registered` came from the service-only registrar.

## Findings

### Critical

#### C1 continued - Ordinary document creation can forge the registrar authority signal

Locations:

- `supabase/migrations/20260811102356_bind_paid_cost_evidence_authority.sql:93-105`
- `supabase/migrations/20260809170336_owner_opening_evidence_fingerprints.sql:370-388`
- `supabase/migrations/20260809170336_owner_opening_evidence_fingerprints.sql:402-408`
- `supabase/migrations/20260809170336_owner_opening_evidence_fingerprints.sql:438-488`
- `supabase/migrations/20260809170336_owner_opening_evidence_fingerprints.sql:891-894`
- `supabase/migrations/20260808235616_operational_schema_baseline.sql:35398`
- missing behavioral oracle: `supabase/tests/ips_paid_cost_acceptance_test.sql:197-432`

`assert_paid_cost_evidence_eligible` treats an `activity_logs` row with action `paid_cost_evidence_registered` and matching JSON fields as proof that the service-only registrar verified retained bytes. That row is not an exclusive registrar artifact:

1. The authenticated Storage insert policy lets a Super Admin upload directly into any organization-owned `nestory-documents` path, including `/paid-cost-evidence/`.
2. The authenticated `create_document` RPC accepts arbitrary category, SHA-256, `p_activity_action`, and `p_activity_new_values` from a Super Admin.
3. That RPC writes the fingerprinted document under its own checked context and writes the caller-selected activity action/payload as the authenticated actor.
4. The new assertion cannot distinguish this ordinary document path from `register_paid_cost_evidence_verified`.

Independent rolled-back reproduction using only authenticated grants:

1. Acting as fixture Super Admin `00000000-0000-0000-0000-000000000101`, inserted a Storage object under the paid-cost namespace with plausible PDF metadata.
2. Called the granted `public.create_document` RPC with category `Paid cost evidence`, an arbitrary 64-character hash, the same property/path/size/MIME, and caller-controlled action `paid_cost_evidence_registered` plus the matching activity payload. The service-only registrar and retained-byte download/hash verification were never called.
3. Called `public.submit_expense`; it succeeded with submitted identity `c56f2c81-a3a0-47d2-979a-3554214134f0`.
4. Acting as a different Finance Manager `00000000-0000-0000-0000-000000000701`, called `public.review_expense(..., 'approve', ...)`; it succeeded and returned payment, Ledger, responsibility, owner invoice line, payment allocation, and finance expense item identities.
5. Rolled back the transaction. Follow-up counts for the submission, document, object, and both financial idempotency requests were `0|0|0|0`.

This is the same material outcome as the original C1: accepted financial and downstream reporting effects can be created without authoritative receipt bytes. Super Admin is an application business role allowed to submit paid costs, not the service-role evidence verifier, so its broader operational authority does not satisfy the binding registrar requirement.

Required correction:

1. Replace the forgeable generic activity-log predicate with an exclusive registrar authority record that ordinary authenticated RPCs cannot create or emulate. A private registrar-binding table written only by `register_paid_cost_evidence_verified`, with no application-role grants and immutable document/object identity plus actor/property/hash/size/MIME/version fields, is one suitable design.
2. Reserve the paid-cost namespace, category, and registration action from ordinary authenticated upload/document/activity paths. At minimum, the authenticated Storage insert policy and `create_document` must reject `/paid-cost-evidence/`, category `Paid cost evidence`, and action `paid_cost_evidence_registered`; direct authenticated activity-log insertion must not be able to manufacture the same authority signal.
3. Make both submit and approval validate the exclusive registrar binding and the current immutable document/object identity under the existing lock order.
4. Add a behavioral Super Admin oracle that uses only authenticated public surfaces to attempt the exact upload plus `create_document` forgery, then asserts typed denial and zero submission, financial, and pending-idempotency residue. Keep the Finance Member malformed-document cases and exact positive replay.
5. Rerun only the affected paid-cost/expense/maintenance pgTAP, focused evidence/action tests, lifecycle smoke, Storage suite, paid-cost concurrency, catalog/grant probes, and focused independent review.

### Important

None beyond the continued C1.

### Minor verification issue

The retained paid-cost concurrency harness is not repeatable against the database left by its previous successful run. `registerRaceEvidence` uses deterministic immutable Storage paths, while fixture reload does not remove or replay them. This re-review's run passed 3/7 and failed four setup phases on `bucketid_objname` duplicates before reaching their race oracles. The reported 7/7 clean-reset result remains plausible, but the harness should use per-run unique evidence or safely replay the registered identity so a focused reviewer can rerun it without a full database reset.

## Focused verification

- Exact head/status before writing this review: clean `268b7b1d3832f2346e22c08fee633b6d2d0b594f`; `git diff --check` passed.
- Focused pgTAP: **201/201 passed** across paid-cost acceptance (33), expense approval (88), maintenance handoff (66), and expense responsibility (14).
- Focused application tests: **4 files / 52 tests passed**.
- Paid-cost lifecycle retained contract: **2/2 passed**.
- Document evidence/Storage suite: **6/6 passed**.
- Paid-cost concurrency rerun: **3/7 passed; 4 setup failures** from deterministic pre-existing immutable race-object paths, not race-oracle failures.
- Independent authenticated Super Admin submit probe: **bypass reproduced**, then rolled back with zero residue.
- Independent two-actor submit/approve probe: **bypass reproduced through financial effects**, then rolled back with zero residue.

## Gate

**Track 6 status: BLOCKED. Next milestone gate: CLOSED.** Do not approve Track 6 until the registrar authority is exclusive, the authenticated Super Admin forgery oracle is retained and green, affected focused gates pass, and a new independent re-review approves the exact correction head.
