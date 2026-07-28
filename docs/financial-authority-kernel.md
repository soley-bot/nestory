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
3. evaluate the property lifecycle, organization Ledger lock, and applicable
   locked client accounting-book period;
4. take the operation/idempotency advisory lock and lock its request row;
5. write or lock the domain source rows; and
6. write reserved Ledger and journal projections.

`app_private.lock_property_reporting_period` provides lock-only semantics for
a future close transition.
`app_private.lock_open_property_reporting_period` adds the lifecycle and
broader-lock checks for future source operations. Both paths share the same
first advisory/header locks. The helpers are private, use a hardened empty
`search_path`, and are not executable by API roles or `service_role`.

Existing source RPCs are not wired to these helpers in Plan 03. Their later
atomic-settlement plans must adopt this order without reversing it.

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
