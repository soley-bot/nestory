# Company business dates and financial audit evidence

Base: `facb0e0b129237eb40b6d67a222743f1747d780e`, verified against remote main on 2026-10-05. Candidate branch: `codex/business-dates-20261005`. This implements the date recommendations approved on 2026-10-05 at 00:22 UTC. No merge, deployment, hosted migration, customer-record write, timezone configuration update, or credential change was performed.

## Audit findings and resulting behavior

| Area | Existing authority | Change |
| --- | --- | --- |
| Company timezone | `organizations.operational_timezone`, already stored with a UTC default | Read through authorized membership and use it throughout dashboard forms, calendar shortcuts, reporting defaults, exports, and setup readiness. Preserve stored configuration. |
| Today | Shared helper previously hardcoded Cambodia; calendar highlighted browser Today | Supply the company timezone and server time to a context around the entire application shell. Advance the server clock with elapsed browser performance time and re-anchor it when fresh server time arrives for the same company. Refresh open views and compute new form defaults immediately across midnight. A wrong laptop clock cannot replace the authorized date. |
| Effective dates | Editable payment/collection, expense, owner-cash, fee-settlement and ledger dates; existing checked correction workflows | Reuse those workflows, financial locks, authority checks, preview checks, idempotency, reversal/replacement records and old/new date history. Earlier dates remain selectable within existing rules. |
| Date-only display | Financial fields are date strings; `formatDate` interpreted them as UTC instants in the browser timezone | Format date-only strings independently of browser timezone, preserving existing localized labels. Calendar selection validates and round-trips the exact date string. |
| Reports | Receipt, expense and cash projections already filter effective transaction/event dates | Keep these projections. Default reporting and account-activity periods from authorized company time. Add a year-boundary backdated receipt regression showing that entry timestamp does not determine the cash period. |
| Creation/edit evidence | Existing actor fields, timestamp defaults, correction records and activity history | Add automatic storage timestamps, immutable creator/time evidence, and immutable financial activity events. Keep the existing old/new financial-date history. Show exact record-entry timestamps with timezone separately from transaction dates. |

The helper's Cambodia default remains available for legacy standalone callers. Production dashboard callers receive the authorized organization timezone. An invalid configured timezone fails instead of silently changing configuration. Existing selected form values are not automatically rewritten when the business day changes.

Payment UI copy states: “Use the actual payment date, including earlier dates. This date determines the cash reporting period. Record entry time is saved automatically.” Owner-direct collection uses corresponding collection-date wording. Transaction-register copy explains that its period uses transaction dates and that entry/correction times are saved separately.

## Migration

Schema migration is required: `supabase/migrations/20261005003645_financial_date_audit_integrity.sql`.

It adds two private invoker trigger functions and row triggers on 26 financial record tables plus activity history. Creation time comes from PostgreSQL `statement_timestamp()`. Authenticated creator/editor fields come from `auth.uid()` where those fields exist. Creation evidence cannot be edited. Last-edit fields are automatic. Financial activity events retain their recorded actor, timestamp and old/new values; ordinary callers cannot update or delete them. System operations without an authenticated actor retain their supplied actor fields.

The corrected migration adds a nullable `audit_actors` JSON snapshot to each of those financial tables and a nullable `recorded_actor_id` UUID to activity history. These fields have no actor foreign key. Generated public types were regenerated from the isolated migrated schema, producing exactly 81 field additions; canonical-schema regeneration matches the candidate file. There are no new public RPC signatures, RLS policies or role assignments. The migration contains no backfill, row update or timezone update. All preexisting values across 28 synthetic tables retained identical hashes, excluding only the new nullable columns.

Existing actor `SET NULL` and organization activity cascades remain available. Actor detachment is accepted only during a nested trigger operation when the referenced user has actually disappeared and the remaining financial/audit fields are unchanged. Actor IDs remain in the immutable snapshots, and detachment preserves financial timestamps. Financial audit deletion is accepted during an actual organization cascade when its parent organization has disappeared. Existing independent deletion constraints still apply. Nonfinancial activity keeps its existing mutation/deletion semantics. This introduces no general activity-retention policy or application bypass.

The lease-term, history and relationship proof cleanups enable their existing transaction-local `session_replication_role` override before deleting their exact synthetic organization's activity. History and relationship cleanup reuse the lease-term harness's chart-dependent deletion order and no longer toggle the financial reconciliation trigger at table level. Ordinary authenticated callers cannot set this privileged parameter. The SQL regression proves normal financial audit deletion is rejected while privileged cleanup removes only its exact fixture.

Document lifecycle cleanup uses the same transaction-local audit override and chart-dependent deletion order for its synthetic organizations. Cleanup errors propagate with the original proof failure, and all fixture states still receive cleanup. The owner-evidence proof asserts zero residual rows across 22 scopes including storage, then checks that repeated cleanup preserves another organization's complete financial, document and audit fixture. All four actual document lifecycle tests pass twice against canonical main plus the candidate, with independent zero-residual checks after each run.

Adding columns and triggers takes locks on the affected tables. Release still requires review, exact-head CI and the protected migration preflight/postflight workflow. No release action is authorized by this handoff.

## Deposit coordination

The dormant deposit candidate in `task-3/cash-review`, owned by thread `01a10465-f9ff-7606-b3de-7ed607525023`, was not readied, edited, rebased, merged or deployed. Its authorized `businessDate` picker remains compatible with the optional shared picker prop introduced here.

Current main has deposit receipt/refund/retention events, but has no deposit-to-rent application or separate bank-deposit transaction workflow to modify. Those candidate-specific requirements remain an integration dependency: applying an existing deposit must use its application date, preserve the original deposit receipt date, and create no additional bank receipt. A payment's effective date and a later bank-deposit/transfer date must remain separate fields and events. This change creates no bank-deposit workflow or fabricated receipt.

When that candidate resumes, verify its application period, no-new-receipt invariant, original receipt preservation, correction history and organization isolation against this branch. Keep any necessary candidate patch separate. Existing scheduled lease-rent business-date RPC behavior is retained.

## Verification and limits

- Focused JavaScript checks: 13 files, 84 passing tests under `TZ=America/Los_Angeles`, including the independent clock refresh and actual account-route regressions, selected-form preservation, Cambodia/UTC boundaries, backdating, date-only round trips, authorization and cleanup contracts.
- Focused database checks: 8 suites, 211 passing assertions. These cover actual correction RPC audit evidence, financial actor deletion, organization audit cascades, nonfinancial activity behavior, privileged scoped cleanup, organization isolation, corrections, month locks and cash events.
- Combined Vitest aggregate: all 406 files and 4,054 tests pass.
- Canonical main replay: all 191 unchanged migration files apply in order with LF normalization in the isolated database. Test bootstrap restores application-object ownership to `postgres`, matching main's pinned function-owner checks, while using the image administrator for existing storage policies. No application permissions are changed.
- Aggregate database checks: 134 suites; 131 pass with 4,227 passing assertions. Remaining suites are `demo_seed_contract_test.sql`, `owner_balance_correction_round_test.sql` and `owner_close_revision_test.sql`. Their exact failure signatures reproduce with the candidate functions, triggers and columns removed from the same canonical synthetic environment. Additional historical fixtures remain incomplete. This is a subset base control, not a full base CI run or proof that main CI is broken. The earlier scheduler and property-lease restoration failures are resolved.
- The required lease-term authority concurrency proof passes, including cleanup. History and relationship proof cleanup completes, but their unrelated authorization-lock expectation and import-identity fixture failures reproduce with the candidate removed. These remain limits to claiming a clean full concurrency/CI run.
- A fresh `npm ci --offline --no-audit --no-fund` installs all 922 packages directly in this isolated checkout with normal lifecycle scripts. Package and lockfile bytes remain unchanged. All 230 contract checks and `npm ls fast-glob` pass with the existing scoped override and legitimate local file-package links. Final contract and default Turbopack build logs accompany the handoff; no assertions or build configuration were weakened.
- TypeScript, source lint, changed-file lint, migration discipline and UI-copy checks pass. All 191 existing migrations remain unchanged; only the unpublished candidate migration was corrected.

Laptop screenshots in `output/playwright/` render the actual payment form, DatePicker and recent-changes components with synthetic fixtures and write-disabled action stubs. They include backdated selection and the same server instant displayed as 2027-01-01 for Cambodia and 2026-12-31 for UTC. FormData retained the selected `2026-09-29` value. These are component-level browser checks, not authenticated live-workspace acceptance or hosted verification. The clean production build uses inert loopback backend URLs and synthetic build placeholders; its exact-commit result is supplied in the final evidence package.

Testing used explicitly labelled, network-isolated PostgreSQL scratch containers sequentially with synthetic data, cached images, a 768 MiB memory cap and RAM-backed database storage. Final evidence uses canonical main migration SQL plus the candidate. The protected recovery keeper, Docker daemon and existing integration/deposit checkouts were untouched. Disk guards stop only this task's install or build process below 8 GiB free; measured minimums accompany the final evidence. Only task-owned disposable resources are cleaned up.

## Official design evidence

- [DoorLoop: receiving a lease payment](https://support.doorloop.com/en/articles/6162667-receiving-a-payment-on-a-lease/) distinguishes editable payment date from bank-deposit date.
- [DoorLoop: lease-credit report dates](https://support.doorloop.com/en/articles/6338649-lease-credits-are-not-showing-the-correct-dates-in-the-reports) explains the application date's effect on cash reporting.
- [DoorLoop: transaction creation and editing](https://support.doorloop.com/en/articles/9130738-find-out-who-created-or-edited-a-transaction) shows separate creation/edit actor and timestamp evidence.

These sources do not establish DoorLoop's internal timezone precedence or future-date rejection. Neither behavior is claimed or introduced here.
