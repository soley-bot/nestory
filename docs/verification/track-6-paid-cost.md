# Track 6 paid-cost verification

## Outcome

Track 6 delivers one unambiguous already-paid-cost workflow. A Finance Member submits exact amount/date, funding source, responsibility, receipt/payment reference, and immutable evidence bytes. A different Finance Manager reviews the frozen fingerprint and approves or rejects. A Super Admin appends reversals; corrections are new evidence-backed submissions. The workflow creates no accounts-payable authority.

Implementation head before the matrix was `e3ba774`; the coordinated matrix correction is `7da8562`. This is local synthetic verification only.

## Financial and evidence authority

- General paid costs require a non-empty reference and a verified immutable document. Missing, unavailable, mismatched, wrong-scope, or mutable evidence fails closed before financial effects.
- Changed money inputs cross the action/RPC boundary as canonical two-decimal strings without JavaScript number coercion.
- Approval creates the intended payment, Ledger, owner/tenant responsibility, petty-cash, allocation, close-line, and statement-source identities exactly once. Rejection creates none. Reversal appends exact opposite effects without changing the original evidence.
- Verified evidence registration is service-only. Finance can read the retained filename, byte size, and SHA-256 through a checked read RPC. Authenticated Storage update/delete policies exclude paid-cost evidence and reject all generalized fingerprinted financial evidence.
- Actor-bound idempotency, tenant/role checks, immutable snapshots, canonical financial-month/source locks, and maker-checker separation are retained.

## Retained acceptance evidence

- Literal fixture: 9 submissions, 7 accepted effects, 2 reversals, 4 owner components, 17 immutable statement lines/source links, retained PDF/XLSX artifacts, and `0.00` statement difference.
- Concurrency: paid-cost 6/6; document Storage 6/6 after the correction. The complete matrix also passed owner readiness 13/13, opening workflow 4/4, owner lifecycle 6/6, close 15/15, statement publication 4/4, statement Storage 1/1, rent 4/4, and cutover 5/5.
- Browser: one isolated seven-phase real-role flow passed Finance Member submit/read-only, Finance Manager fingerprint review/approval, Super Admin reversal, corrected resubmission/reapproval, Operations denial, exact database effects, and fixture restoration.
- Application matrix: 202 files, 1,497 passing tests and one intentional skip; demo tools 59/59; routes 47/47; static authenticated routes 38/38; five role journeys 5/5; TypeScript, ESLint, UI copy, and production build green.
- Database matrix: 48 files and 1,733 assertions reached. The single findings batch was corrected; affected pgTAP is 173/173, database lint has zero errors with five unchanged warning-only unused variables, and error-level advisors have zero findings.

## Accessibility and backlog boundary

The single full crawl retains 98 pre-existing cross-module findings. The changed `/bills-expenses` route has zero axe violations, navigation/page errors, horizontal overflow, or action-reachability failures across four viewports. Evidence is at `artifacts/ui-redesign/ui-redesign-2026-08-11T08-38-44.543Z-axe-p31900/summary.json`.

Two affected role-harness reruns progressed through all Track 6 assertions and then stopped outside scope: the authenticated route smoke could not find a property-account link after 20 passes, and the Finance Manager day smoke could not find the legacy withdrawal-capacity control after completing paid-cost submit/review/approval/correction. They remain backlog, not Track 6 defects.

## Scope and gate

No hosted Supabase or Vercel mutation, real IPS data, email, cron, backup, deployment, push, merge, or `main` cleanup was performed. Independent review of the exact clean milestone head is still required before Track 6 is approved and the next milestone opens.

## Independent review correction

The initial independent review reproduced one Critical authority bypass: an authenticated submitter could reference a generic, unhashed document that never passed the paid-cost registrar. Correction commit `14f3f4e` adds a private assertion shared by submit and approval. It requires the exact organization, property, submitting actor, paid-cost category/namespace, allowed MIME, bounded size, canonical SHA-256, retained Storage metadata, and matching immutable registrar activity. A document-scoped transaction lock prevents concurrent double use while preserving exact idempotent replay.

The retained correction suite rejects generic, property-null, wrong-category/path/property/uploader, unhashed, missing-object, metadata-mismatched, sequentially reused, and concurrently reused evidence with no submission, financial, or pending-request residue. Final affected gates are pgTAP 201/201, application 52/52, paid-cost races 7/7, document Storage 6/6, lifecycle contract 2/2, and exact fixture reconciliation. Focused independent re-review is pending; browser and the full matrix were not rerun.
