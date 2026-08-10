# Track 3 owner-balance lifecycle verification

## Decision status

- Implementation status: correction round 1 complete on `codex/ips-operational-readiness`; correction base `3bc20304062b0499c759132338e1c83280d9e8d4`.
- Review status: pending fresh independent approval; Track 4 remains blocked.
- Execution boundary: local worktree and local Supabase only. No hosted Supabase, Vercel, email, push, merge, deploy, or real IPS data operation occurred.

Track 3 replaces presentation-time owner-balance inference with persisted authority: one immutable allocation per atomic source, the exact roster or explicit owner snapshot used, immutable component movements and reversal lineage, serialized held-cash consumption, explicit component transfers, and deterministic four-component monthly roll-forward.

## CLI-generated migrations

Created with `npx supabase migration new <descriptive-name>` under Supabase CLI 2.108.0:

1. `20260810051018_owner_balance_lifecycle_schema.sql`
2. `20260810051854_owner_event_allocation_and_component_movement.sql`
3. `20260810053145_owner_cash_reversal_and_held_cash_guards.sql`
4. `20260810053705_owner_balance_rollforward_authority.sql`
5. `20260810055616_owner_balance_source_drillthrough.sql`
6. `20260810060827_owner_balance_transfer_remediation.sql`
7. `20260810062903_allow_zero_cent_owner_allocations.sql`
8. `20260810065711_delegate_safe_finance_corrections.sql`
9. `20260810070356_enforce_unresolved_owner_transfer_period_block.sql`
10. `20260810073324_owner_distribution_ledger_activity_parity.sql`
11. `20260810073506_project_owner_distribution_reversals.sql`
12. `20260810091218_harden_owner_balance_lifecycle_corrections.sql`

The final local reset applied the baseline and all 12 Track 3 migrations cleanly. Migration 12 was created with `npx supabase migration new harden_owner_balance_lifecycle_corrections` under the same installed CLI; no timestamp was hand-authored.

## Authority contract

The exact source registry is complete:

| Source | Owner allocation | Persisted effect |
| --- | --- | --- |
| `tenant_rent_receipt` | effective roster | `+ips_held_owner_cash` |
| `owner_direct_rent_receipt` | explicit owner | activity only |
| `management_fee_occurrence` | effective roster | `+owner_due_to_ips` |
| `owner_paid_cost` | effective roster | `+owner_due_to_ips` |
| `owner_invoice_payment` | explicit owner | direct payment: `-owner_due_to_ips`; automatic held-cash settlement: `-owner_due_to_ips` and `-ips_held_owner_cash` |
| `owner_contribution` | explicit owner | `+ips_held_owner_cash` |
| `owner_reimbursement` | explicit owner | `-ips_due_to_owner` |
| `owner_distribution` | explicit owner | `-ips_held_owner_cash` |
| `security_deposit_receipt` | effective roster | `+security_deposit_custody` |
| `security_deposit_refund` | effective roster | `-security_deposit_custody` |
| `owner_component_transfer` | explicit owner | equal opposite instructed component lines |
| `reversal` | original snapshot | exact opposite original movements |

Effective-roster allocation requires a half-open exact-100.000 roster and awards fractional cents by largest remainder, then `property_owners.id`. Explicit-owner commands prove the source owner. Source fingerprints, owner/share/date/roster snapshots, actors, component movements, consumption links, transfer evidence, and reversal links are persisted and append-only.

Each ready/stale owner period has exactly four components: `ips_held_owner_cash`, `owner_due_to_ips`, `ips_due_to_owner`, and `security_deposit_custody`. The first month consumes four approved openings; each later month opens from the immediately prior closing. Every component satisfies `closing = opening + movement`, and correction/source drift marks dependent usable periods stale without changing a closed Track 4 revision.

Available withdrawal derives only from authoritative held cash less canonical consumption/commitment. Deposit custody and the other components never add capacity. Tenant-payment, owner-payment, and withdrawal reversals lock persisted source/owner movements and reject exact downstream consumption. Finance Manager has only the guarded ordinary `canCorrectFinance` path; transfer and exceptional/closed-period authority remain Super Admin only.

## Security and idempotency

All nine Track 3 tables have RLS and FORCE RLS enabled. Catalog inspection found authenticated SELECT only and no `anon`, `service_role`, or `PUBLIC` table privilege. Authenticated users have execute only on checked organization-scoped RPCs; `anon`, `service_role`, and `PUBLIC` have none. Private helpers remain outside exposed schemas, with explicit revokes, locked empty search paths, actor checks, and stable lock ordering. Direct application DML is denied.

All new commands use the existing `app_private.financial_idempotency_requests` authority. Canonical hashes contain public arguments only and keep server-resolved source fingerprints, roster facts, and lock state separate. Exact completed replay returns stored identities before mutable validation; different actor or payload reuse fails `22023` without an effect.

New-request order is replay/conflict lookup, organization financial-month lock, property/month and stable source/owner/component lock, financial idempotency claim, then domain/projection rows in stable UUID order.

## Guarded fixture and browser acceptance

The corrected literal fixture contains 16 component rows across two properties and two months, all 12 source types, explicit transfers, and one deliberately blocked `116.00` management-fee source with `owner_share_total_not_100`. Central Residence closes the current month at held cash `1855.00`, owner due to IPS `0.00`, IPS due to owner `200.50`, and custody `860.00`, and the next month opens with those exact values. Garden carries only explicitly transferred `500.00` held cash and `102.80` owner due to IPS. The opening semantic manifest hash remains `1f28cceda852baeebe7878edf71ec09375ebb7d2958e572cc047f73b955fc4b0`.

The complete authenticated browser flow was run exactly once before correction round 1 against the isolated worktree server. Real local actors started at `/workspace`, entered by visible navigation, and completed opening visibility, supported allocation, canonical contribution, safe distribution/reversal, current and next regeneration, four-component continuity, transfer/remediation visibility, Finance Member denial, and both Operations-role denials. The implementation report records all 11 summarized phases. Correction round 1 did not rerun the browser or full matrix. No retained raw browser/full-matrix command log, exit-code/head/database-identity file, or artifact-SHA correlation was found, so those historical summarized executions are not claimed as independently correlated exact-head proof.

## Verification summary

Strict TDD evidence, per-mutation RED/GREEN commands, detailed database effects, lock/source analysis, and the complete file inventory are recorded in `.superpowers/sdd/2026-08-10-track-3-owner-balance-lifecycle/track-3-report.md`.

Final affected gates after the last integrity correction:

- clean local reset through all 11 Track 3 migrations;
- allocation/cash pgTAP 72/72;
- roll-forward pgTAP 24/24;
- tenant collection/reversal behavior 36/36 after its required baseline fixture;
- lifecycle fixture: 16 component rows, 12 source types, two properties, two months;
- two-/three-session lifecycle concurrency 6/6;
- focused application batch 78/78 and canonical finance actions 20/20;
- TypeScript, focused ESLint, generated types, production build, and `git diff --check` green;
- database lint: zero errors, five unused-variable warnings.

The expensive program-wide matrix was run once after browser acceptance and was not rerun after its coordinated correction batch:

- pgTAP: 1,481 assertions, with 12 findings in four legacy contract files and all new Track 3 files green; the real Ledger parity gap and stale contracts were corrected through affected reruns;
- Vitest: 1,438 passed, one intentional skip, one stale theme-contract failure corrected through its affected test;
- demo tooling 44/44; owner readiness 13/13; opening workflow 4/4; schema concurrency 2/2; lifecycle concurrency 6/6; document/storage gates 6/6;
- UI route coverage 47/47, UI copy green, static authenticated routes 38/38, role journeys 5/5, TypeScript/ESLint green;
- the complete route journey reached an unrelated legacy `/users-roles` SSR `document is not defined` error;
- the accessibility artifact at `artifacts/ui-redesign/ui-redesign-2026-08-10T07-16-42.173Z-axe-p27208/summary.json` records 118 program-wide findings: 88 legacy contrast violations, two property-account scroller findings, 20 blocked stack-frame POSTs, and four console plus four page errors from `/users-roles`; `/balances` has no axe or page-error finding;
- corrected local production build green, with only the existing multiple-lockfile/workspace-root warning.

## Residuals and next gate

Track 4 must not start until a fresh reviewer approves accounting, authorization, tenant isolation, source integrity, idempotency, concurrency, irreversible history, scope, and test validity. The final commit has affected-gate evidence rather than a prohibited second full-matrix run. The unrelated `/users-roles` SSR issue, program-wide accessibility backlog, and five no-error database-lint warnings remain outside this milestone. Hosted and production truth remains unverified and unchanged.

## Correction round 1 verification

Independent review findings C1-C3 and I1-I3 are corrected at the local application/database boundary:

- baseline automatic held-cash settlement and paid-cost reversal atoms are registered with exact two-component/original-reversal lineage, while unmappable legacy rows remain typed blocking remediation;
- one canonical property/owner/currency lifecycle lock serializes chronological producers, consumers, reversals, transfers, opening corrections, and period publication; reversed positives are ineligible and exact consumption must reach zero remaining;
- predecessor state is validated under the shared lock, four later openings cannot restart a missing chain, and both allocation/generation and opening-correction/generation winner orderings are covered;
- transfers require an immediate ready/closed predecessor and its exact remaining amount derived from immutable equal-opposite lines; stale/missing/partial/over/wrong/duplicate cases block;
- historical period closing is labelled separately from one current checked capacity with status/as-of/deductions;
- owner-invoice payment crosses the application boundary as an exact canonical decimal string, including `900719925474.09`.

Final affected evidence after the correction migration:

- clean reset through all 12 Track 3 migrations and regenerated database types;
- correction pgTAP 40/40 and retained executable live catalog/role matrix 22/22;
- original allocation/cash 72/72, roll-forward 24/24, tenant behavior 36/36, and affected opening suites 220/220;
- guarded opening hash plus lifecycle fixture 16 component rows/12 source types/2 properties/2 months;
- original lifecycle concurrency 6/6 and correction lifecycle concurrency 6/6;
- focused application 35/35, TypeScript, focused ESLint, build, and `git diff --check` green;
- database lint zero errors with five existing unused-variable warnings; error-level local advisors zero findings.

The live matrix proves all nine tables RLS plus FORCE RLS, authenticated tenant-scoped SELECT only, complete direct-DML denial, checked public RPC/private helper grants, and real Super Admin, Finance, Operations, unaffiliated, cross-organization, anonymous, and service-role behavior. The historical raw browser/full-matrix evidence limitation remains explicit; neither expensive gate was rerun. Track 4 remains blocked pending fresh independent approval.

## Correction round 2 verification

Re-review finding N1 is corrected locally from base `e7e204fe7d1c28b7239b6dac045c76be93829c4c` by CLI-generated migration `20260810103823_enforce_owner_balance_global_lock_order.sql`. Every affected owner-balance writer now acquires the shared financial-month key before owner lifecycle and stable source/consumer keys. Authorization and completed replay remain before mutation locking, the three new chain helpers are revoked `app_private` functions with locked search paths, and a live definition audit reports zero direct lifecycle-before-month inversions.

The retained two-session same-owner/same-month race uses an exact advisory-key barrier between acquisitions in both winner orderings. RED reproduced PostgreSQL `deadlock detected` and an obsolete ready `sources=0;movements=0` watermark when the source began first; the reverse ordering proved the later source waited on lifecycle instead of month. GREEN is 2/2 with no `40P01`, a current `ready|sources=1;movements=1` source-first result, a typed `stale|source_allocation_changed` generation-first result, and exactly one allocation set in each case.

Affected evidence is clean reset, focused database/security 194/194, original lifecycle concurrency 6/6, expanded correction concurrency 8/8, live catalog/role 22/22, zero-error database lint with the same five warnings, zero error-level advisor findings, local-variable production build, and diff checks. No browser/full-matrix or unrelated broad gate was rerun. This is correction evidence, not approval; Track 4 remains blocked for focused independent re-review.
