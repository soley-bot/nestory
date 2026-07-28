# Plan 12 — Backfill, IPS Pilot, and Production Cutover

> **Legacy broad design source — not current Plan 12.** The ratified sequence
> split this analysis into **sequence 20, migration manifest**, **sequence 21,
> resumable backfill**, **sequence 22, pilot/cutover**, and **sequence 23,
> compatibility retirement**. Use `97-ratified-final-sequence.md`; do not paste
> this file directly into Codex.

**Mode:** Standard  
**Effort:** Extra High  
**Reason:** Historical financial records are ambiguous and the cutover changes the reporting authority used for owner accountability; migration must be rehearsed, reversible, and explicitly approved.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. This is the final plan in the sequence and must be rewritten against the then-current merged `main` before implementation.

Begin only after Plans 01-11 are merged, their migrations are applied in an isolated preview environment, and one production-shaped local fixture passes the complete Owner Close workflow.

Current historical data may include:

- rent represented only by manual or seeded `ledger_entries`;
- income obligations and receipts with or without ledger/journal projections;
- expenses with payment allocations, obligation-level ledger rows, or both;
- direct maintenance ledger costs;
- posted petty-cash entries;
- deposit income rows and/or deposit events;
- manual management-fee and owner-payout compatibility rows;
- ownership records that are incomplete, overlapping, archived, or changed later;
- live Owner Statement outputs with no immutable published-version history.

No automatic backfill may guess financial meaning from similar descriptions, dates, or amounts.

## Objective

Inventory and classify historical financial data, backfill canonical identities and required opening state without double counting, migrate one controlled IPS pilot, switch supported financial reporting to the canonical event/close/statement model, verify production behavior, and retain a tested rollback path that does not lose newly entered data.

## Preconditions

Do not start migration work until all are true:

1. Plan 00 architecture and all required IPS business rules are approved.
2. `property_cash_events_v1` and parity diagnostics cover every supported source type.
3. New receipt, payment, maintenance, petty-cash, rent, deposit, fee, and owner-distribution writes are atomic and pass authorization/lock tests.
4. Property-period close and immutable statement publication pass end to end.
5. Generated database types match the merged schema.
6. Full application and pgTAP suites pass from a clean reset.
7. Production backup, restore, deployment, and rollback procedures are documented and rehearsed in an isolated environment.
8. The exact IPS pilot portfolio, opening period, currency, and reviewers are selected.
9. Production execution has explicit user authorization.

## Required changes

### 1. Add migration-run and resolution records

Create organization-scoped migration control records, provisionally:

#### `finance_migration_runs`

- organization, source baseline, target contract version, environment, and run mode;
- selected properties and date range;
- status: planned, analyzed, blocked, approved, applying, verified, failed, rolled back, or completed;
- input/source manifest hash;
- counts and exact totals before/after by source family and economic class;
- started/approved/applied/verified actors and timestamps;
- artifact/checksum references;
- failure and rollback metadata.

#### `finance_migration_resolutions`

- run, organization, property, period, and legacy source identity;
- diagnostic issue code;
- proposed and approved resolution class;
- target canonical source identity when created/linked;
- amount/date/currency classification snapshot;
- operator reason, reviewer, and evidence link;
- immutable approval history.

Resolution classes must include at least:

- link to an existing canonical source;
- convert to an explicit legacy adjustment event;
- convert to a supported opening balance;
- preserve as a frozen legacy source with known classification;
- mark duplicate and neutralize through an approved reversal/correction;
- exclude because it is non-financial or outside property accounting, with evidence;
- block as unresolved.

A migration run cannot be approved while a material unresolved row remains in its selected pilot scope.

### 2. Build dry-run analysis first

Create an engineering-only command, for example `npm run finance:migrate -- --dry-run`, that:

- requires explicit environment, organization, property/date scope, and target contract version;
- verifies the database/project identity before reading;
- reads without mutation in dry-run mode;
- reuses Plan 01 diagnostics and produces a complete source manifest;
- proposes only deterministic links using stable IDs and existing reciprocal references;
- never auto-matches solely by amount/date/text similarity;
- emits JSON, CSV, and Markdown artifacts under an ignored, timestamped directory;
- reports source counts and exact totals for obligations, settlements, ledger, journals, deposits, maintenance, petty cash, fees, owner events, and ownership;
- shows projected post-migration canonical, owner-balance, and statement totals;
- exits non-zero for unresolved Critical issues;
- records no secrets, signed Storage URLs, or unnecessary personal data.

Dry-run output must be independently reviewable by an IPS finance representative before apply mode.

### 3. Classify historical sources without rewriting originals

#### Income and receipts

- Link receipt allocations to their existing projections where stable identity exists.
- For manual rent ledger rows with no obligation/receipt source, require operator classification.
- Where documentary evidence proves historical cash but no obligation exists, create an approved legacy adjustment or imported receipt/obligation pair according to the ratified migration policy.
- Never create both a receipt allocation and a legacy event for the same cash.

#### Expenses

- Link payment allocations to existing ledger/journal projections where identity is reliable.
- Classify direct maintenance and petty-cash ledger rows through their exact task/entry links.
- Detect possible duplicate bill/payment and direct ledger effects; require operator resolution.
- Preserve unpaid obligations separately from cash expenses.

#### Deposits

- Map compatibility deposit-income rows to deposit events only with explicit evidence and stable relationship.
- Create approved opening deposit custody balances when historical event detail is unavailable but the held liability is verified.
- Do not classify deposits as operating income.

#### Management fees

- Link supported manual fee rows to approved historical assessment imports when the basis is verifiable.
- Otherwise preserve them as reviewed legacy fee events or block the affected period.
- Do not retroactively invent a percentage basis without source evidence.

#### Owner balances and payouts

- Import approved opening owner balances at the selected cutover date.
- Map verified owner contributions and payouts to owner cash events.
- Generic `owner_payout` expense rows must either map to a distribution or remain blocked; they cannot remain operating expenses.
- Reserve opening state must be separately verified where applicable.

#### Ownership

- Validate effective ownership for every migrated financial source date.
- Resolve overlap, missing share, or non-100% totals through explicit owner-record corrections with evidence.
- Do not silently assign all historical activity to the current primary owner.

### 4. Backfill links and canonical controls idempotently

Apply mode uses checked database functions and one migration-run identity. It must:

- verify the dry-run source manifest/hash is unchanged;
- reject a stale approved plan;
- process bounded, resumable batches;
- create only approved links, imported opening events, adjustments, projections, and occurrence records;
- retain original source rows and attach migration identity;
- use stable idempotency keys so retrying a completed batch creates no duplicate;
- write activity/audit records for every created or linked target;
- update migration counts/totals after each batch;
- stop on unexpected row state or amount variance;
- support safe resume after process interruption;
- never use a destructive database reset in preview or production.

Do not mark a source resolved until post-write parity proves the expected canonical event and projection.

### 5. Create a cutover control, not a permanent dual truth

Add a narrow organization/property finance cutover state, either in the migration-run model or a dedicated configuration record, containing:

- canonical reporting version;
- selected cutover date/period;
- shadow, pilot, or canonical mode;
- activated/rolled-back actor and timestamp;
- approved migration run and verification artifact.

Behavior:

#### Shadow

- New canonical writes operate normally.
- Existing user-facing reports remain unchanged.
- Shadow comparisons run and discrepancies block promotion.

#### Pilot

- Selected pilot properties use canonical Owner Close and immutable statements.
- Legacy financial screens remain available as read-only comparison where necessary.
- Every published statement receives dual review.
- Non-pilot properties retain existing behavior without cross-contamination.

#### Canonical

- Property financial summaries, cash-basis Income & Expense, Unit/Property Performance cash facts, Owner Close, and Owner Statement use the canonical contract/snapshots.
- New generic manual ledger writes are disabled or replaced by the explicit adjustment workflow.
- Source-linked ledger projections are read-only.
- The live Owner Statement calculation cannot be published or presented as official.
- Accounting journals remain hidden derived controls.

Cutover must be organization/property scoped and server-enforced; it cannot depend only on client-side flags.

### 6. Define rollback precisely

Rollback is not deletion of migrated records. It must:

- stop new canonical publication for the affected scope;
- return user-facing reads to the prior compatible mode only when doing so will not omit new canonical-only events;
- preserve every canonical event, statement version, migration record, and source link;
- prevent both old and new write paths from being active simultaneously;
- document how canonical-only events entered after cutover remain visible/exportable;
- record rollback reason, actor, time, and affected properties/periods;
- require a new dry run and approval before reactivation.

Once a property has published an official immutable statement from canonical-only activity, rollback to a mutable legacy reporting authority may be unsafe. In that case the stop condition is to freeze publishing and repair forward rather than pretend the old system is authoritative.

### 7. Run a controlled IPS pilot

Recommended pilot scope:

- one currency, USD;
- a small set of representative properties rather than the entire portfolio;
- monthly leases using the approved proration rule;
- at least one partial receipt, arrears balance, vendor/maintenance expense, petty-cash expense, deposit movement, management fee, owner contribution, and owner distribution;
- at least one owner who leaves money held by IPS across periods;
- a property with clean single ownership and, only if required, one effective ownership change.

For each pilot property/month:

1. Import/approve opening tenant, deposit, and owner balances.
2. Generate and validate expected charges.
3. Reconcile receipts and outstanding balances.
4. Reconcile bills, payments, maintenance, and petty cash.
5. Reconcile deposits.
6. Calculate and approve management fees.
7. Reconcile owner contributions, reserves, and distributions.
8. Attach external cash/bank evidence and complete reconciliation.
9. Resolve every Critical parity exception.
10. Close the property period.
11. Generate, review, approve, publish, and retain the itemized Owner Statement.
12. Compare canonical totals with IPS source records and the prior system/export.
13. Obtain named IPS finance acceptance or documented discrepancy resolution.

Do not treat a successful software workflow as financial acceptance without the external comparison.

### 8. Prove the complete end-to-end invariant

Add one retained, production-shaped automated scenario covering:

```text
Lease and term
→ expected charge occurrence
→ rent obligation
→ partial receipt and allocation
→ final receipt and allocation
→ outstanding balance
→ maintenance actual cost
→ linked bill
→ partial/final payment
→ petty-cash expense
→ deposit receipt/disposition disclosure
→ management-fee assessment
→ owner contribution
→ owner distribution
→ external reconciliation
→ property-period close
→ immutable itemized Owner Statement
→ retained PDF/CSV
→ reversal in a later open period
→ reopen/reclose/reissue when historical restatement is required
```

It must prove the same totals and exact source identities across:

- Rent & Income;
- Bills & Expenses;
- Maintenance and Petty Cash;
- property and unit records;
- canonical event contract;
- Ledger projection;
- accounting journal controls;
- Owner Close;
- Owner Balance;
- Owner Statement version and artifact.

### 9. Production rollout and verification

Only after explicit authorization:

- capture current production deployment SHA, Supabase project identity, migration history, environment configuration, and backup status;
- create and verify a restorable backup before migrations;
- apply migrations in approved order;
- run schema lint and generated-type parity against the deployed commit;
- execute dry-run migration and compare its manifest with the approved artifact;
- apply only the approved pilot scope;
- run parity and end-to-end smoke checks;
- verify RLS/bypass protections with production-safe read or controlled fixture methods;
- inspect application/database logs for errors;
- publish no owner statement until named reviewers accept the first close;
- document exact deployed SHA, migration run, counts/totals, checks, sign-off, and rollback posture.

Broad portfolio rollout occurs property batch by property batch, not as an unreviewed all-or-nothing migration.

### 10. Retire unsafe compatibility paths after acceptance

After pilot acceptance and a defined observation period:

- remove or hard-block new manual/source-linked Ledger mutation paths superseded by canonical workflows;
- remove new compatibility deposit-income, manual fee, and owner-payout choices;
- switch relevant report loaders from legacy Ledger aggregation to canonical or closed snapshots;
- preserve historical tables/columns and compatibility readers until a separate, evidence-backed retirement decision;
- update `docs/current-state.md`, `docs/engineering-rules.md`, `docs/verification.md`, and production runbooks to describe only merged behavior;
- add monitoring for parity, failed projections, close blockers, statement publication, and delivery failures.

Do not drop accounting or legacy finance tables in this plan.

## Invariants to preserve

- Originals and migration decisions are retained; no destructive history rewrite.
- Every migrated effect maps exactly once or remains explicitly unresolved.
- Dry-run manifest/hash must match apply-time source state.
- Backfill is idempotent, resumable, bounded, and auditable.
- Pilot cutover is scoped and server-enforced.
- Old and new write paths cannot both create effective financial truth.
- Rollback preserves new events and published statements.
- External IPS records, not only internal software totals, validate the pilot.
- Production execution requires explicit authorization and a restorable backup.
- No corporate accounting or ERP expansion.

## Acceptance criteria

1. Dry-run inventories 100% of selected financial source rows and reports exact counts/totals by source and economic class.
2. Every material row is deterministically linked, converted through an approved resolution, or remains blocking; none is silently guessed or dropped.
3. Apply mode rejects a changed source manifest and is idempotent/resumable.
4. Post-apply canonical, Ledger, journal, owner-balance, and statement totals match the approved migration artifact.
5. Pilot properties can be promoted independently without changing non-pilot behavior.
6. New pilot writes cannot enter an unsafe legacy path.
7. The complete end-to-end scenario passes with exact source identity and totals.
8. First published pilot statements match IPS external records and receive named finance acceptance.
9. Reversal, reopen, reclose, and reissue preserve prior immutable versions.
10. Production backup restore is rehearsed before production migration.
11. Production deployment/migration SHA, parity output, logs, RLS checks, and sign-off are retained.
12. Rollback or repair-forward behavior is tested and does not lose canonical-only events.
13. Compatibility paths are retired only after accepted evidence and remain readable historically.

## Verification

### Required local and preview evidence

- RED fixtures for every legacy ambiguity class.
- Focused migration resolver and idempotency tests.
- Full application tests.
- ESLint, TypeScript, production build, and `git diff --check`.
- Clean database reset and schema lint.
- Generated database type drift check.
- Full pgTAP suite, including authorization and direct-RPC bypass.
- Production-shaped dataset performance test.
- Full authenticated browser verification for admin and relevant manager/member boundaries.
- PDF/CSV artifact verification.
- Interrupted-batch resume and stale-manifest rejection test.
- Cutover and rollback/repair-forward rehearsal in an isolated preview environment.

### Required production evidence after authorization

- Pre-migration backup and tested restore evidence.
- Exact deployment and database migration SHAs.
- Approved dry-run/apply manifests and checksums.
- Post-migration counts, totals, and zero unresolved Critical parity issues in pilot scope.
- Authenticated production smoke without destructive test data.
- Logs/monitoring review.
- Named IPS finance acceptance for the first statement cycle.

## Scope exclusions

- No all-portfolio automatic migration before pilot acceptance.
- No fuzzy automatic matching by amount/date/description.
- No destructive reset, table drop, or history deletion.
- No general accounting replacement, tax, payroll, corporate P&L, multi-currency, or broad integration.
- No owner/tenant portal.
- No production execution without explicit authorization.
- No merge or rollout merely because automated CI is green.

## Deliverables

- Migration-run/resolution schema and checked workflows.
- Dry-run/apply CLI with deterministic artifacts and manifest hashes.
- Reviewed resolution packet for each pilot property.
- Idempotent, resumable backfill functions.
- Scoped shadow/pilot/canonical cutover controls.
- Rollback/repair-forward runbook.
- Retained full end-to-end automated scenario.
- IPS pilot verification and acceptance packet.
- Updated current-state, engineering, verification, and production runbook documentation after accepted cutover.
- Draft implementation PRs and release PR; Codex must not merge or execute production changes unless explicitly requested.

## Stop conditions

Stop before apply or rollout if:

- any material legacy row remains ambiguously classified;
- the dry-run source hash changed;
- one financial effect can map to multiple canonical events;
- backfill is not idempotent/resumable;
- rollback would hide or lose canonical-only events;
- backup restore has not been proven;
- canonical, Ledger, journal, owner-balance, statement, and external IPS totals do not agree;
- any direct-RPC/RLS bypass remains;
- the first statement has not received named finance review; or
- the requested rollout expands beyond the approved pilot scope.
