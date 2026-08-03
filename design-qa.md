# Finance UX First Slice Design QA

Date: 2026-08-03

## Source and scope

- Accepted source: `C:\Users\USer\.codex\visualizations\2026\08\03\019fc5d0-56c2-7ed1-acea-00d150db0994\wireframes.png`
- Rendered routes: `/rent-income?month=2026-07` and `/bills-expenses?month=2026-07`
- Primary viewport: `1440x900`
- Narrow laptop check: `1280x800`
- Combined comparison: `C:\Users\USer\.codex\visualizations\2026\08\03\019fc5d0-56c2-7ed1-acea-00d150db0994\finance-design-comparison.png`

## Comparison result

The rendered slice matches the accepted structural target:

- the existing Nestory global shell remains intact;
- Finance uses short horizontal local navigation;
- Rent and Expenses are full-width list pages with compact inline totals;
- row detail and write actions use one centered modal instead of a split
  inspector or side drawer;
- the payment modal presents only the decision-critical party, balance, date,
  amount, account, and reference fields;
- Add expense is split into `Expense details` and `Responsibility and review`
  so the operator does not face every field at once.

Deliberate differences from the low-fidelity wireframe:

- the implementation keeps the current Nestory tokens, dark theme, typography,
  spacing, and icon library instead of copying the wireframe's presentation;
- table rows use seeded operational records and the exact existing financial
  values rather than mock figures;
- unsupported owner balances, direct-owner rent collection, tenant invoices,
  management-fee calculation, and markup persistence remain absent;
- the current expense action still preserves all existing responsibility and
  recovery fields, but moves secondary fields to step 2.

## Interaction and layout checks

- Authenticated seeded data rendered: 8 Rent rows and 5 Expense rows.
- Row preview opened one accessible detail dialog on both routes.
- Detail-to-payment transitions kept exactly one dialog open.
- Closing a write modal returned focus to the initiating preview control in the
  focused component suites.
- Expense filters opened and dismissed with Escape.
- Add expense advanced from step 1 to step 2 and returned with Back.
- At 1280px, `documentElement` and `body` both reported equal client and scroll
  widths on Rent and Expenses; there was no document-level horizontal overflow.
- Browser console warnings/errors after the checked flows: none.

## Verification boundary

This is a presentation-only slice. It adds no schema migration and does not
change loaders, server-action payloads, RPCs, exact-money handling, URLs, or
financial authority.

final result: passed
