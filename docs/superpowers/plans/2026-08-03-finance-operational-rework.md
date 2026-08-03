# IPS Finance Operational Rework

**Authorized:** 2026-08-03  
**Source:** `docs/superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md`  
**Branch:** `codex/finance-rework-completion`

## Outcome

Replace the presentation-only Finance first slice with a small, staff-operated financial workflow that follows the approved IPS diagram. The implementation must preserve property, lease, receipt, payment, and accounting authority already present in the repository.

This is not a full IPS general ledger or ERP. It does not add payroll, tax, bank reconciliation, multi-owner properties, automatic daily proration, owner self-service, or a configurable chart-of-accounts editor. Owner reports in this rework are operational reports; official close-backed statements remain outside this authorization.

## Product rules

- One property has one active owner in v1. Each property keeps a separate balance.
- Lease billing rules are effective-dated and include collection route, fee calculation, billing recipient, and first/final-period proration choices.
- Rent is one invoice per lease and billing period. Company billing addresses the invoice to the company and lists occupants as references.
- Customer documents use simple labels: Rent, Cleaning, Utility, Repairs and Maintenance, or Other. Internal cost and markup remain separate but the customer sees one total.
- Through-IPS payments increase IPS-held cash. Direct-owner confirmations settle the tenant balance without increasing IPS-held cash and are labeled `Collected by owner`.
- Management fees are an owner expense and IPS income. If held cash cannot cover the fee or an owner expense advanced by IPS, the remainder becomes an owner invoice for that property.
- Tenant-responsible expenses never reduce the owner balance.
- Property account totals show running balance, cash held by IPS, amount owner owes IPS, and available withdrawal separately.
- Withdrawals apply open owner amounts first and cannot exceed held cash.

## Delivery slices

### 1. Lease billing authority

- Add effective-dated `lease_billing_terms` with one non-overlapping active range per lease.
- Store collection route, flat/percentage management fee, active-lease fee rule, full-fee-during-proration choice, billing recipient, and explicit first/final-period amounts.
- Add an RPC mutation with organization scope, exact money checks, idempotency, immutable historical terms, and activity logging.
- Extend the lease form with a short Billing section rather than a separate policy engine.

### 2. Rent invoices and collection

- Add typed tenant invoice headers and lines linked to lease, billing term, property, payer, and existing `finance_income_items` obligations.
- Generate one rent invoice per lease and billing period from authoritative lease and billing terms.
- Add one atomic receipt command that allocates partial payments rent-first by default, with optional staff-selected allocations.
- Add a separate direct-owner confirmation command. It settles invoice obligations without creating a cash receipt or IPS-held cash.
- Add management-fee effects exactly once per rent occurrence.

### 3. Expense responsibility and recovery

- Extend the expense command to capture simple category, responsibility, funding, and optional internal markup.
- Split owner-funded and IPS-advanced amounts when held cash is insufficient.
- Create tenant invoice lines for tenant responsibility and owner invoice lines for uncovered owner responsibility.
- Preserve vendor-payment authority through the current expense/payment chain.

### 4. Property accounts, owner invoices, and withdrawals

- Add typed owner invoices and lines, property-account events, and withdrawals.
- Derive the four property-account totals from linked authoritative effects, never from editable summary columns.
- Keep owner invoices property-specific and withdrawals staff-only.

### 5. Finance workspace and reports

- Finish the approved laptop-first information architecture: Finance work, Rent, Expenses, Balances, Leases, More.
- Add dedicated tenant invoice, customer balance, property account, owner invoice, and operational report screens.
- Use centered modals for Record payment, Add expense, Owner payment, and Withdrawal.
- Keep one obvious primary action per screen and remove permanent explanatory filler.

## Verification gates

For each schema slice:

1. Write a focused pgTAP contract or behavior test and confirm it fails first.
2. Add one sequential, additive migration.
3. Run a fresh local database reset, the focused pgTAP test, database lint, and generated-type update.
4. Add focused action/data/component tests for changed application behavior.
5. Commit the slice independently.

Before merge:

- Run changed Vitest suites, TypeScript, ESLint, UI copy/route coverage, database lint, and all new finance pgTAP tests.
- Verify 1440x900 and 1280-wide authenticated Finance flows in the in-app browser, including keyboard focus and modal overflow.
- Apply migrations to the linked hosted database only after local verification and explicit project-target confirmation.
- Rebase or merge latest `origin/main`, resolve conflicts in this isolated worktree, push the completion branch, open a focused PR, and merge only after required checks are green.

## Compatibility and cleanup

- Existing `finance_income_items`, receipts, allocations, expenses, payments, and accounting projections remain authoritative compatibility sources.
- New typed records link to those sources; they do not create a parallel generic event engine.
- Historical records with unsupported old labels remain readable but are not offered in new customer-facing forms.
- Presentation-only first-slice components may be replaced or removed when the operational routes supersede them.
