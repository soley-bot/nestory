# Track 6 Paid Cost Independent Review

## Verdict

**BLOCKED at `2309db0fb1f70c5fe0cb73790fc0997bffd64f9e`.** Track 6 must not be approved or advance to the next milestone. One Critical evidence-integrity defect remains: the authenticated paid-cost command accepts an ordinary document as receipt evidence without proving that it came through the verified paid-cost registrar. No other Critical or Important Track 6 defect was confirmed.

Review range: approved base `7a0cdb51b72976b2f7c00a08a3930dc25f24058f` through exact clean head `2309db0fb1f70c5fe0cb73790fc0997bffd64f9e`.

## Spec compliance

- **Issues.** Acceptance criteria 3-5 are not satisfied at the database authority boundary. The application normally uploads and registers correct evidence, but an authenticated Finance Member can call the granted `submit_expense` RPC directly and bypass that application path.
- Criteria 1-2 are implemented in the changed operator UI: paid-cost/already-paid language, exact amount/date/source/responsibility/reference, required evidence input, and no-effect-before-approval guidance are present.
- Criteria 6-8 have strong retained literal evidence for accepted/rejected/reversed scenarios, owner/tenant/petty-cash effects, close continuity, official statement source links, retained PDF/XLSX artifacts, and a `0.00` statement difference. Those happy-path results do not close the malformed-evidence authority gap below.
- Criterion 9 is otherwise supported by explicit grants, checked roles, actor-bound financial idempotency, and real-session race coverage.
- Criterion 10's browser flow and the one full matrix were deliberately not rerun under the review instructions. Their committed reports, scripts, and artifacts were inspected; this review does not independently claim a new browser or full-matrix execution.
- Criterion 11 is not met because independent approval is blocked.

## Strengths

- `preparePaidCostEvidence` uses create-only upload, downloads retained bytes, recomputes SHA-256 and size, checks Storage object identity/version/MIME metadata, validates the registrar response, and does not delete an ambiguous object.
- Raw object inspection and registration are service-role-only; Finance evidence reads and paid-cost submission have narrow explicit grants. The privileged functions inspected are postgres-owned, `SECURITY DEFINER`, and `search_path = ''`.
- The correction migration `20260811084825_restore_general_financial_evidence_storage_lock.sql` restores the generalized fingerprint lock in both authenticated Storage update/delete policies without reopening the paid-cost namespace. The focused real-Storage suite passed 6/6.
- Changed money fields cross the server action boundary as canonical decimal strings rather than JavaScript numbers.
- Finance Member submit, Finance Manager review, Super Admin reversal, and maker-checker separation are consistent in the action contexts and database capability predicates.
- The retained lifecycle smoke has literal identities and totals across nine persisted scenarios, seven accepted effects, two reversals, four owner components, 17 statement lines/source links, retained PDF/XLSX, and zero difference. The paid-cost race harness asserts real waits, typed losers, no `40P01`, append-only results, and no pending idempotency.

## Findings

### Critical

#### C1 - The paid-cost RPC does not require registered immutable paid-cost evidence

Locations:

- `supabase/migrations/20260811070217_harden_paid_cost_evidence.sql:374-407`
- `supabase/migrations/20260808235616_operational_schema_baseline.sql:23304-23324`
- approval recheck: `supabase/migrations/20260808235616_operational_schema_baseline.sql:21580-21605`
- insufficient oracle: `supabase/tests/ips_paid_cost_acceptance_test.sql:72-81`

The Track 6 wrapper authenticates and authorizes before lookup, but for a general paid cost it proves only `p_supporting_document_id IS NOT NULL`, then delegates to the legacy baseline. The baseline accepts any active same-organization document whose path resolves to an existing Storage object. It explicitly accepts `document.property_id IS NULL` and does not require:

- category `Paid cost evidence`;
- a paid-cost evidence namespace path;
- an immutable `content_sha256`;
- exact property equality;
- registration/upload by the submitting actor; or
- non-reuse of a receipt by an unrelated submission.

The approval path repeats the same generic existence/property-null predicate. The UI displays `No document attached` when its fingerprint reader returns no row, but the approval action remains available, so maker-checker review does not fail this malformed submission closed.

Independent rolled-back reproduction:

1. Inserted a Storage object at `00000000-0000-0000-0000-000000000001/general-documents/unverified-receipt.pdf`.
2. Inserted document `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0dad` for the target property with category `Lease agreement` and `content_sha256 = NULL`; neither verified paid-cost RPC was used.
3. Set the authenticated actor to Finance Member `00000000-0000-0000-0000-000000000801` and called the public `submit_expense` RPC with that document.
4. The call succeeded with `{"status":"submitted","submission_id":"73ebe162-61c0-437f-9623-3b0b86b16b36"}` and persisted the ordinary document as `supporting_document_id` inside the transaction.
5. The transaction rolled back. Follow-up counts for the probe submission, document, and object are all zero.

This is a direct violation of the binding immutable-evidence outcome. A legitimate submitter can bypass retained-byte registration, and a later approval can create payment, Ledger, responsibility, allocation, close, and official-statement effects without authoritative receipt evidence.

Required correction:

1. Add an additive migration with one private, search-path-locked evidence eligibility assertion used by both general paid-cost submission and approval. Authenticate and authorize before any caller-controlled lookup.
2. Require exact organization and property equality, category `Paid cost evidence`, unarchived state, a valid immutable SHA-256, paid-cost namespace path, allowed MIME/positive bounded size, current retained Storage object/metadata equality, and binding to the submitting actor's verified registration. Reject a receipt already bound to an unrelated paid-cost submission; preserve exact replay of the original actor/payload/identity.
3. Preserve the separate maintenance-task evidence rules. Do not weaken document/Storage mutation guards, RLS, grants, or lock order.
4. Return a stable typed error atomically before submission/idempotency or approval/financial effects.
5. Add executable negative oracles for ordinary document, property-null document, wrong category/path/property/uploader, null or mismatched fingerprint, missing/replaced object, and unrelated evidence reuse. Assert zero submission, financial, and pending-idempotency residue. Retain exact positive replay.
6. Run only affected gates: the paid-cost and expense/maintenance pgTAP files, focused evidence/action tests, lifecycle smoke, paid-cost submit/evidence/source-close concurrency, relevant Storage suite, then one focused independent re-review. Do not rerun the browser flow or full matrix for this correction.

### Important

None beyond C1.

### Minor

None in Track 6 scope. Cosmetic and unrelated legacy findings remain backlog items.

## Focused verification

- `npx supabase test db --local supabase/tests/ips_paid_cost_acceptance_test.sql`: **16/16 passed**. This suite currently proves only the non-null wrapper text, so it does not detect C1.
- Focused Vitest for paid-cost evidence, actions, screen, and data: **4 files / 52 tests passed**.
- Paid-cost scenario contract: **2/2 passed**.
- Paid-cost lifecycle smoke: **passed** with 9 submissions, 7 accepted effects, 2 reversals, 17 statement lines/sources, PDF/XLSX, and `0.00` difference.
- Paid-cost real-session concurrency: **6/6 passed**.
- Document evidence/Storage suite after the correction migration: **6/6 passed**.
- Catalog probes: expected function ownership/search paths and role grants; corrected authenticated Storage policies use the generalized fingerprint predicate and exclude `/paid-cost-evidence/%`; zero pending financial idempotency.
- Probe cleanup: zero C1 submissions/documents/objects remain.
- `git diff --check`: passed. Worktree remained clean at exact head.

## Task quality and gate

The implementation is well-scoped and the retained happy-path accounting/concurrency evidence is unusually strong, but the central database test is a source-text assertion rather than a behavioral evidence-eligibility oracle. That allowed the public command to claim immutable-evidence enforcement while validating only non-nullness.

**Track 6 status: BLOCKED. Next milestone gate: CLOSED until C1 is corrected and one focused independent re-review approves the correction.**
