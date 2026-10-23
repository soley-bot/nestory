# Organization financial reset and recovery review plan

Prepared from the generic reset assessment, continuation workflow,
repository migrations and a read-only catalog inspection of the dedicated local
database with the candidate migrations. **Review plan only: no reset executor,
frozen maintenance capability, approved hosted checkpoint or production reset is
provided by this branch.** The branch implements safeguards and checked lease
continuation. It does not enroll a hosted workspace or change customer financial records.

## Bound scope and intended result

An actual operation must privately bind `<project-ref>`, `<organization-id>`,
`<operational-timezone>`, `<financial-start-date>` and approved scope. These are
required placeholders, not executable targets. Capture fresh hosted preflight and
account for every other organization. Never select data by date alone or use
project-wide truncation. Actual IDs, financial amounts, inventory counts and
customer consent must not be committed to this public repository.

For a privately approved complete financial restart, the manifest must explicitly
include current-period transactions and each tenant balance category to be reset.
Establish approved known-zero owner components at the selected boundary; actual
owner contributions are re-entered manually. Preserve property, unit, owner, tenant
and lease identities, relationships, contracts and agreed deposit requirements.
Correct only individually approved continuations through the checked workflow.
No old rent, payment, expense, deposit receipt or owner contribution is automatically
replayed. October/November below are illustrative reporting periods only.

There are two distinct checkpoints: an empty financial baseline with known-zero
openings, then correctly regenerated October rent and fees. The second checkpoint
will have tenant receivables; it must not be described as a zero tenant balance.
An empty baseline cannot pass October owner-close billing completeness.

## Artifacts required before an execution can be approved

1. An immutable operation manifest binds an operation UUID, target organization,
   exact merged main SHA, schema/function/trigger hashes, migration content parity,
   expected old generation, target generation and cutoff. It records every affected
   primary key, canonical before-row hash, disposition, expected after-row/hash or
   deletion, expected counts and monetary totals. Include polymorphic source IDs,
   not only catalog foreign keys. Unknown tables, changed rows or extra references
   abort before mutation. Historical counts in the assessment are comparison clues,
   never accepted execution counts.
2. A private archive format and exporter preserve full original rows, relationships,
   table/column versions, operation ID, original generation and hashes. Financial
   archive rows have no application read/write grants and cannot enter active views.
   Retention and authorized archive access must be explicitly assigned. Do not put
   credentials, capability tokens or raw Auth secrets in an operator manifest.
3. A reviewed one-time executor implements the ordered phases below and a durable
   operation-status record. It must expose no public, authenticated or service-role
   maintenance API. Its only execution path is the serialized protected operator
   lane, bound to the exact approved operation and file hashes. A transaction-local
   private capability must validate operation, organization, generation, phase,
   table, verb and selected row identities. A caller-set boolean GUC is insufficient.
4. A verified recoverable checkpoint covers database, necessary Auth/configuration
   and separately retained Storage bytes. Restore it into an isolated destination
   with jobs and outgoing effects disabled, then prove the checks below. Current
   backup availability, retention, restore destination and acceptable loss window
   have not been established by this task.
5. An operation-specific protected workflow/preflight/postflight permits exactly
   the manifest's intended deletions and new openings. The ordinary release snapshot
   comparison intentionally forbids these changes. Do not weaken that general
   equality check or run an ad hoc hosted SQL session to bypass it.

Production migrations still use the exact merged `main` SHA and protected
`production-database` environment in `.github/workflows/ci.yml`. Approval of fixes
or this document does not authorize a hosted destructive run. Approval must name
the final executor/manifest hashes, checkpoint and restoration scope after rehearsal.

## Freeze, drain and capture

1. Verify application/database compatibility, migration identities and SQL hashes,
   target IDs, timezone, all organizations and the expected source manifest. Stop
   on drift. Keep the old application available for recovery, but do not serve it
   against incompatible new authority.
2. Pause target organization entry points, in-flight import commits, PDF/artifact uploads and
   publication/cleanup dispatch. Inventory database cron, signed HTTP maintenance,
   notification outbox, external retries and any manually scheduled jobs. Preserve
   original schedules and execution identities. Other organizations may continue
   only where the runner demonstrably scopes its work by organization.
3. Commit target organization's frozen control using the approved operator artifact. Unenrolled
   target organization begins frozen at generation 1. An already enrolled organization first
   freezes its existing generation; advance to the manifest's next generation
   while still frozen. Generation cannot decrease, controls cannot be deleted.
   Use READ COMMITTED. The exclusive organization lock waits for covered writers;
   record drain evidence rather than relying solely on workflow concurrency.
4. Verify rent, activation, deferred-cash and maintenance runners skip target organization and
   unsupported external workers cannot publish or register work. Reconcile any
   already attempted operation by its original key and result before continuing.
   A stale page must fail; do not refresh its intent automatically.
5. With freeze committed, capture final source/master/non-target hashes, queued work,
   immutable journal states, financial artifact paths/versions/checksums, and the
   recovery checkpoint. Wait for existing signed download/upload permissions to
   expire or contain their exact paths before asserting Storage containment. Record
   their expiry bounds. A database transaction cannot recall downloaded files.

## Preserved data and evidence

Preserve organizations, Auth users, memberships, roles/permissions, access settings,
branches/teams, people and person roles, properties/units, property ownership history,
leases, parties/occupancies, historical lease terms/billing rules, activation schedules,
rent policies, bank/finance accounts, reconciliation sources, categories and their
role/source/category mappings. Preserve `petty_cash_accounts`, operational task and
recurrence identities, lease documents/photos and audit/activity history. Preserve
committed `import_runs`/`import_rows` referenced by lease provenance and import mappings.
Only individually approved continuations in the private manifest may append contractual terms/rules.

`lease_deposits` are preserved requirements, not a cash source to delete. Keep IDs,
lease, type, amount, currency and contract notes. The manifest must specify each
header's post-reset cash-status/date normalization: no current header may imply an
old receipt or refund still exists. Preserve waived/archived distinctions; do not
invent a new requirement on a historically completed lease. Recorded deposit
balances become zero when old event/custody/application/ledger authority is removed.
Physical cash is unaffected; any deposit still held must be recorded again before
custody reports are reconciled. Agreed deposit amounts do not become zero.

Preserve generic financial idempotency rows as retired tombstones, including keys
and results. Preserve configuration idempotency bindings. Retain category result seals as retired
business-result evidence: their results refer to expense submissions and manual
tenant charges, and must not be replayed or rebound after removal. Preserve private
unit-creation requests. Preserve old deposit journal intents and attempts as
generation-retired evidence. Resolve unconfirmed attempts; the executor needs an
explicit manifest-bound slot disposition before preparing a fresh intent for that
scope. Never unlock an uncertain attempt by deleting its evidence.

Cutover batches/items/reconciliations/transitions and staged import runs/rows retain
historical provenance but cannot execute in the new generation. Their stored
generation now prevents fresh-key replay. A replacement import or cutover requires
a newly reviewed source claim, not changing the generation of an old row. Classify
any financial result IDs in retained metadata as retired archive references.

## Ordered active-book disposition

All rows selected below are scoped by the manifest's target organization IDs. **Archive before
removal** means validate the original row hash, copy the complete row to the private
archive and verify the archive hash before deleting its active counterpart. The
following is the required dependency order, not a ready-to-run SQL script. A final
executor must bind the exact row-level graph and prove it on synthetic fixtures.

| Phase | Exact tables / references | Disposition and dependency |
| --- | --- | --- |
| 1. External evidence | `owner_statement_artifacts`, `tenant_commercial_document_artifacts`; private tenant upload attestations/cleanup claims, paid-cost evidence registrations/cleanup claims | Archive document metadata and object checksums/versions. Retain bytes under approved retention; stop old cleanup/upload work. Remove active artifact metadata only through the explicit archive capability. Preserve generic `documents` used as contract/evidence records; distinguish financial evidence from contract documents in the manifest. |
| 2. Published close graph | `owner_statement_publications`, `owner_close_line_sources`, `owner_close_lines`, `owner_close_corrections`, `owner_close_revisions`, `owner_close_series` | Remove artifacts before publications, publication successors before predecessors, then close sources/lines/corrections. Clear only the manifest-listed series `active_revision_id`/`current_closed_revision_id` pointers; remove revisions in supersession order, then series. Old closed months must not remain the predecessor authority for October. |
| 3. Cash and close consumers | `owner_cash_source_consumptions`, `deposit_rent_owner_bridges`, private `deferred_owner_cash`, `fee_payment_date_corrections` | Remove consumers/bridges before their movements, allocation sets, deposit applications and invoice lines. Deferred rows must be explicitly retired and removed from the executable queue; merely skipping frozen rows leaves a reopening hazard. |
| 4. Deposit settlement graph | private `deposit_rent_application_attestations`, `deposit_rent_custody_attestations`; `deposit_rent_allocations`, `deposit_rent_applications`, `deposit_rent_custody_confirmations` | Remove application attestations first; remove allocations and owner bridges before applications, custody attestations before confirmations. Reverse-linked descendants precede parents. Deposit events and invoice/line parents stay until dependants are removed. Retain journal intent evidence separately. |
| 5. Expense graph | `expense_legacy_replacements`, `expense_transaction_lines`, `expense_transaction_scopes`, `expense_customer_adjustments`, `expense_submissions`, `expense_transactions`, `ips_expense_responsibilities` | Remove legacy links/transaction children/customer adjustments, then adjustment descendants and submissions; remove transaction replacement chains after children. Remove responsibilities before tenant/owner invoice lines and finance expense items. Preserve task IDs; retire old task cost submission eligibility and normalize only approved cash/projection fields, with before/after hashes. Old task costs must not be silently resubmitted after reopening. |
| 6. Payment allocation graph | `tenant_invoice_payment_allocations`, `owner_collection_confirmation_allocations`, `owner_payment_allocations`, `owner_charge_cash_allocations`, `finance_receipt_allocations`, `finance_payment_allocations` | Archive and remove settlement allocations, newest reversal descendants first. `expense_submissions` contains approved/reversal payment/allocation references and must already be removed by phase 5. Keep the referenced payment and income/expense headers until subsequent phases. |
| 7. Settlement headers and owner movements | `tenant_invoice_payments`, `owner_collection_confirmations`, `owner_payments`, `finance_receipts`, `finance_payments`, `owner_component_movements`, `owner_event_owner_allocations`, `owner_event_allocation_sets`, `owner_component_transfer_lines`, `owner_component_transfer_instructions`, `owner_cash_events`, `property_withdrawals` | Remove allocation dependants first. Cash consumptions and close-line sources must already be absent. Remove movements before owner allocations, allocations before allocation sets, transfer lines before instructions. Retire polymorphic source references with their source event; do not infer completeness from foreign keys alone. Ledger parents remain until phase 10. |
| 8. Invoice correction cycle and billing | `tenant_credit_occurrences`, `historical_rent_settlement_reapplications`, `management_fee_occurrences`, `owner_invoice_lines`, `owner_invoices`, `tenant_invoice_rent_segments`, `tenant_invoice_lines`, `finance_income_items`, `tenant_invoice_corrections`, `tenant_invoices`, `rent_generation_exceptions` | Remove credit/reapplication/fee occurrences and owner lines/headers after cash consumers. Archive then clear only listed nullable `tenant_invoice_corrections.target_invoice_line_id` edges to break the correction/line cycle. Remove rent segments and tenant lines, then income items, corrections and invoice headers, respecting supersession/reversal chains. Exception `resolved_invoice_id` references must be cleared by removing/retiring old exception rows before invoices. Rebuild current billing exceptions only from new generation attempts. |
| 9. Old opening/period authority | `owner_balance_period_components`, `owner_balance_periods`, `owner_opening_balance_entries`, `owner_opening_balance_requests`, `financial_month_locks` | Remove period children then periods, including blocked August/September authority. Close sources and cash consumptions must be absent. Break only manifest-listed request `correction_of_entry_id` references, remove entry reversal descendants then entries, followed by request resubmission chains. Preserve original approval/evidence in archive. Remove old month locks through approved capability; they must not block new authority. |
| 10. Remaining projections/cash | `lease_deposit_events`, `petty_cash_entries`, `petty_cash_periods`, `finance_expense_items`, `ledger_entries` | Remove deposit events only after applications/attestations, normalize preserved deposit headers, remove petty entries before periods (old opening/advance amounts included), remove remaining expense items after responsibilities/submissions/allocations, then ledger reversal descendants and ledger entries. Confirm every referenced ledger parent is now unreferenced. Views such as account/tenant balances are recalculated, not deleted. |
| 11. New authority | New approved `owner_opening_balance_requests`/`owner_opening_balance_entries`; required new October `petty_cash_periods` | Insert manifest-backed known-zero openings, with real reviewer identity and reset evidence, and zero petty opening/advance amounts. No fabricated rent/payment/contribution. Commit while frozen only after all expected diffs and constraints pass. |

The expense/submission graph precedes payment allocations because of explicit
approved/reversal allocation references. The executor must sort the complete
row-level graph, including the nullable cycles called out
above, and publish that exact order in its reviewed artifact. Self-reference chains
must be removed in proven descendant order or a tested whole-target statement;
do not assume `ON DELETE CASCADE` or disable constraints. The local catalog contains
nondeferrable restrictive foreign keys, so `SET CONSTRAINTS ALL DEFERRED` alone is
not a deletion strategy.

## Narrow guard integration needed by the executor

There is no existing frozen operator bypass. Ordinary checked APIs reject frozen
work; private scheduler capability also refuses a frozen organization. Temporarily
reopening to run a wipe would admit other writers and is not an acceptable substitute.

The reviewed capability must be consulted at these existing enforcement points for
only the named reset operations, while retaining normal behavior for every other
caller/row: lifecycle/generation row guards; `guard_owner_balance_append_only`;
`guard_owner_balance_period_write` and lifecycle checks; `guard_owner_close_write`;
`guard_owner_statement_write`; owner opening request/entry immutability, approved
entry and cash-dependency guards; deposit-rent immutability, linked-event,
settlement/correction/bridge validation and journal slot guards; tenant invoice
correction/rent-segment, historical-evidence and settlement-derived-field guards;
expense child-status/evidence/legacy-replacement guards; ledger projection/period
guards; task cost guards and IPS cutover/import provenance guards for any explicitly
changed reference. Review their AFTER/deferred validation and projection triggers
as well, so deletion does not regenerate retired authority or fail at commit.

Do not disable triggers, set `session_replication_role=replica`, grant a general
service-role bypass, edit historical migrations or weaken RLS to execute the reset.
Synthetic fixture setup sometimes uses replica mode; that is not evidence that a
reset through production guards works. Keep audit and source-revision advancement
active. Failure injection must prove the maintenance capability cannot escape its
transaction or operate on another organization, row, phase or operation ID.

## Prove the frozen zero checkpoint

For every manifest-listed property/owner/currency scope effective 1 October,
establish all four components as **known zero**:
`ips_held_owner_cash`, `owner_due_to_ips`, `ips_due_to_owner`, and
`security_deposit_custody`. Use approved zero entries and evidence; missing entries
are unknown, not zero. Validate the effective ownership roster, including archived
properties or historical scopes that still appear in financial readers. Do not
limit scope to an initial partial inventory of nonarchived properties.

Assert zero active tenant invoice debt, credits/prepayments, deposit custody,
receipt/payment allocations and ledger balances; zero owner movements/withdrawals/
held cash and old closing authority; zero executable deferred cash; no current
historical publication or artifact. Check views and public authority readers as
ordinary authorized users, not only base table sums. Preserve all non-target
fingerprints exactly. For target organization master rows, require either exact equality or the
manifest's explicitly approved deposit cash-status/task financial-field change;
compare full before/after rows so no other field change is hidden. Verify contracts
and agreed deposit amounts unchanged.
Use source-revision context plus authoritative fingerprints for reports; failure
or incomplete billing is an explicit state, not a zero-filled success.

Record the zero checkpoint and commit while still frozen. This is the evidence
boundary before October invoices or manual cash entry. A successful zero checkpoint
does not authorize reopening by itself.

## Restore contractual continuity and October billing

Use exact lease, predecessor term and rule identities from the private approved
manifest. The [continuation review guidance](pilot-october-2026-lease-continuations.md)
describes required source checks; it deliberately contains no customer roster.

The checked `continue_lease_month_to_month` command already exists in this candidate,
but its normal public path rejects frozen work. The future executor needs a reviewed
phase-specific integration that invokes its existing expected-source, permission,
audit and complete-rule-copy checks while containing every other writer. That
integration is not implemented here. Keep contractual September starts; the October
cutoff prevents generating pre-October financial activity. Preserve all collection,
recipient, due-day and fee-charge flags; no invented fixed end date.

After the zero checkpoint, apply each continuation once, then generate every
eligible October invoice once with exact term/rule/recipient lineage. Continuation
may itself trigger current billing, so inspect its result before any explicit
generation call. Derive expected rent and fees from the private manifest and existing
fee-charge flags. Verify the complete target lease roster, including leases that
did not require continuation. Require exactly one issued rent
invoice for each expected positive-rent lease, with valid rent lines; overlapping
historical terms and zero-rent transitions need the completeness checks.

Verify source fingerprints, owner-close readiness blockers, Unit P&L and owner
statements. Do not publish a completed close until all normal billing/settlement/
opening rules pass. Do not advance generation again after building new authority,
which would retire the newly created records and intents.

Reopen only through the approved final operator phase after the executor capability
has expired, ordinary guards are verified, retired jobs/slots are reconciled and
new clients capture the target generation. Resume scoped schedules with October
duplicates checked. The user then manually records actual owner contributions and
other authorized October cash/expenses/deposits; reconcile each once. Check November
rollforward and next-month billing without changing the original contractual facts.

## Failure, rollback and restore proof

- Before reset commit: any row/hash/count/constraint mismatch rolls back the entire
  archive/removal/opening transaction. The separately committed freeze remains.
  Verify original active rows and archive operation status before another attempt.
- Unknown commit outcome: inspect the original operation UUID, commit/status record,
  archive hashes and target generation. Never submit a new operation ID or blindly
  retry deletion because a client timed out.
- After reset commit: contain target organization again and use the approved restoration artifact.
  Do not delete controls, decrease generation, repair migration history or replay
  archived transactions through ordinary APIs as a substitute for restoration.
  Restoration must reconcile retained tombstones, document metadata and bytes with
  the selected database checkpoint and prove compatible application behavior.
- A whole-project provider restore affects the other organizations and post-checkpoint
  changes. It requires explicit approval for that broader scope and accepted loss
  window. No tenant-only restoration command has been proved by this task. A database
  backup alone does not restore Storage bytes or undo emails/downloads/external cash.

Enrollment already retires old generation-zero source IDs. Therefore neither an
aborted reset nor a restored frozen checkpoint may simply be reopened to resume
the old books. A recovery artifact must reserve a fresh generation above every
generation exposed to clients, restore the reviewed active authority set, and
rebind only its generation-stamped invoice/payment/close/publication/artifact rows
under the same narrow, hash-bound recovery capability. Preserve original generation
values in archive. Old request keys, import/cutover intents, upload/cleanup intents
and journal attempts remain retired; they must not be rebound as new work. Prove
source and artifact readers agree before opening. This recovery integration is
another required executor feature, not an existing public command or permission
to rewrite evidence manually.

The isolated restore rehearsal must reproduce every archived financial row/hash,
master and non-target fingerprints, foreign-key integrity, approved-opening status,
public authority results, Auth/role access and sampled plus manifest-complete artifact
byte checksums. Jobs/outbound effects stay disabled until inspected. Inject failure
after each phase and at commit acknowledgment; prove freeze persists, capability
expires, stale/foreign intents fail, and duplicate execution returns the original
status without repeating effects. Prove new October entry and November rollforward
on synthetic data after the zero checkpoint.

## Readiness conclusion

An exact-hash, organization-scoped archive-and-removal executor is feasible with this
schema and avoids changing every financial reader to filter history by generation.
It requires new reviewed code for archive/status records, the narrowly bound guard
capability, row-graph ordering/cycle handling, zero-opening evidence and frozen billing
integration. None is already supplied by a control toggle. The existing demo planner
and passing safeguard tests do not implement or validate that executor.

Remaining execution prerequisites are concrete: final live row/dependency manifest,
implemented and failure-tested executor, verified restore/checkpoint including
Storage, operation-specific protected workflow, and separate approval of the exact
production operation. Keep target organization unenrolled and unchanged until those are complete.
See [the reset assessment](pilot-october-2026-finance-reset-assessment.md),
[lifecycle contract](financial-write-lifecycle-controls.md), and
[recovery procedure](ips-recovery-and-rollback.md) for their evidence boundaries.


## Local inventory and database-clone preparation now implemented

Run `node scripts/pilot-finance-reset-manifest.mjs` with no arguments. The adapter
only accepts the dedicated Windows temporary project
`nestory-pilot-reset-db-20261022`, project ID `nestory-pilot-reset-20261022`, its
pinned Docker container, and the committed synthetic organization. It has no hosted
URL, alternate organization, credentials, or execution flag. It verifies the fixed
base commit is an ancestor of the candidate HEAD, then binds candidate HEAD, exact
migration SQL/installed statement hashes, all eight adapter/helper hashes,
fixture-loader hashes, container/image, catalog, schema and global census. The
helper binding covers the census, Docker endpoint checks and SQL statement parity
reader as well as the two adapters. A commit or bound source change requires a
fresh capture. Scheduled launching must already be off locally.

The manifest enumerates every public/private table, including empty tables; records
ordered primary keys and original row hashes; checks outgoing and incoming
cross-organization foreign keys and all registered incoming static/polymorphic
references; and explicitly classifies unconstrained UUID,
polymorphic, JSON and Storage references. Storage resolution includes its expected
bucket, object identity/path and metadata version. It records bytes as unverified.
Unknown tables, UUID columns, JSON columns, source kinds, ambiguous targets and
unresolved live references fail acceptance. Historical owner-close period-component
IDs are explicitly marked snapshot evidence because ordinary period recomputation
rebuilds those components; they are never represented as live resolved parents.
The resulting file is a preparation inventory with `executionSupported: false`.

The registry classifies `timeline_events` alongside `tasks` and `lease_deposits` as
`normalize-reviewed`. Preserve timeline event identity and audit history, but the
executor must review exact `ledger_entry_id`, `cost_amount`, and `cost_currency`
before/after values so removed cash does not remain displayed as current financial
activity. It must also retire task cost submission eligibility and clear only the
approved financial projection fields. This normalization is not implemented by the
inventory builder and must not erase lease deposit requirements or contract terms.

Outputs are written only under the dedicated temporary project's
`pilot-finance-reset-manifests` directory, with a generated operation UUID and
self-digest. Do not commit captures or raw financial records. Tests run with
`node --test scripts/pilot-finance-reset.node-test.mjs`.

The companion `pilot-finance-reset-recovery.mjs` consumes an accepted, recent
manifest and the exact dedicated local project directory. It verifies the binding,
dumps the local source, restores into a newly generated database with a recorded
OID/owner/marker, compares schema/ACL/constraint/sequence and table hashes, verifies
the source remained unchanged, rechecks candidate HEAD and bound tool/migration
files at completion, and removes only its owned clone/dump. It excludes
cron/net infrastructure from cloning to prevent side effects. Its result explicitly
separates database clone proof from physical Storage recovery, Auth service routing,
hosted PITR and actual reset recovery; all of the latter remain unproved.

The offline `pilot-finance-reset-plan.mjs` reads this inventory and produces a
row-level child-before-parent removal plan. It captures foreign-key delete actions
and nullable columns, rejects unreviewed cascades or SET NULL changes to retained
records, and requires exact row/hash-bound declarations for nullable cycle breaks.
It also rejects missing cross-organization logical-reference census coverage.
For example, retained documents can reference ledger entries with ON DELETE SET
NULL; preserving the document requires an explicit reviewed link normalization
and archive-reference plan before deleting that ledger entry.

Run `npm run db:pilot-finance-reset-plan -- --manifest <accepted-local-manifest>`.
Optional review declarations must be ignored local JSON bound to that exact
manifest. Outputs stay under ignored `.codex-artifacts/pilot-finance-reset-plan`.
The planner never connects to a database or emits executable removal SQL. A
declared after-image hash is a review target, not proof of an archived or restored
row. It continues to report `executionSupported: false` even if dependencies are
fully resolved.

The concrete next executor work remains private operation/archive tables; exact
before/after row dispositions; graph/cycle ordering; narrow frozen capability;
atomic archive/removal/zero authority; generation-aware restoration; frozen lease
continuation/billing; Storage byte coverage; and failure/unknown-commit tests.
Neither the manifest nor a successful clone is authorization to enroll target organization,
remove its records, reopen the organization or release production migrations.


Local evidence on 2026-10-23: all 42 inventory, recovery and dependency-planner
guard tests passed. The updated synthetic inventory classified 153 tables and
1,276 scoped rows with zero unresolved inventory issues, including 372 incoming
logical-reference census descriptors. Its dependency plan intentionally remained
blocked on missing normalization after-images, retirement semantics, retained
references, cycles and rows blocked behind those cycles. Actual removal and recovery were
not executed.

Keep current operation IDs, digests, candidate HEAD and matching clone results in
the ignored local handoff and generated reports. After a commit or bound source
change, capture and rehearse again; an earlier successful clone does not prove a
new candidate or a reset operation.
