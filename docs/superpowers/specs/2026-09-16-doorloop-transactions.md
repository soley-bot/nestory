# Property and unit transaction workflow

Status: approved by the user on 16 September 2026. Implementation must preserve live financial records until an exact correction preview is approved.

## Intended staff experience

Property or Unit > Finance > Transactions presents one searchable list. Filters: period, unit (within a property), type, status and tenant. Keep current record context when opening or closing a transaction.

Actions: Add charge, Receive payment, Add expense, Owner contribution, Owner distribution and Reports. Use existing permission checks and posting commands; scope and lease are prefilled where unambiguous. Multiple leases require selection.

Each row opens readable details and provides Edit or Delete where supported. Editing presents current fields and a before/after review. Delete confirms the specific transaction and impact. No separate manual reversal task is required: posted records are reversed or replaced atomically behind the interface, with history preserved. Do not pretend an incomplete reversal is a successful edit. Paid charges, allocations, reconciled items and closed periods need transaction-specific dependency checks and actionable messages.

Default list shows one current business transaction, with correction history available on demand. Reversal entries are retained for accounting and history, not duplicated as ordinary current transactions. Charges and receipts stay distinct: an unpaid charge must not be counted as received cash. Show tenant amount due and owner cash as separately named balances; do not sum unlike balances into one running total.

Reports opens the same property/unit and period. Owner statement includes opening balance, cash in/out, detailed activity, closing balance and applicable deposit balances. Attach or export matching P&L; PDF and XLSX must reconcile with the screen. Contributions, distributions and deposits remain outside operating income and expenses. Historical published statements stay immutable; regenerated versions identify their revision.

## Immediate correction investigation

Read-only production queries confirmed the original USD 454.40 distribution remains dated 15 September 2026. Its cash sources are USD 414.40 from the 6 August receipt plus USD 40 from the 4 September receipt.

Two USD 40 management-fee cash allocations are dated 6 August. One belongs to the August fee recognized 26 August; the other belongs to the September fee recognized 1 September. Along with USD 5.60 utilities, the cash ledger therefore has only USD 414.40 before September. This explains why moving the USD 454.40 payout to 31 August is blocked.

The earlier migration preventing future-charge auto-settlement explicitly excludes existing Pilot history. Do not remove the insufficient-cash safeguard or insert balancing money. Trace the historical allocation provenance, reproduce in a local fixture, and prepare a precise before/after correction preview. Any actual Pilot financial correction requires approval of that concrete preview; code release alone does not authorize editing the customer's books.

## Approach choices

1. Recommended: add the unified transaction workspace over existing posting and reporting authority, with atomic edit/delete commands where needed. Smallest route to the requested flow while preserving balances and audit history.
2. Only relabel existing menus: quicker, but leaves staff navigating separate screens and does not meet the full requested flow.
3. Replace the accounting engine: significantly greater migration and reconciliation risk; unnecessary for the workflow described.

## Implementation order

1. Reproduce and resolve the historical fee-allocation/correction scenario with explicit financial preview.
2. Build the scoped Transactions list and direct charge/payment actions.
3. Standardize transaction detail, Edit and Delete flows using transaction-specific authority.
4. Connect statement plus P&L exports to identical scope and period.
5. Run local regression, CI, protected production database release if needed, and non-mutating live acceptance.

## Acceptance cases

- WENJIAN scenario: USD 500 August receipt, USD 40 August fee, USD 5.60 utilities, USD 454.40 payout; September fee must not silently consume August funds through an erroneous automatic allocation.
- Partial payments, multiple charges, unapplied funds and deposit payments remain correctly classified.
- Edit date across months, edit amount/reference, delete unpaid charge, delete allocated receipt, edit approved expense, and cancel each review without writes.
- Permission denial, closed period, stale form, repeated save/idempotency, missing source, dependent cash and simultaneous edits fail safely and explain the next step.
- Property/unit filters prevent cross-record edits and exports; property-level expenses are not duplicated into every unit.
- Screen/PDF/XLSX totals agree for opening/closing cash and P&L. Generated reports contain readable dates and business references without raw IDs.
- Live acceptance opens, reviews and cancels forms; mutation tests use isolated fixtures.

## Reference evidence

- Customer screenshots supplied in this task. Video files were not supplied, so exact recorded interactions have not been inspected.
- https://support.doorloop.com/en/articles/6314603-edit-an-owner-distribution
- https://support.doorloop.com/en/articles/6314527-edit-or-delete-an-owner-contribution
- https://support.doorloop.com/en/articles/9778026-edit-or-delete-a-bill-payment
- https://support.doorloop.com/en/articles/8160274-owner-statement-report
- https://support.doorloop.com/en/articles/9736552-transaction-details-report

DoorLoop's accounting-level Transaction Details report shows multiple journal entries per transaction. The proposed staff workspace follows a single business-transaction list, with accounting details available separately.
