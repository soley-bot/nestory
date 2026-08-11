# Track 6 Paid Cost Progress

## Active milestone

- Branch: `codex/ips-operational-readiness`
- Approved base: `7a0cdb51b72976b2f7c00a08a3930dc25f24058f`
- Status: implementation, browser acceptance, one full matrix, and the coordinated correction batch are complete at `7da8562`; independent review is next.
- Preserved approvals: Tracks 1-5 and Track 9.
- Scope: local synthetic authority only. No hosted Supabase/Vercel mutation, real IPS data, deploy, push, merge, or `main` cleanup.

## Operator outcome

A Finance Member records an already-paid cost with exact paid amount/date, funding source, receipt/payment reference, immutable receipt evidence, and owner/tenant responsibility. A different Finance Manager rejects or approves it. A Super Admin can append an exact reversal and corrected resubmission. Every accepted result remains traceable through the existing payment, Ledger, owner/tenant, petty-cash, close, and official Owner Statement authorities without creating accounts payable.

## Acceptance gate

- The operator cannot reasonably interpret the workflow as an unpaid bill or payment-execution queue.
- General paid costs require both immutable evidence bytes and a receipt/payment reference.
- Normal owner/property, owner-responsible, tenant-responsible, petty-cash-funded, rejection/resubmission, approval, reversal, wrong-amount correction, and missing-evidence scenarios have literal oracles.
- Submission/review/reversal authority, tenant isolation, exact-money strings, actor-bound idempotency, canonical locks, evidence immutability, close continuity, and statement source links are verified.
- One complete authenticated browser flow and one full expensive matrix run only at their planned milestone boundaries.
- One independent reviewer must approve the exact committed milestone head before the next milestone opens.

## Checkpoints

### 2026-08-11 - plan frozen

- Verified clean worktree at `7a0cdb5` before planning.
- Inspected the parent program, progress report, actions, form/review UI, expense database RPCs, evidence projections/immutability guards, current pgTAP coverage, and existing Track 4 service-verified artifact pattern.
- Supabase changelog check: explicit table/function grants remain required independently of RLS; no relevant breaking change invalidates the local design.
- Binding plan: `docs/superpowers/plans/2026-08-11-track-6-paid-cost.md`.

### 2026-08-11 - paid-cost evidence RED

- Production code remained unchanged.
- `npx supabase test db --local supabase/tests/ips_paid_cost_acceptance_test.sql` exited 1: 3/6 passed and assertions 4-6 failed exactly because `get_paid_cost_evidence_object`, `register_paid_cost_evidence_verified`, and strict document-required submission behavior do not exist.
- `npx supabase test db --local supabase/tests/finance_expense_approval_test.sql` exited 1: 86/88 passed. Assertion 87 caught no exception instead of typed `23514 Paid cost evidence document is required`; assertion 88 found one reference-only submission instead of zero.
- Both test files rolled back. No production financial or evidence row remains from the probe.

### 2026-08-11 - verified evidence authority GREEN

- CLI-generated migration: `20260811070217_harden_paid_cost_evidence.sql`.
- Clean `npm run db:reset` applied every migration through the Track 6 evidence migration.
- Database focused gates: paid-cost catalog/authority 14/14; existing expense approval 88/88.
- Application RED: 26/28 actions passed; failures proved missing evidence-file validation and legacy response/canonical-money behavior.
- Evidence-integrity RED: 1/2 direct evidence tests passed; a registrar response with a mismatched frozen hash incorrectly succeeded.
- Application GREEN: evidence/action tests 30/30 and `npx tsc --noEmit` pass. The server uploads create-only bytes, downloads and hashes retained bytes, verifies Storage identity/version/MIME/size, uses a service-only actor-scoped registrar, verifies the registrar response, and never deletes ambiguous evidence.
- Exact-money boundary: paid cost and markup now pass canonical two-decimal strings through a narrow generated-type override; no JavaScript number coercion remains on the changed submission path.
- Catalog contract proves authenticated callers cannot inspect/register raw evidence, service role is the only evidence registrar, the baseline command is private, the wrapper is authenticated-only, and paid-cost evidence paths are excluded from authenticated Storage update/delete policies.

### 2026-08-11 - unambiguous operator workflow GREEN

- Retained UI/action RED: focused Vitest passed 42/49; seven failures were exactly the legacy Add/Approve/Reject/Reverse Expense labels, absent already-paid guidance/file input, and legacy success messages. Data mapping remained green.
- Retained fingerprint RED: `ips_paid_cost_acceptance_test.sql` passed 14/16; only the missing Finance-readable fingerprint RPC and its explicit role grant failed.
- Additive CLI migration: `20260811071944_expose_paid_cost_evidence_fingerprint.sql`.
- Clean `npm run db:reset` applied every migration through the new fingerprint reader; generated database types expose its exact result fields.
- Database focused gate: paid-cost catalog/authority 16/16.
- Application focused gates: component/actions/data 50/50; `npx tsc --noEmit`; focused ESLint; `git diff --check` all pass.
- Operator surface now says `Record paid cost`, marks it `Already paid`, states submission does not create a new payment, requires paid date/source/reference/file, and uses paid-cost-specific approval/rejection/reversal language.
- Finance history now shows the retained evidence filename, byte size, and full SHA-256 through an authenticated Finance-only, search-path-locked read RPC; unavailable or unfingerprinted evidence is not presented as verified.

### 2026-08-11 - retained paid-cost lifecycle GREEN

- Retained contract RED was 0/2 before the scenario manifest, literal database smoke, and real-session race harness existed. The guarded baseline then failed closed because its legacy general costs had no immutable Storage evidence.
- The corrected guarded loader now uploads and verifies real local evidence bytes, uses only checked paid-cost submit/review/reverse commands, and retains nine literal scenarios: owner approval, tenant responsibility, petty cash, rejection/resubmission, approval/reversal, wrong-amount correction, pending review, and missing-evidence denial.
- Tenant responsibility is isolated on Garden G-02, so all ten previously approved rent scenarios remain unchanged. The prior Central reversed cost, Riverside rejection, and Garden pending cost are restored through the same verified-evidence boundary.
- Literal fixture GREEN: 9 persisted scenario submissions, 7 accepted payment/allocation/responsibility/Ledger identities, 2 exact reversals, 4 owner components, 17 immutable statement lines/source links, retained PDF/XLSX hashes and sizes, and `0.00` statement difference.
- Previous approved fixture gates remain GREEN: owner opening hash; 16 owner-balance components / 12 source types / 2 properties / 2 months; immutable owner-close R1/R2/R3 plus preparing R4; 17-line official statement; rent lifecycle 10/10.
- Real-session concurrency GREEN 6/6: duplicate submit, approve-vs-reject, approve-vs-reversal, reversal-vs-resubmit, evidence registration-vs-mutation, and paid-cost source-vs-close. The close contender waits, then fails typed on incomplete allocation without deadlock or pending idempotency residue.
- Static gates GREEN: Track 6 contract 2/2, TypeScript, focused ESLint, affected Owner Statement fixture contract 2/2, and `git diff --check`.

### 2026-08-11 - complete authenticated browser acceptance GREEN

- Browser contract RED was 0/1 because no retained Track 6 lifecycle script existed; the completed contract is GREEN 1/1 and is wired into the demo-tools suite.
- One isolated exact-worktree server ran on port 3013 with the existing local Supabase environment. Its verified process tree was stopped afterward; no other server was touched.
- The single complete flow passed seven phases: Finance Member submits an already-paid owner cost with real file bytes; remains read-only; Finance Manager reviews the exact SHA-256/file identity and approves; Super Admin appends an exact reversal; Finance Member submits corrected bytes/amount; Finance Manager approves once; Operations Manager is redirected to `/no-access`.
- Database acceptance proved original `100.00` is retained as `reversed`, corrected `90.00` is retained as `approved`, both preserve distinct evidence documents and payment/allocation/responsibility/Ledger identities, the exact reversal customer adjustment is `-100.00`, and pending financial idempotency is zero.
- The guarded fixture was restored in `finally`, including after any failure path.

### 2026-08-11 - one full matrix and coordinated correction GREEN

- The expensive matrix ran once at browser-accepted head `e3ba774`. It reached 48 pgTAP files and 1,733 assertions; 202 application files with 1,497 passing tests and one intentional skip; demo tooling 59/59; five real-role journeys 5/5; all retained owner, close, publication, rent, cutover, paid-cost, and document concurrency suites; TypeScript, ESLint, generated types, routes 47/47, UI copy, static discoverability 38/38, production build, database lint, advisors, and diff checks.
- The findings batch contained three scoped integration drifts: stale guarded-fixture submission counts, Storage policy-time access to the retired expense-only lock helper, and the corresponding owner-opening evidence policy contract. The Finance Manager day harness also retained legacy paid-cost labels. They were corrected together in additive migration `20260811084825_restore_general_financial_evidence_storage_lock.sql`, the literal fixture contract, and the role harness.
- Affected database rerun is GREEN 173/173 across demo seed, maintenance handoff, opening evidence fingerprints, and paid-cost acceptance. Document Storage is GREEN 6/6, including both cleanup/reference start orders. Paid-cost fixture remains exact at 9 submissions, 7 accepted effects, 2 reversals, 17 statement lines/source links, retained PDF/XLSX, and `0.00` difference.
- Catalog proof: the generalized financial-evidence predicate is executable by `authenticated` only, not `anon` or `service_role`; the retired expense-only helper is not executable by `authenticated`; exactly two paid-cost Storage policies remain; pending financial idempotency is zero. Database lint has zero errors and the same five legacy unused-variable warnings; error-level advisors return zero findings.
- The affected Finance Manager rerun passes every Track 6 phase through submit, evidence review, approval, and correction/reversal before stopping on the unrelated legacy withdrawal-capacity control. The route-discoverability rerun passes the expense route and 20 journeys before the same unrelated property-account link timeout. Both are backlog items and do not alter Track 6 authority.
- The single accessibility crawl retains the existing 98 cross-module findings. `/bills-expenses` is clean across four viewports: zero axe violations, navigation/page errors, horizontal overflow, or action-reachability failures. Artifact: `artifacts/ui-redesign/ui-redesign-2026-08-11T08-38-44.543Z-axe-p31900/summary.json`.
- The guarded fixture was restored after affected role tests and isolated port 3013 was stopped. No hosted system, real IPS data, push, merge, deploy, or `main` change occurred.
