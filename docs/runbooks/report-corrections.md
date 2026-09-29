# Correcting expenses while reviewing reports

Super Admin and Finance Manager can open an expense from a report, correct it,
and return to the same report month, property, and unit filters.

## Operator workflow

1. Expand an account in Profit & loss detail and click the transaction memo.
   Transactions, management fees, and rent collections also link to their sources.
2. Choose Edit expense for a pending expense or Correct expense for an approved
   expense. Change the payee, date, category, property/unit, lines, amounts, paid-from
   account, or reference, and enter the reason.
3. Save correction updates approved financial effects in one database transaction.
   A failure preserves the original. A repeated request cannot duplicate entries.
   Pending submissions remain pending. Existing receipts are retained automatically;
   a newly selected file replaces the receipt on the new version only.
4. Use Return to report and recheck. Live totals refresh from source records.
5. Change history shows who saved each change, when, why, and the before/after
   details. Original and replacement versions remain linked. Delete retains a
   reversal and removes the expense from current balances.

Finance Manager can submit and approve their own expenses, edit another staff
member's pending expense, and correct or delete approved expenses in their branch.
Other custom roles require both finance.approve_expenses and finance.correct_records
for approved corrections, and finance.submit_expenses for replacement submission.
Property scope, closed periods, settled customer charges, and immutable evidence
checks still apply. Existing rent settlement corrections and charge void controls
are available from the invoice reached through a report.

## DoorLoop references reviewed on 2026-09-29

- [Edit or Delete an Expense](https://support.doorloop.com/en/articles/6249001-edit-or-delete-an-expense): report row opens the expense editor; saving updates reports.
- [Audit Log Report](https://support.doorloop.com/en/articles/14489347-audit-log-report-track-every-change-in-your-account): actor, time, action, and before/after field details.
- [Edit or Delete a Deposited Lease Payment](https://support.doorloop.com/en/articles/8336732-edit-or-delete-a-lease-payment-that-has-already-been-deposited): linked deposit state must be resolved before changes.
- [Edit or Delete a Bill Payment](https://support.doorloop.com/en/articles/9778026-edit-or-delete-a-bill-payment): source edits from reports; reconciled records require an explicit reconciliation change.

Nestory implements source editing and visible history while preserving original
financial records through linked reversals and replacements.
