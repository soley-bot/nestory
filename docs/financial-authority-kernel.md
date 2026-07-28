# Shared financial-authority kernel

Plan 03 adds database authority infrastructure for later source-specific
financial workflows. It does not change a current receipt, payment, deposit,
petty-cash, maintenance, report, export, or page workflow.

## Property reporting periods and revisions

`public.property_reporting_periods` is the stable identity for one
organization, property, currency, and calendar month. Its database constraints
enforce:

- one row per `(organization_id, property_id, currency, period_start)`;
- a composite organization/property foreign key;
- an exact month-start `period_start`; and
- lifecycle values `open`, `in_review`, `closed`, and `reopened`.

`public.property_close_revisions` is append-only history below that stable
header. Revisions have a monotonically increasing number, an
`initial_close`, `reopen`, or `reclose` kind, an exact previous-revision
identity, calculation-contract version, optional manifest hashes, and a
mandatory reason for reopen/reclose. Existing revisions cannot be updated or
deleted. After the single initial close, revision kinds must alternate from
`reopen` to `reclose`. The header's current pointer has a composite foreign
key that cannot cross property periods.

Authenticated organization admins can read organization-scoped rows through
RLS. Other authenticated members cannot read them, and no authenticated role
has direct insert, update, or delete privileges. Plan 03 deliberately adds no
public close, reopen, readiness, publication, or statement RPC.

## Mandatory transaction lock order

Every future source write, reversal, projection, and close transition must use
this order:

1. take the property/currency/month transaction advisory lock;
2. get or create the stable `property_reporting_periods` header and lock it
   `FOR UPDATE`;
3. take the shared organization/currency/month broader-authority transaction
   lock;
4. evaluate the property lifecycle, organization Ledger lock, and applicable
   locked client accounting-book periods in stable book-ID order;
5. take the operation/idempotency advisory lock and lock its request row;
6. write or lock the domain source rows; and
7. write reserved Ledger and journal projections.

`app_private.lock_property_reporting_period` provides lock-only semantics for
a future close transition.
`app_private.lock_open_property_reporting_period` adds the lifecycle and
broader-lock checks for future source operations. Both paths share the same
first advisory/header locks. The helpers are private, use a hardened empty
`search_path`, and are not executable by API roles or `service_role`.

Existing source RPCs are not wired to these helpers in Plan 03. Their later
atomic-settlement plans must adopt this order without reversing it.

Organization Ledger and client-accounting lock or unlock transitions take the
exclusive form of the same broader-authority transaction lock before their
period-row upsert. Already-running source transactions therefore finish first;
once a transition holds exclusive authority, later sources wait and then
re-read committed status. The advisory identity does not depend on a period
row, so an absent-row `INSERT`/`UPSERT` cannot bypass the protocol. Ordinary
sources for different properties retain independent property locks and share
the broader authority lock, so they remain concurrent when no transition is
running.

The repository concurrency commands run the complete supported matrix by
default. Ledger covers source-first, transition-first, and unlock against both
existing and absent rows plus isolation. Accounting covers the same cases plus
multiple active client books. The current product currency enum contains only
`USD`; the harness does not add unsupported enum values. Every scenario
terminates and awaits its child `psql` processes, then removes its fixed local
or CI fixtures. A fault-injection hook proves the same cleanup path after a
transaction has acquired authority and the runner fails.

## Effective privilege boundary

Authority state and private capability data use this effective role boundary:

| Relation or function | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `ledger_period_locks` | none | `SELECT` | none |
| `accounting_periods` | none | `SELECT` | none |
| `property_reporting_periods` | none | `SELECT` through RLS | none |
| `property_close_revisions` | none | `SELECT` through RLS | none |
| private idempotency/capability relations | none | none | none |
| public Ledger/accounting transition RPCs | none | `EXECUTE`, with admin checks | none |
| private shared/exclusive authority helpers | none | none | none |
| private accounting/property writers | none | none | none |
| reserved-projection capability setter | none | none | none |

The pure `is_reserved_financial_source_type` classifier is the deliberate
exception: `authenticated` and `service_role` may execute it because
invoker-owned generic RPCs and table triggers use it to reject reserved-source
writes. It exposes no rows and cannot enable the reserved-projection
capability.

PostgreSQL table ownership is an unavoidable database-owner escape hatch.
Nestory application and server code do not connect as the database owner and
do not write either authority table directly. Owner access is limited to
migrations, pgTAP, and fixed-ID local/CI concurrency-fixture setup or cleanup.
The harness cleanup temporarily disables the property-period deletion trigger
inside one owner transaction only after all child transactions have ended,
deletes only its fixed fixture identities, re-enables the trigger, and proves
the identities are gone. Any future hosted break-glass authority repair would
require a separate approved DBA procedure with the same exclusive authority
locks, a transaction, pre/post evidence, and an append-only audit record; Plan
03 authorizes no such hosted operation.

## Reconciliation sources

`public.financial_reconciliation_sources` stores stable, non-sensitive source
identity:

- organization, optional dedicated property, and currency;
- organization-unique stable code and editable display name;
- broad kind: `bank`, `cash`, `petty_cash`, `clearing`, or `other`;
- scope: `organization_pooled` or `property_dedicated`;
- optional masked reference; and
- archive and actor/timestamp audit fields.

A pooled source forbids a property. A dedicated source requires an exact
organization/property identity. Core code, kind, scope, property, and currency
cannot change after any cash row references the source. Checked admin RPCs
create a source, update its display label/masked reference, or archive it.
Direct authenticated DML is denied.

Nullable, indexed links are available on:

| Cash record | Link identity | Required checks |
| --- | --- | --- |
| `finance_receipts` | header `reconciliation_source_id` | organization, currency, active source, and dedicated property |
| `finance_payments` | header `reconciliation_source_id` | organization, currency, active source, and dedicated property |
| `lease_deposit_events` | event `reconciliation_source_id` | organization, currency, active source, and dedicated property |
| `petty_cash_entries` | entry `reconciliation_source_id` | organization, currency, active source, and dedicated property |

Existing rows remain null. Plan 03 performs no inference, matching, assignment,
or backfill.

Plan 01 contract `finance_inventory_v3` and
`property_cash_events_v1` expose `linked_exact_identity` only for an exact
link. Otherwise they retain `missing_stable_identity` and
`missing_reconciliation_source`. Linking a source does not clear unrelated
resolution codes.

## Shared idempotency

`app_private.financial_idempotency_requests` is private to later domain RPCs.
Its authority key is
`(organization_id, operation, idempotency_key)` and it separately stores the
actor plus the SHA-256 of canonical `jsonb` payload text.

- The same actor and payload replay the completed result IDs.
- A changed payload fails closed.
- Another actor receives the same generic conflict and never receives prior
  result IDs.
- Deleting an actor nulls the retained actor reference without deleting
  idempotency history; any later reuse by another actor still conflicts.
- A transaction advisory lock serializes concurrent claims.
- Completion stores result IDs only in the caller's source transaction.
- A failed surrounding transaction rolls back its pending claim.

No public generic idempotency RPC or UI exists.

## Migration locking disposition

The initial kernel migration replaces one validated Ledger `CHECK`, adds one
validated journal `CHECK`, and builds two non-concurrent partial unique
indexes. PostgreSQL takes `ACCESS EXCLUSIVE` for the `ALTER TABLE` constraint
work; validation scans the existing rows. A normal `CREATE INDEX` takes a
`SHARE` table lock, so reads continue but writes wait. The later serialization
and acceptance-hardening migrations replace functions and tighten ACLs; they
do not rewrite either finance table or build another index.

The disposable scale fixture measured:

| Relation | Rows | Total relation size |
| --- | ---: | ---: |
| `ledger_entries` | 5,208 | 8,696 KiB |
| `accounting_journal_entries` | 1 | 160 KiB |
| `accounting_books` | 2 | 112 KiB |

Both reserved-source duplicate preflights returned zero groups. At that scale,
the repository reset and database suite complete without material lock
pressure. This is local fixture evidence only.

Before any hosted migration, a database operator must run:

```sql
SELECT
  'ledger_entries' AS relation,
  count(*) AS rows,
  pg_total_relation_size('public.ledger_entries') AS total_bytes
FROM public.ledger_entries
UNION ALL
SELECT
  'accounting_journal_entries',
  count(*),
  pg_total_relation_size('public.accounting_journal_entries')
FROM public.accounting_journal_entries;

SELECT organization_id, lower(btrim(source_type)), source_id, count(*)
FROM public.ledger_entries
WHERE app_private.is_reserved_financial_source_type(source_type)
  AND source_id IS NOT NULL
GROUP BY organization_id, lower(btrim(source_type)), source_id
HAVING count(*) > 1;

SELECT organization_id, book_id, lower(btrim(source_type)), source_id, count(*)
FROM public.accounting_journal_entries
WHERE app_private.is_reserved_financial_source_type(source_type)
GROUP BY organization_id, book_id, lower(btrim(source_type)), source_id
HAVING count(*) > 1;
```

Hosted size is an external deployment gate. If either hosted relation exceeds
the locally proven row count or size, rehearse the migration against a
representative copy before approval. Use a 5-second `lock_timeout` so the
deployment fails rather than waiting behind live work. If the rehearsal cannot
acquire and release each blocking operation within that threshold, or writes
cannot be paused, require a maintenance window and reconsider a separate
concurrent-index migration based on measured evidence. Plan 03 authorizes no
hosted preflight or migration.

## Reserved projections

One deterministic predicate defines the reserved canonical namespaces:

- `receipt_allocation`
- `payment_allocation`
- `deposit_event`
- `petty_cash_entry`
- `rent_charge_occurrence`
- `maintenance_handoff`
- `management_fee_assessment`
- `owner_cash_event`
- `financial_adjustment`

The predicate is a pure classifier. `authenticated` and `service_role` may
execute it only because invoker-owned generic RPCs and table triggers use it to
reject prohibited writes; it exposes no rows or mutation authority.

Reserved Ledger identities are unique on
`(organization_id, source_type, source_id)`. Reserved journal identities are
unique per accounting book. Reserved source types must use canonical
lower-case spelling, and Ledger projections require an exact source ID. Table
triggers reject direct insert, update, archive, restore, or delete unless a
private future domain workflow enables an unguessable transaction-local
capability. The capability table and context-setting helper are private and
unavailable to API roles and `service_role`; caller-set configuration values
do not grant projection authority.
Generic Ledger and journal RPCs fail with a controlled instruction to use the
domain source workflow. Generic journal reversal cannot reverse a reserved
projection.

Plan 03 creates no receipt, payment, deposit, petty-cash, maintenance, fee, or
owner projection.

## Deliberate legacy boundaries

The current finance tables and their compatibility RPCs retain the grants they
already required. Plan 03 does not broadly revoke them, route them through the
new period lock, or make them atomic with reserved projections. Current
non-reserved manual and compatibility Ledger behavior also remains available.

Those are recorded compatibility bypasses, not proof of converted authority.
Each later source-specific plan must close its own direct-DML/RPC boundary,
adopt the shared lock and idempotency helpers, and write its source plus
reserved projections in one transaction.

No hosted migration, reconciliation evidence, matching, variance review,
close lifecycle, source repair, backfill, report cutover, or production
operation belongs to this kernel.
