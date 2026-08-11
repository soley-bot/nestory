# Track 6 Paid Cost Progress

## Active milestone

- Branch: `codex/ips-operational-readiness`
- Approved base: `7a0cdb51b72976b2f7c00a08a3930dc25f24058f`
- Status: verified evidence authority and operator paid-cost workflow are implemented; retained scenario/concurrency evidence is next.
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
