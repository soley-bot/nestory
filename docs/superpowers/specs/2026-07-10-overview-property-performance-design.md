# Overview Property Performance Redesign

Date: 2026-07-10

## Decision Summary

Nestory's Overview will become a property-performance workspace for property managers. It will answer how each managed property is operating, what cash it produced for its owner, and which operational issues explain weak performance.

The redesign keeps the existing dashboard lenses but gives them a shared, table-first structure:

- `All` remains the stable URL value and is displayed as **Portfolio**.
- `Finance` remains the stable URL value and is displayed as **Property finance**.
- `Leasing`, `Maintenance`, and `Records` remain visible lenses.

Nestory will use its existing neutral design tokens and shared components. The implementation must not introduce hard-coded client colors, decorative gradients, or a visual identity that prevents future tenant branding.

## Product Boundary

Nestory is a property operations and property accounting platform. It is not the management company's accounting system.

In scope:

- Rent charges, payments, receipts, and arrears.
- Security deposits as separately held tenant funds.
- Property and unit income and expenses.
- Property-related vendor invoices and maintenance expenses.
- Cash-basis property and portfolio reporting.
- Owner statements and statement-readiness checks.
- Property budgets and actual-versus-budget comparison.
- Management fee calculation, earned totals, received totals, and outstanding totals.
- Rent roll and operational financial reports.

Out of scope:

- Management-company profit and loss.
- Payroll, office costs, company overhead, fixed assets, or tax accounting.
- Product-facing charts of accounts, trial balance, balance sheet, or general ledger.
- Bank reconciliation and ERP workflows.
- Automatic QuickBooks synchronization in the first release.

QuickBooks remains the presumed authority for the management company's formal books. Initial Nestory workflows stop at property reports and operational management-fee totals; the client enters relevant totals into QuickBooks manually.

## Reporting Basis

Cash basis is the default reporting mode because it matches the client's current owner reporting.

- Property income is recognized in dashboard totals when a receipt is recorded.
- Property expense is recognized in dashboard totals when a payment is recorded.
- Unpaid rent is shown separately as arrears.
- Unpaid vendor invoices are shown separately as outstanding bills.
- Security deposits are excluded from income and operating profit.
- Management fees appear as property expenses on the owner view and as lightweight fee-earned or fee-outstanding metrics for the property manager.

The default reporting period is the current calendar month. The header provides previous-month comparison and quick access to quarter, year-to-date, and custom date ranges.

## Information Architecture

### Portfolio

Primary question: **How is each property performing overall?**

The default Overview route displays:

- Portfolio net cash.
- Rent received and collection rate.
- Property expenses paid.
- Outstanding arrears.
- Management fees earned and outstanding.
- A ranked property scorecard.
- Financial and record-readiness exceptions.
- Selected-property cash explanation.

The property scorecard is the dominant surface. It includes property, collection rate, cash income, cash expenses, net cash, management fee, budget variance when available, and an explicit status label.

### Property Finance

Primary question: **Where is property money coming from and going?**

Property Finance contains these URL-backed subviews:

- Collections.
- Expenses.
- Management fees.
- Owner statements.
- Property transactions.

The existing product-facing Company P&L view is removed. Property Ranking moves into Portfolio. Owner Receivables is replaced by property-scoped owner balances and management-fee status. Ledger is presented as Property transactions rather than a general ledger.

### Leasing

Primary question: **Which properties have vacancy, lease, or collection risk?**

The Leasing lens shows occupancy, vacant units, leases ending soon, leases missing required links, rent exposure, and a property-ranked leasing queue. It links to the exact lease or unit workflow needed to resolve each item.

### Maintenance

Primary question: **Which properties have repair pressure and what is its cash impact?**

The Maintenance lens shows open cases, overdue work, paid maintenance expense for the selected period, unpaid property-related invoices, and property-ranked maintenance pressure. It links to maintenance cases, bills, and property records.

### Records

Primary question: **Which properties are not ready for reliable owner reporting?**

The Records lens shows missing owner links, receipts, documents, deposit records, uncategorized transactions, and owner-statement blockers. Completed items remain visually quiet so unresolved work receives attention.

## Shared Lens Layout

Every lens uses the same hierarchy:

1. Compact page header with period, property, and relevant review filters.
2. URL-backed lens navigation.
3. A compact metric strip with no more than five primary metrics.
4. A ranked property table or operational queue as the largest surface.
5. A right-side attention and readiness column on wide desktop.
6. A selected-property explanation or direct workflow links below the main table.

Changing a lens changes the data and labels, not the fundamental page grammar.

Charts remain supporting evidence. They do not displace the ranked property table above the fold.

## URL Contracts

Existing lens values remain valid:

- `/overview` for Portfolio.
- `/overview?lens=finance` for Property finance.
- `/overview?lens=leasing`.
- `/overview?lens=maintenance`.
- `/overview?lens=records`.

New Finance subview values are:

- `collections`.
- `expenses`.
- `management-fees`.
- `owner-statements`.
- `transactions`.

Legacy Finance subview values normalize as follows:

- `company-pnl` to `collections`.
- `property-ranking` to Portfolio.
- `owner-receivables` to `management-fees`.
- `ledger` to `transactions`.

Shared URL state uses:

- `month=YYYY-MM` for the default monthly period.
- `propertyId=<uuid>` for property focus.
- `review=<allowed-value>` for actionable queues.

Unknown or repeated values normalize to safe defaults. Selection and filters remain shareable and browser-navigable.

## Metric Definitions

### Portfolio Net Cash

Cash receipts attributed to property operations, excluding security deposits and owner contributions, minus paid property expenses for the selected period. Management fees charged to the property are included as property expenses.

### Collection Rate

Rent allocated to charges due in the selected period divided by total rent charged for that period. This is an operational collection metric, not a cash-basis income-recognition rule.

### Property Expenses

Property-scoped invoice payments and other approved property cash outflows in the selected period. Management-company payroll and overhead never enter this total.

### Arrears

Outstanding rent-charge balance after allocations, with aging available for review queues.

### Management Fees

Fees calculated or recorded against managed properties. The UI distinguishes earned, received, and outstanding amounts without attempting to calculate management-company profit.

### Security Deposits

Deposits received, held, applied, retained, or refunded are displayed separately and never included in property income or net cash.

## Event-Based Finance Model

The long-term source model separates obligations from settlement events:

- Rent charges and other property income obligations.
- Vendor invoices and other property expense obligations.
- Receipt events.
- Payment events.
- Receipt-to-charge allocations.
- Payment-to-invoice allocations.
- Deposit events linked to lease deposit obligations.

Cash-basis reporting uses settlement-event dates. Future accrual reporting can use charge and invoice dates without replacing the schema.

The current `finance_income_items` and `finance_expense_items` records already distinguish due or invoice dates from received or paid dates, but they aggregate settlement values onto obligation rows. The implementation adds independent settlement records before changing Overview totals:

- `finance_receipts` records incoming cash events.
- `finance_receipt_allocations` links receipts to one or more income items.
- `finance_payments` records outgoing property cash events.
- `finance_payment_allocations` links payments to one or more expense items.
- `lease_deposit_events` records deposit receipt, application, retention, and refund events separately from income.

Each table is organization-scoped, RLS-protected, currency-safe, and linked to the relevant property. Allocation totals cannot exceed their settlement event or target obligation. Reversals create traceable correcting events rather than deleting cash history.

Existing received and paid values are backfilled into one settlement event and one allocation per populated obligation. Existing aggregate columns remain compatibility values during migration and are maintained from allocation totals; new Overview calculations use settlement and allocation records as their source. This makes cash reporting event-based now and allows future accrual reporting to use obligation dates without another structural migration.

## Existing Accounting Kernel

The current repository contains client and management-company accounting books and balanced journal infrastructure. The redesigned Overview will not expose Company P&L, journal health, accounting periods, or general-ledger concepts.

This UI slice does not destructively remove existing accounting tables or historical postings. It stops extending them as product-facing company-accounting features. Retirement or simplification requires a separate migration plan that proves no property workflow, report, or historical link will be damaged.

## Budgets and Owner Statements

Property budgets and owner-statement readiness are visible only when backed by real records.

The first Overview implementation may show a neutral unavailable state for budget variance because no property-budget model currently exists. It must not fabricate zero variance.

Owner-statement readiness is derived from explicit checks, including unresolved arrears exceptions, unpaid or unapproved bills, missing receipts, missing owner links, incomplete deposit records, and uncategorized transactions. Ready properties link to the existing owner-statement report. This slice does not add owner distributions or a new financial period-lock workflow.

## Visual System and Brandability

- Use existing semantic tokens such as background, surface, border, foreground, muted foreground, accent, success, warning, and danger.
- Use existing typography and spacing scales.
- Use shared primitives from `src/components/ui`.
- Do not use hard-coded mockup colors in production components.
- Do not use gradients, oversized cards, ornamental illustrations, or marketing composition.
- Use color only as a secondary status signal paired with text, numbers, or icons.
- Preserve compact desktop density and usable mobile stacking.
- Keep primary records and exact next actions early in the viewport.

Future organization branding should be able to replace token values without changing feature components.

## Interaction and State

- Entire scorecard rows may select a property for the explanation panel.
- The property name remains a direct link to the full property record.
- Keyboard focus and selected-row state remain distinct.
- Filters and selection are URL-backed.
- Empty, loading, partial-data, blocked, and error states are explicit.
- Empty states explain which source records are missing and provide the exact next action.
- Every attention item links to the filtered workflow that resolves it.
- Long property, owner, vendor, and document labels truncate or wrap deliberately.

## Responsive Behavior

- Wide desktop uses the scorecard plus a fixed-width attention column.
- Narrow desktop and tablet stack the attention column below the scorecard.
- Mobile uses compact property cards rather than forcing the full desktop table into the viewport.
- The metric strip wraps without changing metric meaning.
- Detailed cash explanation becomes a vertical list on small screens.

## Implementation Scope

The approved Overview implementation includes:

- Relabeling the stable lenses.
- Replacing Company P&L presentation with property-scoped finance views.
- Promoting property performance ranking to the default Portfolio lens.
- Adding URL-backed month, property, review, and Finance-subview normalization.
- Adding independent receipt, payment, deposit-event, and allocation records with compatibility backfill.
- Building cash-basis property summaries from real current records.
- Reusing existing attention, chart, money, badge, and shared control primitives where they fit.
- Updating focused component, filter, data-loader, and route tests.
- Updating current-state documentation to reflect the new product boundary and Overview behavior.

It excludes destructive accounting-kernel removal, QuickBooks integration, and production budget entry. Those require separate implementation slices.

## Verification

Focused automated coverage must prove:

- Cash receipts and paid expenses drive Portfolio totals.
- Deposits and owner contributions are excluded from operating income.
- Unpaid rent and bills remain separate from cash totals.
- Management fees appear as property expenses and lightweight operational fee metrics.
- Property rankings handle positive, negative, and incomplete data correctly.
- Legacy Finance URLs normalize to supported destinations.
- Lens, period, property, and review state remains URL-backed.
- Empty and partial-data states do not fabricate financial values.

Verification will include focused lint, TypeScript, Overview component tests, Overview data-loader tests, the full test suite, a production build, and authenticated browser checks at desktop and mobile widths.

## Success Criteria

The redesign succeeds when an operator can open Overview and, within ten seconds:

1. Identify which properties generated positive or negative cash for the owner.
2. See whether weak performance comes from arrears, vacancy, expenses, maintenance, or missing records.
3. Open the exact property or operational queue needed to investigate.
4. Understand management fees earned or outstanding without seeing management-company accounting.
5. Move between Portfolio, Property finance, Leasing, Maintenance, and Records without learning a different layout.
