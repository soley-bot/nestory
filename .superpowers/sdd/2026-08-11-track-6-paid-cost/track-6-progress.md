# Track 6 Paid Cost Progress

## Active milestone

- Branch: `codex/ips-operational-readiness`
- Approved base: `7a0cdb51b72976b2f7c00a08a3930dc25f24058f`
- Status: plan frozen; implementation has not started.
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
