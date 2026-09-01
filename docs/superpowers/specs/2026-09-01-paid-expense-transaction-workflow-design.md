# Paid Expense Transaction Workflow Design

## Goal

Extend the existing paid-cost workflow so one reviewed transaction can contain multiple property expense lines while preserving the current single-line financial source records, maker-checker boundary, evidence retention, exact money, and reversals.

## Authority Model

`expense_transactions` is the transaction-level immutable snapshot. It owns the selected existing person or deliberate external payee, paid date, USD currency, reconciliation source, receipt/payment reference, retained evidence document, submitter, review decision, reviewer, and reversal state.

`expense_transaction_lines` connects the transaction to one or more existing `expense_submissions`. Each child submission remains the downstream-compatible line authority for property/unit scope, Finance category, amount, responsibility, approval-created expense/payment/allocation/Ledger identities, and reversal identities. The line link adds the real expense description, stable line order, and an optional explicit owner-cash amount. A transaction with one child is the compatibility case; historical submissions without a transaction remain readable and reviewable through the existing RPCs.

The new transaction RPCs orchestrate existing checked submit, review, and reversal RPCs inside one PostgreSQL transaction. They use a parent actor-bound idempotency claim plus deterministic child keys. Every property is checked through the existing branch-scoped Finance authority before any durable result is returned. Direct table mutation remains revoked.

## Payee And Evidence

The form defaults to an existing active People record, with active Vendors ordered first. A separate `One-time external payee` choice reveals a required label and intentionally leaves `vendor_person_id` null. `Create vendor` opens `/vendors?action=create`, reusing the People/Vendor workflow rather than creating another vendor model or write boundary.

Evidence remains one immutable retained object for the transaction. The document is registered against the first line's property for the existing Storage contract, while transaction scope records enumerate every property covered by the receipt. The evidence eligibility guard permits reuse only by child submissions of that exact immutable transaction; unrelated submissions remain unable to reuse the object.

## Multiple Lines

Owner-responsibility transactions may contain multiple lines. Each line requires a property, an optional unit belonging to that property, an active owner-expense category, a non-empty description, and an exact positive amount. Transaction-level paid date, payee, funding source, reference, evidence, and approval are rendered once.

The selected funding source must be valid for every line. Organization-pooled sources can fund cross-property transactions. A property-dedicated source is valid only when every line belongs to that property. Tenant-recovery submissions remain a one-line compatibility flow because their invoice, markup, and tenant responsibility contract is line-specific and already source-linked.

## Owner Cash

Each owner line has an optional explicit owner-cash amount. Blank preserves the existing automatic-safe allocation behavior. An explicit zero applies no owner cash. A positive explicit amount targets only the owner invoice line created from that expense line; it never asks the operator to select or rewrite a historical rent receipt.

Approval locks authoritative property held cash and the target owner invoice line. It rejects amounts greater than the line balance or current authoritative held cash. The allocation is appended to `owner_charge_cash_allocations`, so existing owner balance, Owner Statement, and reversal behavior continue to derive from authoritative sources. A failed line rolls back the whole transaction review.

## Read Model And UI

The Finance loader groups child submissions by transaction. New summaries expose transaction identity and line summaries while retaining aggregate compatibility fields used by the existing queue and property Finance surfaces. Review and reversal drawers show all lines, their descriptions, per-property amounts, and explicit/automatic owner-cash instruction.

The create drawer uses the shared form controls and keeps a single dominant workflow: payee and payment facts, editable lines with `Add line`, financial preview, then evidence. The UI shows available IPS-held owner cash as guidance, but the database rechecks the authoritative amount during approval.

## Verification

Vitest covers form behavior, action parsing, exact-money rejection, evidence anchoring, RPC payloads, grouping, and compatibility summaries. pgTAP covers grants/RLS, person/external payees, cross-property source validation, branch scope, category authority, actor-bound idempotency, single- and multi-line approval, explicit owner-cash over-allocation, transaction rejection, exact reversal, and historical single-line compatibility. The retained concurrency harness adds duplicate transaction submit/review/reversal races. Clean reset, generated types, database lint, focused/full tests, TypeScript, ESLint, build, and migration discipline are required before the branch is pushed.

## Explicitly Deferred

This change does not add unpaid bills, recurring expenses, payment execution, bank reconciliation, a chart of accounts, multi-currency, per-line evidence, or multi-line tenant recharges. Vendor creation remains in the existing Vendors workflow and is not embedded as a second form.
