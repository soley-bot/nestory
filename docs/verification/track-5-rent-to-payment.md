# Track 5 lease-to-rent-to-payment verification

Date: 2026-08-11

## Outcome

A Finance Manager can work the ten approved IPS rent situations from the
authenticated Finance workspace and trace a real through-IPS settlement from
tenant obligation through Ledger, property cash, owner allocation, close, and
an official byte-verified Owner Statement. Structural rent authority remains
Super Admin-only, Finance Member remains read-only, and Operations remains
denied.

The retained local scenario oracle covers:

- full-month rent: `1450.00`, due `2026-08-05`;
- mid-month move-in: `480.00` under the approved billing override;
- mid-month move-out: `450.00` under the approved billing override;
- unpaid rent: `720.00`, shown as `Overdue`;
- partial IPS payment: `825.00` paid and `25.00` due;
- late IPS payment: `25.00` received `2026-08-11`, shown as `Paid late`;
- direct-owner collection: `900.00` owner-collected, `0.00` IPS cash, `25.00`
  due;
- selected historical recovery: July only, with June left ungenerated;
- renewal: term sequence 2 at `1100.00`;
- rent change: September remains `1450.00` under `next_full_period`, with
  October becoming `1550.00`.

## Authority and integrity

The additive migration
`20260811023549_support_mid_period_rent_change_segments.sql` introduces
immutable `tenant_invoice_rent_segments` evidence with RLS plus FORCE RLS,
Finance-read-only policy, no authenticated direct DML, and checked immutable
triggers. Rent generation continues to derive obligation exclusively from
authoritative lease and billing terms. A later structural term change that
would rewrite an already-generated obligation fails with typed
`rent_obligation_already_generated`.

The approved rent-change rule is `next_full_period`. A change dated
`2026-09-15` freezes two September term segments, `1450.00` and `0.00`, without
mislabeling the invoice as prorated; October uses `1550.00`. Two real-session
races prove both lock orders: term-first generation waits and sees both terms;
generation-first term mutation waits and is rejected after the immutable
obligation wins.

The Track 5 contract proves exact management-fee snapshots through the guarded
rent fixture and the complete retained database suite. Existing checked tenant
collection tests in the same 1,707-assertion matrix prove exact append-only
payment reversal, negative Ledger/cash symmetry, replay/conflict behavior, and
restored tenant balance. Existing granular Finance authority tests prove
cross-organization mutation denial; the new segment table separately proves
Operations cannot read Finance evidence. No financial, security, tenant, or
idempotency control was weakened.

## Browser acceptance

One exact-worktree browser flow started at `/workspace` and passed the complete
local lifecycle:

1. the literal ten-scenario contract and guarded fixture reconciled;
2. Finance Manager recorded the final `25.00` late payment and saw `Paid late`;
3. the separate obligation, payment, allocation, Ledger, and property-cash
   rows were verified;
4. the rent receipt allocated to the authoritative owner and rerolled the
   owner period;
5. Super Admin recovered only July, leaving June absent;
6. Super Admin closed the reconciled month and published the official PDF and
   Excel Owner Statement;
7. downloaded bytes matched stored SHA-256 and size metadata;
8. Finance Member had read-only access and Operations had neither navigation
   nor direct-route access;
9. the frozen close source included the tenant rent receipt and there were no
   pending financial idempotency requests.

The harness restored the guarded baseline in `finally`.

## Verification evidence

- clean local reset and guarded fixture load: pass;
- complete database matrix: 46 files, 1,707/1,707 assertions;
- database lint: zero errors, five unchanged warning-only unused variables;
- error-level database advisors: zero findings;
- lease authority/history/relationship concurrency: pass;
- owner readiness 13/13, opening 4/4, lifecycle 6/6, close 15/15;
- statement publication 4/4 and real statement Storage 1/1;
- document evidence Storage 6/6 and Track 5 rent races 2/2;
- Track 5 database scenario contract 28/28 and literal contract 2/2;
- TypeScript, generated database types, ESLint, and production build: pass;
- application tests: 198 files, 1,485 pass plus one intentional skip;
- retained tool contracts: 50/50;
- route coverage 47/47, authenticated discoverability 38/38, UI copy clean;
- real fixture role journeys: 5/5;
- one authenticated Track 5 browser acceptance: pass.

The full accessibility crawl completed once and retained the same 98
program-wide backlog findings as Track 4. The `/rent-income` color-contrast rule
is present in each of the four prior Track 4 artifacts and is therefore not a
Track 5 regression. It remains in the program-wide accessibility backlog.

## Matrix correction and scope

The one full matrix found one Track 5 test-harness isolation defect: after the
final two-session rent race, the concurrency script left its last fixture
mutation in the shared local database. The correction restores the guarded
fixture in the final hook. Only the affected rent concurrency and ordered
fixture smokes were rerun; they pass 2/2, then all owner fixture oracles, then
the 10/10 rent scenario smoke.

This is local milestone evidence only. No hosted Supabase or Vercel mutation,
real IPS data access, email, cron, backup, deploy, push, or merge was performed.
