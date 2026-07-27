# Property Cash Events v1

`property_cash_events_v1` is the frozen, read-only database contract returned
by `public.get_property_cash_events_v1_page`. It is a shadow read model only:
no current report, export, page, or write path consumes it.

## Identity and pagination

The provisional canonical identity is the typed tuple
`(organization_id, source_type, source_id)`. `event_key` is the deterministic
text encoding `<source_type>:<source_id>` and is unique only within an
organization. Source IDs are always IDs of the domain row at the contract
grain; receipt and payment events therefore use allocation IDs, not headers or
obligations.

Rows are ordered by `event_date ASC NULLS LAST`, then `source_type ASC`, then
`source_id ASC`. The RPC uses the last returned values as a checked cursor and
never uses `OFFSET`. A null `event_date` cursor is valid only with non-null
source type and source ID, so unresolved evidence can be traversed
deterministically after dated events.

## Effects and unresolved evidence

`amount` is exact, positive `numeric`. The four signed effects are nullable:

- `owner_cash_effect`
- `operating_cash_effect`
- `deposit_liability_effect`
- `management_fee_effect`

`classification_status` states how consumers may use those effects:

- `source_stable` means the classification and signed effects come from the
  direct source row or exact linked Ledger row.
- `provisional_current_obligation` means receipt or payment classification is
  derived from the current, still-mutable obligation. Countable obligation
  classes return exact signed effects for shadow comparison; compatibility
  classes with unknown property economics remain null. Neither form is
  historical authority, and `requires_resolution` is always true.
- `unresolved_source_scope`, `unresolved_reversal_header`, and
  `unresolved_evidence` mean the evidence is not safe to count. All four
  effects are `NULL` and `requires_resolution` is true.

Exact zero is used only for an intentionally unaffected axis. Zero never
stands in for unknown economic meaning or an unproven cash date.
`period_start` is derived from a non-null `event_date`; it remains null when
the event date is unresolved.

## Source matrix

| Source at contract grain | Eligibility | Economic class | Status | Signed effects |
| --- | --- | --- | --- | --- |
| Receipt allocation for operating income | Exact source scope and, for reversals, exact header pairing | `operating_income` | `provisional_current_obligation` | owner and operating signed `amount`; deposit and fee `0` |
| Receipt allocation for management fee families | Exact source scope and, for reversals, exact header pairing | `management_fee` | `provisional_current_obligation` | signed owner and fee effects; operating and deposit `0` |
| Receipt allocation for owner contribution | Exact source scope and, for reversals, exact header pairing | `owner_contribution` | `provisional_current_obligation` | owner signed `amount`; other effects `0` |
| Receipt allocation for security-deposit compatibility income | No exact deposit-event identity | `security_deposit` | `provisional_current_obligation` | all effects `NULL` |
| Payment allocation for property expense | Exact source scope and, for reversals, exact header pairing | `operating_expense` | `provisional_current_obligation` | owner and operating signed `amount`; deposit and fee `0` |
| Payment allocation for owner payout | Exact source scope and, for reversals, exact header pairing | `owner_distribution` | `provisional_current_obligation` | owner signed `amount`; other effects `0` |
| Payment allocation for company-scope handling or refund | Property effect is not authoritative | `legacy_unclassified` | `provisional_current_obligation` | all effects `NULL` |
| Lease deposit event | Exact event, lease-deposit parent, and reversal scope | `security_deposit` | `source_stable` | owner and operating `0`; signed deposit liability; fee `0` |
| Cleared or posted property-expense petty cash with `clear_date` | Exact petty-cash row | `operating_expense` | `source_stable` | owner and operating `-amount`; deposit and fee `0` |
| Petty cash without `clear_date` | Invoice evidence only | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL`; date null |
| Maintenance task represented by its exact linked Ledger row | No finance expense for the task | `operating_expense` | `source_stable` | owner and operating `-ledger amount`; deposit and fee `0` |
| Active unmatched positive Ledger row | No exact domain identity | `legacy_unclassified` | `unresolved_evidence` | all effects `NULL` |

Company-scope petty-cash expenses, advances, and refunds remain visible as
unresolved non-counting evidence under the same null-effect rule.

## Person identity

Person columns contain only IDs directly stored on the source chain. Receipt
and payment person context is emitted from organization-scoped `people` joins:

- tenant identity may come from the exact lease on an income or deposit row;
- vendor identity may come from the exact expense obligation or maintenance
  task;
- owner identity is populated only when a source stores that owner directly.

The current owner roster is never joined to allocate or infer historical cash.
Labels, people roles, and current ownership percentages are not identity
evidence. A malformed direct person reference never becomes linkable contract
context; the row remains visible as `unresolved_source_scope` with null effects
and null person fields. Receipt payer and lease-tenant references are also
protected by composite organization/person foreign keys.

## Exact-only deduplication and reversals

Finance, petty-cash, and maintenance Ledger rows are projections and are
excluded when their exact domain source exists. Journals never emit events;
their IDs and status are non-authoritative reconciliation metadata only.
No link or deduplication may use descriptions, references, dates, vendors,
labels, or approximate amounts.

A receipt or payment reversal allocation receives provisional signed effects
only when the entire reversal header is a one-to-one match with the original
header by obligation ID and exact allocation amount. The reversal row retains
its own allocation identity and points to its exact original allocation. If
any allocation is missing, extra, or redistributed, every allocation on that
reversal header remains visible with
`classification_status = 'unresolved_reversal_header'`, null effects, and
`requires_resolution = true`.

A deposit reversal uses only its direct `reversal_of_id`. Resolved reversals
preserve the original event, carry exact opposite signed effects, and net to
zero with it. Archived settled obligations remain eligible because settlement
history is authoritative; void obligations without settlement never emit a
row.

Exact source scope also requires receipt/obligation and payment/obligation
currency equality, lease/property/unit consistency, task/property/unit
consistency, direct person organization consistency, and deposit reversal
membership in the same lease-deposit parent and original property/currency
scope. `currency_code` currently permits only non-null `USD`, so a
header/obligation currency mismatch cannot be inserted through the current
schema; the equality check remains part of the contract for future currencies.

Ledger eligibility deliberately requires `amount > 0`. A zero-amount Ledger
row is excluded as non-owner-relevant evidence rather than surfaced as an
unresolved cash event.

## Projection metadata

`ledger_entry_id`, `journal_entry_id`, and `projection_status` are diagnostic
reconciliation fields. They do not establish event identity, classification,
deduplication, settlement, or a cash date. Missing projections do not erase a
valid domain event.

## RPC boundary

The public RPC is `SECURITY INVOKER`, requires a signed-in organization admin,
and requires exact organization, property, currency, start date, and end date.
It rejects a property outside the organization, a range over 366 days, invalid
or partial cursors, and a page size outside `1..1000`. Execution is revoked
from `PUBLIC` and `anon` and granted only to `authenticated`. Fully qualified
base relations and the caller's RLS policies preserve organization isolation.
