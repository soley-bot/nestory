# Track 5 implementation report

## Milestone outcome

Finance can execute and explain the ten approved lease-to-rent scenarios, and
one through-IPS late settlement is proven end to end through the official Owner
Statement. The operator-facing statuses are `Overdue`,
`Partly paid · overdue`, and `Paid late`; selected historical recovery explicitly
leaves adjacent gaps in the attention queue.

## Coordinated implementation batch

- Added immutable per-term rent-segment evidence and checked multi-term invoice
  generation in CLI-created migration
  `20260811023549_support_mid_period_rent_change_segments.sql`.
- Retained the literal ten-scenario manifest, 28-assertion pgTAP contract,
  guarded fixture smoke, two-order real-session concurrency harness, and one
  `/workspace`-first authenticated browser lifecycle.
- Updated only the Finance rent status language needed by the changed workflow.
- Regenerated Supabase database types.
- Corrected the one matrix finding by restoring the guarded fixture after the
  final concurrency case; no production authority changed after the matrix.

## Acceptance disposition

1. Ten literal scenarios: satisfied by
   `scripts/fixtures/ips-rent-scenarios.json`, its 2/2 Node contract, and the
   28/28 database contract.
2. Sole rent authority and immutable obligation/settlement: satisfied by
   checked term generation, segment evidence, generated-obligation drift
   rejection, and existing collection idempotency authority.
3. Amounts, dates, routes, balances, fee/reversal/isolation controls: exact
   scenario amounts and dates are retained in the Track 5 contract; applicable
   management fee, reversal, replay, cross-organization, and role isolation
   gates passed in the complete 1,707-assertion database matrix.
4. Business language and role boundary: focused UI 16/16 and the real-role
   browser flow prove the new labels, selected-month warning, Finance mutation,
   Finance Member read-only, and Operations denial.
5. Downstream evidence: Ledger, property cash, owner allocation, owner period,
   close source, official publication, and downloaded bytes are all checked.
6. Execution discipline: focused development gates, one browser flow, one full
   matrix, one batched correction, and affected reruns only.
7. Blocking defect policy: no unresolved critical accounting, authorization,
   tenant-isolation, evidence, idempotency, or concurrency defect is known.

## Full matrix and correction

The full database boundary passed 46 files and 1,707 assertions. All retained
lease/owner/statement/document/rent concurrency gates passed. The application
boundary passed 198 files and 1,485 tests plus one intentional skip, 50 tool
contracts, lint/type/build, 47 routes, 38 authenticated routes, and five role
journeys. The full accessibility crawl retained the same 98 legacy findings;
the `/rent-income` contrast finding predates Track 5 in all four compared Track
4 artifacts.

The sole scoped matrix finding was fixture contamination after the final rent
race. The final hook now reloads the guarded fixture. The exact affected order
passes: rent races 2/2, four owner fixture reconciliations, then the 10/10 rent
scenario smoke.

## Evidence boundary

This report records deterministic local Supabase and exact-worktree evidence.
It makes no hosted parity, real IPS, production email, cron, backup, deployment,
push, or merge claim. Independent milestone review remains required before
Track 5 approval.
