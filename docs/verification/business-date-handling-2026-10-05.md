# Company business dates and financial audit evidence

Base: `facb0e0b129237eb40b6d67a222743f1747d780e`, verified against remote main on 2026-10-05. Candidate branch: `codex/business-dates-20261005`. This implements the date recommendations approved on 2026-10-05 at 00:22 UTC. No merge, deployment, hosted migration, customer-record write, timezone configuration update, or credential change was performed.

## Audit findings and resulting behavior

| Area | Existing authority | Change |
| --- | --- | --- |
| Company timezone | `organizations.operational_timezone`, already stored with a UTC default | Read through authorized membership and use it throughout dashboard forms, calendar shortcuts, reporting defaults, exports, and setup readiness. Preserve stored configuration. |
| Today | Shared helper previously hardcoded Cambodia; calendar highlighted browser Today | Supply the company timezone and server time to a context around the entire application shell. Advance the server clock with elapsed browser performance time. Refresh open views and compute new form defaults immediately across midnight. A wrong laptop clock cannot replace the authorized date. |
| Effective dates | Editable payment/collection, expense, owner-cash, fee-settlement and ledger dates; existing checked correction workflows | Reuse those workflows, financial locks, authority checks, preview checks, idempotency, reversal/replacement records and old/new date history. Earlier dates remain selectable within existing rules. |
| Date-only display | Financial fields are date strings; `formatDate` interpreted them as UTC instants in the browser timezone | Format date-only strings independently of browser timezone, preserving existing localized labels. Calendar selection validates and round-trips the exact date string. |
| Reports | Receipt, expense and cash projections already filter effective transaction/event dates | Keep these projections. Default the selected reporting month from authorized company time. Add a year-boundary backdated receipt regression showing that entry timestamp does not determine the cash period. |
| Creation/edit evidence | Existing actor fields, timestamp defaults, correction records and activity history | Add automatic storage timestamps, immutable creator/time evidence, and immutable activity events. Keep the existing old/new financial-date history. Show exact record-entry timestamps with timezone separately from transaction dates. |

The helper's Cambodia default remains available for legacy standalone callers. Production dashboard callers receive the authorized organization timezone. An invalid configured timezone fails instead of silently changing configuration. Existing selected form values are not automatically rewritten when the business day changes.

Payment UI copy states: “Use the actual payment date, including earlier dates. This date determines the cash reporting period. Record entry time is saved automatically.” Owner-direct collection uses corresponding collection-date wording. Transaction-register copy explains that its period uses transaction dates and that entry/correction times are saved separately.

## Migration

Schema migration is required: `supabase/migrations/20261005003645_financial_date_audit_integrity.sql`.

It adds two private trigger functions and row triggers on 26 financial record tables plus activity history. Creation time comes from PostgreSQL `statement_timestamp()`. Authenticated creator/editor fields come from `auth.uid()` where those fields exist. Creation evidence cannot be edited. Last-edit fields are automatic, and each existing activity event remains immutable with its recorded actor and old/new values. System operations without an authenticated actor retain their supplied actor fields.

There are no new columns or public RPC signatures, so generated public database types do not require regeneration. The migration contains no data rewrite, timezone update or change to existing RPCs, RLS policies or role assignments. Pre-migration synthetic tenant-payment and ledger rows had identical whole-row hashes before and after applying it.

Immutable creator/audit evidence also prevents a hard-delete cascade from erasing or nulling that evidence. No application user-deletion path was found. Membership deactivation and existing financial reversals remain available. Future administrative purge tooling must explicitly account for audit retention; database owners can still manage triggers through DDL.

## Deposit coordination

The dormant deposit candidate in `task-3/cash-review`, owned by thread `01a10465-f9ff-7606-b3de-7ed607525023`, was not readied, edited, rebased, merged or deployed. Its authorized `businessDate` picker remains compatible with the optional shared picker prop introduced here.

Current main has deposit receipt/refund/retention events, but has no deposit-to-rent application or separate bank-deposit transaction workflow to modify. Those candidate-specific requirements remain an integration dependency: applying an existing deposit must use its application date, preserve the original deposit receipt date, and create no additional bank receipt. A payment's effective date and a later bank-deposit/transfer date must remain separate fields and events. This change creates no bank-deposit workflow or fabricated receipt.

When that candidate resumes, verify its application period, no-new-receipt invariant, original receipt preservation, correction history and organization isolation against this branch. Keep any necessary candidate patch separate. Existing scheduled lease-rent business-date RPC behavior is retained.

## Verification and limits

- Focused JavaScript date/report/auth checks: 8 files, 63 passing tests under `TZ=America/Los_Angeles`, covering Cambodia/UTC midnight, month/year/leap boundaries, company isolation, clock skew, immediate rollover before the refresh timer, backdating and date-only round trips.
- Focused database checks: 8 suites, 195 passing assertions. These cover actual checked correction RPC audit evidence, immutable timestamps/actors/history, real records in a second organization, expense and owner corrections, financial month locks and cash events.
- Aggregate database checks: 134 suites; 129 pass with 4,209 passing assertions. Five suites have identical failure evidence with the new trigger functions removed, restoring unchanged main behavior in the same scratch environment: `demo_seed_contract_test.sql`, `lease_derived_rent_generation_test.sql`, `owner_balance_correction_round_test.sql`, `owner_close_revision_test.sql`, `property_only_lease_creation_test.sql`. Failures concern additional historical demo fixture expectations and scheduled-job metadata absent from the isolated schema-only restoration.
- Final combined Vitest aggregate: all 404 files and 4,049 tests pass, covering both unit and UI tiers with the implementation held steady. Earlier separate aggregate runs also passed.
- Contract checks: 229 of 230 pass, plus the chart fixture contract. The remaining `npm ls fast-glob` assertion cannot validate the scoped override through this checkout's shared `node_modules` junction. Dependencies were not installed or modified to change the shared checkout. The local PDF browser check passes with normal Windows process permissions.
- TypeScript, source lint, changed-file lint, migration discipline and UI-copy checks pass. All 191 existing migrations remain unchanged.

Laptop screenshots in `output/playwright/` render the actual payment form, DatePicker and recent-changes components with synthetic fixtures and write-disabled action stubs. They include backdated selection and the same server instant displayed as 2027-01-01 for Cambodia and 2026-12-31 for UTC. FormData retained the selected `2026-09-29` value. These are component-level browser checks, not authenticated live-workspace acceptance or hosted verification. No production build was run.

Testing used one explicitly labeled, network-isolated PostgreSQL scratch container with synthetic data and the verified main schema. The protected recovery keeper, Docker daemon and existing integration/deposit checkouts were untouched. Storage stayed above 11 GiB free on C:. Only task-owned disposable resources are cleaned up.

## Official design evidence

- [DoorLoop: receiving a lease payment](https://support.doorloop.com/en/articles/6162667-receiving-a-payment-on-a-lease/) distinguishes editable payment date from bank-deposit date.
- [DoorLoop: lease-credit report dates](https://support.doorloop.com/en/articles/6338649-lease-credits-are-not-showing-the-correct-dates-in-the-reports) explains the application date's effect on cash reporting.
- [DoorLoop: transaction creation and editing](https://support.doorloop.com/en/articles/9130738-find-out-who-created-or-edited-a-transaction) shows separate creation/edit actor and timestamp evidence.

These sources do not establish DoorLoop's internal timezone precedence or future-date rejection. Neither behavior is claimed or introduced here.
