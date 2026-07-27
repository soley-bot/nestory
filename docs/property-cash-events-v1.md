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

Resolved rows populate the effects that their classification controls and use
exact zero only for an intentionally unaffected axis. An unresolved row sets
all four effects to `NULL`; zero must never stand in for unknown economic
meaning or an unproven cash date. `requires_resolution` is true for every such
row. `period_start` is derived from a non-null `event_date`; it remains null
when the event date is unresolved.

## Source matrix

| Source at contract grain | Eligibility | Economic class | Statement section | Stable category | Signed effects |
| --- | --- | --- | --- | --- | --- |
| Receipt allocation for rent, utility reimbursement, parking, late fee, or other operating income | Exact allocation, receipt, and income obligation | `operating_income` | `income` | Income type | owner `+amount`; operating `+amount`; deposit and fee `0` |
| Receipt allocation for management fee, leasing commission, service fee, or maintenance markup | Exact allocation, receipt, and income obligation | `management_fee` | `management_fees` | Income type | owner `-amount`; operating `0`; deposit `0`; fee `+amount` |
| Receipt allocation for owner contribution | Exact allocation, receipt, and income obligation | `owner_contribution` | `owner_funding` | `owner_contribution` | owner `+amount`; other effects `0` |
| Receipt allocation for security deposit compatibility income | Exact allocation exists but no exact deposit-event identity | `security_deposit` | `deposits` | `security_deposit_compatibility` | all effects `NULL`; unresolved |
| Payment allocation for property expense | Exact allocation, payment, and expense obligation | `operating_expense` | `expenses` | Expense category normalized to a stable code | owner `-amount`; operating `-amount`; deposit and fee `0` |
| Payment allocation for owner payout | Exact allocation, payment, and expense obligation | `owner_distribution` | `owner_distributions` | `owner_distribution` | owner `-amount`; other effects `0` |
| Payment allocation for company cost, company advance, refund, or other company-scope handling | Exact allocation exists but the property effect is not authoritative | `legacy_unclassified` | `unresolved` | `company_scope_payment` | all effects `NULL`; unresolved |
| Lease deposit event | Exact event and lease-deposit parent | `security_deposit` | `deposits` | Deposit type plus event type | owner `0`; operating `0`; signed deposit liability; fee `0` |
| Cleared or posted property-expense petty-cash entry with `clear_date` | Exact petty-cash row | `operating_expense` | `expenses` | Petty-cash category normalized to a stable code | owner `-amount`; operating `-amount`; deposit and fee `0` |
| Cleared or posted property-expense petty-cash entry without `clear_date` | Invoice evidence only | `legacy_unclassified` | `unresolved` | `petty_cash_uncleared` | all effects `NULL`; unresolved and date null |
| Maintenance task represented by its exact linked Ledger row, with no finance expense for the task | Exact `tasks.ledger_entry_id` link | `operating_expense` | `expenses` | `maintenance` | owner and operating `-ledger amount`; deposit and fee `0` |
| Active unmatched Ledger row | No exact finance, petty-cash, or maintenance domain identity | `legacy_unclassified` | `unresolved` | `ledger_unclassified` | all effects `NULL`; unresolved legacy evidence |

Company-scope petty-cash expenses, advances, and refunds remain visible as
unresolved non-counting evidence under the same null-effect rule.

## Person identity

Person columns contain only IDs directly stored on the source chain:

- tenant identity may come from the exact lease on an income or deposit row;
- vendor identity may come from the exact expense obligation or maintenance
  task;
- owner identity is populated only when a source stores that owner directly.

The current owner roster is never joined to allocate or infer historical cash.
Labels, people roles, and current ownership percentages are not identity
evidence.

## Exact-only deduplication and reversals

Finance, petty-cash, and maintenance Ledger rows are projections and are
excluded when their exact domain source exists. Journals never emit events;
their IDs and status are non-authoritative reconciliation metadata only.
No link or deduplication may use descriptions, references, dates, vendors,
labels, or approximate amounts.

A receipt or payment reversal allocation is resolved only through
`reversal header -> original header -> same obligation's unique allocation`.
The reversal row retains its own allocation identity and points to the original
allocation identity. A missing or ambiguous original allocation remains
visible with null effects and `requires_resolution = true`.

A deposit reversal uses only its direct `reversal_of_id`. Resolved reversals
preserve the original event, carry exact opposite signed effects, and net to
zero with it. Archived settled obligations remain eligible because settlement
history is authoritative; void obligations without settlement never emit a
row.

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
