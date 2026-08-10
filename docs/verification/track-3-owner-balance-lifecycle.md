# Track 3 owner-balance lifecycle verification

## Decision status

- Implementation status: complete on `codex/ips-operational-readiness` from base `4eeac99ba969f0dfe40c7695a850a9137ee35cb5`.
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

The final local reset applied the baseline and all 11 migrations cleanly.

## Authority contract

The exact source registry is complete:

| Source | Owner allocation | Persisted effect |
| --- | --- | --- |
| `tenant_rent_receipt` | effective roster | `+ips_held_owner_cash` |
| `owner_direct_rent_receipt` | explicit owner | activity only |
| `management_fee_occurrence` | effective roster | `+owner_due_to_ips` |
| `owner_paid_cost` | effective roster | `+owner_due_to_ips` |
| `owner_invoice_payment` | explicit owner | `-owner_due_to_ips` |
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

The literal fixture contains 16 component rows across two properties and two months, all 12 source types, explicit transfers, and one deliberately blocked `116.00` management-fee source with `owner_share_total_not_100`. Central Residence closes the current month at held cash `2125.00`, owner due to IPS `370.00`, IPS due to owner `200.50`, and custody `860.00`, and the next month opens with those exact values. Garden carries only explicitly transferred `500.00` held cash and `102.80` owner due to IPS. The opening semantic manifest hash remains `1f28cceda852baeebe7878edf71ec09375ebb7d2958e572cc047f73b955fc4b0`.

The complete authenticated browser flow was run exactly once against the isolated exact-worktree server. Real local actors started at `/workspace`, entered by visible navigation, and completed opening visibility, supported allocation, canonical contribution, safe distribution/reversal, current and next regeneration, four-component continuity, transfer/remediation visibility, Finance Member denial, and both Operations-role denials. All 11 phases passed with database assertions. Browser changes left the reversed distribution net zero and produced exact current/next held cash `2250.25` and custody `870.00`.

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
