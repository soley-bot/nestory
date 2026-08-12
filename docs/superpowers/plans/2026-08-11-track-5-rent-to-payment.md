# Track 5 lease-to-rent-to-payment milestone

## Operator outcome

A Finance Manager can process every normal IPS rent situation from visible
business-language controls, without database-model coaching, and trace each
result through tenant balance, settlement/reversal, Ledger, property cash,
owner allocation, close readiness, and the official Owner Statement.

## Acceptance criteria

1. One literal scenario matrix covers full-month rent, mid-month move-in,
   mid-month move-out, unpaid rent, partial payment, late payment,
   owner-direct collection, one selected historical recovery month, renewal,
   and a superseding rent change.
2. Lease terms, billing terms, and the approved rent policy remain the sole rent
   authority. Invoice obligation and cash settlement remain separate immutable
   events; retries cannot duplicate either.
3. Each scenario proves exact amount/proration, billing period, due/settlement
   dates, collection route, balance/status, fee occurrence, reversal symmetry,
   typed blockers, and tenant/organization isolation.
4. The UI states the missing setup or next action in business language. Selected
   historical recovery identifies adjacent gaps and never implies a bulk
   backfill. Structural lease/policy changes remain Super Admin-only; ordinary
   Finance Manager settlement and safe correction authority follows the already
   approved role model.
5. Every generated/settled/reversed source is discoverable through Ledger and
   property cash, allocates to the authoritative owner roster where applicable,
   affects close readiness correctly, and freezes into an Owner Statement source
   line without unexplained difference.
6. Focused development uses only changed-behavior tests. One authenticated
   browser flow exercises the complete matrix with real local roles and database
   effects, followed by one full milestone matrix and one independent review.
7. Genuine accounting, authorization, isolation, evidence, idempotency, or
   concurrency defects block approval; unrelated cosmetic/legacy findings are
   recorded without expanding this milestone.

## Implementation batch

- Add one retained database scenario contract and one guarded scenario fixture
  smoke before production edits.
- Reuse existing lease/rent/payment authority and correct only missing behavior,
  downstream integration, and operator-language gaps found by the matrix.
- Add a single browser acceptance script beginning at `/workspace` and using
  the real Super Admin, Finance Manager, Finance Member, and Operations roles.
- Keep the approved Owner Balance, Owner Close, and Owner Statement authorities
  additive and unchanged except where a proven rent-source integration defect
  requires a focused correction.

## Roles and boundary

- Implementer: primary agent `/root`.
- Independent reviewer: a separate review pass after the milestone commit.
- Local worktree/Supabase only. No hosted migration, real IPS data, deploy,
  email, cron, backup, push, merge, or production claim is authorized here.
