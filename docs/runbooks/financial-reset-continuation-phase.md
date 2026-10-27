# Private reset continuation: rebuild and empty books

Migration `20261024013616` adds the original checked continuation functions; later
migrations extend their review policies. Migration `20261027005615` adds the v4
empty-books option. Applying these migrations does not enroll, open, continue,
bill or reset an organization. The unconditional hosted dispatch integration hold
remains unchanged; synthetic tests and disposable database proof are not evidence
that a customer reset ran.

The phase follows checked known-zero completion in the **same transaction** as the
reset actions and final report checkpoint. Rebuild versions 1–3 validate the
reviewed source and lease roster, invoke checked continuation/rent commands and
verify their persisted write set. Version 4 records an unchanged snapshot and
creates no invoices or contract rows. Both retain the exclusive lifecycle lock,
source hashes, generation checks and deferred phase fences. Checked business
commands may temporarily open the control inside that transaction; the committed
state stays frozen. Other backends see the committed frozen state or wait on the
lifecycle lock.

Keep the phase control constraint deferred while executing successive private phases. If a caller forces that constraint immediate before continuation, the temporary open is rejected because the earlier known-zero fence is already present. This is a fail-closed restriction; no guard is bypassed. Every later control update also schedules the check, so flushing earlier deferred events cannot permit an unchecked reopen.

## Shared execution contract

Call `app_private.prepare_financial_reset_continuation(operation_id, plan_json, review_sha256)`,
then `app_private.apply_financial_reset_continuation(operation_id)`. Neither function
is granted to application or service roles. The scoped path validates its consumed
session authorization in the same execution transaction. The historical native
adapter's raw fixture claims do not satisfy the current known-zero operator check.
`createFreshOwnedResetClone` and `rehearseCheckedReset` therefore reject v4 before
clone creation until consumed-session integration is implemented. Pure semantic
validation and SQL construction remain available, and scoped pgTAP exercises the
database contract; neither supplies an end-to-end native or hosted runner.
Existing command permissions and trigger checks remain active.
Rebuild commands temporarily supply the reserved generation header and restore
the original header and rent contexts; rollback restores them on failure.

The review hash covers the exact PostgreSQL JSONB plan. The semantic review and
the post-known-zero `source_sha256` are separate evidence. Report both hashes;
do not claim that newly generated zero-authority identities were reviewed before
execution. No arbitrary SQL, callback or RPC name is accepted. The current
October cutoff and execution-business-date checks remain mandatory: an execution
after October requires a different supported review, not silently revised dates.

## Version 4 empty-books contract

The semantic review has exactly these keys. Preparation adds the existing
`source_sha256` from the post-known-zero continuation snapshot.

| Key | Required value or evidence |
| --- | --- |
| `version` | `4` |
| `actor_id` | Reviewed existing actor, validated through the applicable execution path |
| `billing_period_start` | `2026-10-01` |
| `issue_date` | `2026-10-01`, retained for binding compatibility; no invoice is issued |
| `execution_business_date` | Actual organization business date in October 2026, rechecked at execution |
| `invoice_date_policy` | `empty-books-no-invoices` |
| `contracts_sha256` | PostgreSQL hash of `financial_reset_preserved_contracts(organization_id)` |
| `leases` | Complete organization lease roster, including archived and terminal leases |

Every lease entry has exactly `lease_id`, `disposition: preserve-unbilled` and
`source_sha256`. Its hash covers `financial_reset_preserved_lease_source`, which
contains the full lease row plus all its term and billing-rule rows ordered by ID.
The whole-contract helper contains the full organization arrays `leases`, `terms`
and `billing_rules`, also ordered by ID. Roster omissions, duplicates or changed
hashes fail closed. An empty roster is valid only when the organization has no
leases and its complete contract hash matches. Billing amounts, renewal choices,
selected term/rule IDs and original-invoice sources are not v4 review fields.

Preserve all lease/term/rule values, history and status, along with properties,
units, people and relationships. Agreed deposit requirements remain preserved;
cash-status normalization still needs the existing exact-row review. The empty
source check refuses an unarchived deposit still marked received, held or partially
returned. V4 does not create a renewal or infer one from an expired contract.

Continuation persists equal `before_images` and `after_images`, records its phase
fence, and creates no rent, fees, invoices or contract rows. Each result lease
retains its reviewed hash with `invoice_id: null`, zero generated rent/fees and
`contract_changed: false`. Known-zero openings remain required. The report phase
still builds and verifies zero owner period authority, checks the full persisted
snapshot and seals the transaction with `checked-reports` evidence.

Both results explicitly carry `empty_books: true`, `billing_paused: true`,
`contracts_unchanged: true`, `billing_complete: false`, `close_ready: false`,
`deferred_lease_count: 0` and the preserved-unbilled roster count. Active report
scopes use `empty-books-billing-paused`; archived properties retain
`archived-known-zero-only`. Ordinary missing-rent blockers remain unchanged. The
private report accepts only matching reviewed missing-rent blockers, never an
unrelated failure or a claim that October billing is complete.

The recovery-backed hosted binding version 1 can describe v4. The separate
no-backup binding version 2 rejects it. Script source bindings include the new
migration, and changing source bytes requires fresh bound evidence. The hosted
transport still rejects mutation dispatch unconditionally pending its separate
integration review; this document provides no execution authority.

The v4 reset remains frozen. Its binding is rejected by normal reopening with
`financial_reset_empty_restart_review_required`. A separately bound recovery
operation can still enter the existing checked recovery/reopening path after
restoring prior authority; it must satisfy all original recovery checks. This
exception does not resume the empty-books state. Recovery candidates must not
delete or repair preserved contracts, since v4 created or changed none.

## Earlier rebuild review contracts

Versions 1–3 remain distinct supported review modes. Version 2 permits an explicit
source-bound `defer-expired-unbilled` decision; version 3 adds reviewed original
October invoice dates and exact archived invoice sources. They may generate
reviewed October billing and must not be selected to implement empty books.

The version-1 plan has exactly these keys:

| Key | Meaning |
| --- | --- |
| `version` | `1` |
| `actor_id` | Reviewed existing super-admin actor |
| `billing_period_start` | Frozen control cutoff, equal to the first day of the current organization business month |
| `issue_date` | Current organization rent business date |
| `source_sha256` | PostgreSQL JSONB SHA-256 of `financial_reset_continuation_snapshot(organization_id)` after known-zero completion |
| `leases` | Complete active and notice-given, unarchived lease roster, including leases requiring no continuation and zero-rent leases |

Each lease object has exactly `lease_id`, `term_id`, `billing_rule_id`, `continue_month_to_month`, `rent_amount`, `management_fee_amount`, `currency`, `recipient_person_id`, `collection_route`, and `due_date`. Current support is USD, compatible with existing checked opening/billing commands. Existing zero-rent contracts are explicit roster entries and create no positive invoice. A zero-rent contractual continuation is not currently supported by the normal generator and is rejected at preparation.

The rebuild path also rejects an active or notice-given unarchived lease whose property is archived. Such a lease must not be silently omitted from the approved billing roster. Archived properties with only archived or terminal leases may receive reviewed zero opening components, while remaining outside ordinary operational-period generation. The rehearsal records their explicit zero authority and unchanged master rows separately from active-property report acceptance. V4 instead reviews every lease unchanged and creates no billing on either active or archived properties.

The unchanged continuation command automatically catches up the current business
month. The execution-date policy rejects a different cutoff month or backdated
issue date; v3 permits only its explicitly reviewed original October dates.
Execution checks the clock again before business writes. A delayed October reset
in November or later is unsupported and fails closed; changing the reviewed
period would be a different reset.

## Rebuild output and recovery evidence

`app_private.financial_reset_continuation_plans` retains immutable plan and result evidence. `before_images` and `after_images` contain full sorted row images for every organization-scoped public/private table, excluding reset journals, control bookkeeping and report revision bookkeeping. The result contains lease/term/rule/invoice IDs, the reserved generation, and before/after hashes. A completed retry returns the same result without invoking the commands again.

Only planned continuation terms/rules, the predecessor active-to-expired status/audit update, the reviewed current month's rent/fee authority, its audit rows, resolved generation exceptions and new completed command intents are allowed. Master data, cash, deposits, historical intents and known-zero opening evidence must remain unchanged. Current normal catch-up can record a temporary missing-term exception before the new term exists; only a final resolved exception linked to the exact resulting invoice is accepted. Missing/extra invoices, amount/recipient/fee mismatches and unexpected persisted side effects abort the entire phase.

Recovery must account for more than financial rows: remove or explicitly retire the exact newly created continuation term/rule pair, restore the predecessor's original status/audit image through reviewed recovery authority, and retain new audit/idempotency evidence as retired history. The before/after images provide those identities; they do not themselves authorize inverse writes. This phase does not claim that post-billing recovery or final reopening has been proved.
